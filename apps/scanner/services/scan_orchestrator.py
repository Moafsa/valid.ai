import asyncio
import time
from loguru import logger
from typing import List, Optional

from config import settings
from services.playwright_scraper import PlaywrightScraper
from services.screenshot_to_code_client import ScreenshotToCodeClient, CredentialProvider
from services.page_classifier import PageClassifier
from services.asset_uploader import AssetUploader
from services.cloaker_detector import CloakerDetector
from services.progress_store import ProgressStore
from services.html_utils import extract_body_html
from services.quiz_importer import QuizImporter
from services.credit_manager import CreditManager, DEFAULT_CREDIT_COSTS


class ScanOrchestrator:
    """
    Orchestrates the full scan + clone pipeline:
    1. Scrape page with Playwright
    2. Take screenshots per section
    3. Classify page type with GPT-4o Vision
    4. Convert each section screenshot to React code via screenshot-to-code
    5. Upload assets to S3
    6. Detect tracking pixels
    7. Save result to database
    """

    def __init__(self, job_id: str, project_id: str, url: str, workspace_id: Optional[str] = None):
        self.job_id = job_id
        self.project_id = project_id
        self.url = url
        self.workspace_id = workspace_id
        self.progress = ProgressStore()
        self.s2c = ScreenshotToCodeClient()
        self.classifier = PageClassifier()
        self.uploader = AssetUploader()
        self.credits = CreditManager(workspace_id) if workspace_id else None

    async def _charge(self, operation: str, description: str, model: Optional[str] = None):
        """
        Debits credits for one AI operation. CreditManager already does the
        real work (balance check, decrement, transaction + usage log) — it
        just never had a caller. Charging is best-effort: a billing hiccup
        here shouldn't fail a scan the user is actively watching progress on.
        Skipped entirely with no workspace_id (e.g. a bare scanner call in
        dev) since there'd be nothing to charge.
        """
        if not self.credits:
            return
        creds = await CredentialProvider.get()
        if not any(creds.get(k) for k in ("openai", "anthropic", "gemini", "replicate")):
            return  # no real AI key configured — nothing was actually spent
        try:
            await self.credits.debit(
                operation=operation,
                amount=DEFAULT_CREDIT_COSTS.get(operation, 1),
                description=description,
                project_id=self.project_id,
                model=model,
            )
        except Exception as e:
            logger.warning(f"[{self.job_id}] Credit debit failed for {operation}: {e}")

    async def update_status(self, status: str, progress: int, step: str, extra: dict = None):
        """Push a progress event to Redis."""
        event = {
            "job_id": self.job_id,
            "status": status,
            "progress": progress,
            "currentStep": step,
        }
        if extra:
            event.update(extra)
        await self.progress.push_event(self.job_id, event)
        logger.info(f"[{self.job_id}] {progress}% - {step}")

    async def run(self):
        """Main orchestration pipeline."""
        try:
            await self.update_status("scanning", 5, "🔍 Abrindo página com navegador stealth...")

            # ── Step 1: Scrape the page ──────────────────────────
            async with PlaywrightScraper(use_proxy=True) as scraper:
                scrape_result = await scraper.scrape_url(self.url)

            await self.update_status("scanning", 20, "📸 Screenshots capturadas. Classificando página...")

            # ── Step 2: Classify page type ───────────────────────
            classification = await self.classifier.classify(
                scrape_result["full_screenshot_b64"]
            )
            page_type = classification.get("page_type", "LP")
            if classification.get("notes") != "No AI key configured":
                await self._charge("scan_lp_classify", f"Classificação de página: {self.url}", model="gpt-4o")

            await self.update_status(
                "processing", 30,
                f"🎯 Tipo de página: {page_type}. Iniciando clonagem por seção..."
            )

            # ── Quiz branch ───────────────────────────────────────
            # A quiz isn't "one page with sections" — it's N steps, each
            # its own question/options/progress. Reusing the LP section
            # pipeline here would collapse it into a single static page,
            # exactly what the product spec says NOT to do. quiz_importer.py
            # already had the right logic (click through, GPT-4o Vision per
            # step) — it just never got called from anywhere until now.
            if page_type == "QUIZ":
                result = await self._run_quiz(classification)
                await self.update_status(
                    "done", 100,
                    f"✅ Clonagem completa! {len(result['quiz']['steps'])} etapas processadas.",
                    extra={"result": result}
                )
                logger.info(f"[{self.job_id}] Quiz scan complete: {len(result['quiz']['steps'])} steps")
                return

            # ── Step 3: Per-section classification + code generation
            sections = scrape_result["section_screenshots"]
            processed_sections = []
            total_sections = len(sections)

            for i, section in enumerate(sections):
                section_progress = 30 + int((i / total_sections) * 50)
                section_name = section.get("name", f"section_{i+1}")

                await self.update_status(
                    "processing",
                    section_progress,
                    f"🧩 Seção {i+1}/{total_sections}: convertendo para React..."
                )

                # Classify section type
                section_type = await self.classifier.classify_section(
                    section["screenshot_b64"],
                    i,
                    section.get("class_hint", "")
                )
                await self._charge("scan_section_classify", f"Classificação de seção {i+1}", model="gpt-4o-mini")

                # Convert screenshot → HTML+Tailwind. We request html_tailwind
                # (not react_tailwind): the app renders every block with
                # dangerouslySetInnerHTML as a plain HTML fragment, both in
                # the editor and on published pages — a React component
                # (imports, export default, JSX) would just show up broken.
                try:
                    raw_code = await self.s2c.screenshot_to_react(
                        screenshot_b64=section["screenshot_b64"],
                        stack="html_tailwind",
                    )
                    code = extract_body_html(raw_code)
                    await self._charge("scan_section_s2c", f"Geração de código - seção {i+1}")
                except Exception as e:
                    logger.error(f"S2C failed for section {i}: {e}")
                    code = None  # let the frontend fall back to the raw screenshot

                # Upload section screenshot to S3
                screenshot_url = await self.uploader.upload_base64(
                    data_b64=section["screenshot_b64"],
                    key=f"projects/{self.project_id}/screenshots/{section_name}.png",
                    content_type="image/png"
                )

                processed_sections.append({
                    "id": f"section_{i}",
                    "type": section_type,
                    "order": i,
                    "screenshot": screenshot_url,
                    "generatedCode": code,
                })

            # If the page has a VSL, add it as its own block rather than
            # trying to fit it into the generic screenshot→code pipeline —
            # a video needs its real source URL and play/25/50/75/100%
            # tracking, not a static screenshot standing in for it.
            video = scrape_result.get("video")
            if video and video.get("url"):
                processed_sections.append({
                    "id": f"section_{len(processed_sections)}",
                    "type": "vsl",
                    "order": len(processed_sections),
                    "screenshot": video.get("poster"),
                    "generatedCode": None,
                    "video": video,
                })
                logger.info(f"[{self.job_id}] Detected video: {video.get('type')} — {video.get('url')}")

            await self.update_status("processing", 82, "🔎 Verificando rastreamentos...")

            # ── Step 4: Build result ─────────────────────────────
            result = {
                "pageType": page_type,
                "classification": classification,
                "sections": processed_sections,
                "trackings": scrape_result["pixel_ids"],
                "hasCloaker": False,
                "assets": [],
            }

            await self.update_status(
                "done", 100,
                f"✅ Clonagem completa! {len(processed_sections)} seções processadas.",
                extra={"result": result}
            )

            logger.info(f"[{self.job_id}] Scan complete: {len(processed_sections)} sections")

        except Exception as e:
            logger.exception(f"[{self.job_id}] Scan failed: {e}")
            await self.update_status(
                "error", 0,
                f"❌ Erro: {str(e)}",
                extra={"error": str(e)}
            )

    async def _run_quiz(self, classification: dict) -> dict:
        """
        Runs the quiz-specific pipeline: click through each step, extract
        question/answers/progress via vision, upload each step's screenshot.
        Returns a result shaped as {"quiz": {...}} — a distinct shape from
        the LP {"sections": [...]} result, since the two are persisted very
        differently (finalize creates one Page per quiz step).
        """
        importer = QuizImporter()
        quiz_data = await importer.import_quiz(self.url)
        steps = quiz_data["steps"]

        processed_steps = []
        for i, step in enumerate(steps):
            progress = 30 + int((i / max(len(steps), 1)) * 50)
            await self.update_status(
                "processing", progress,
                f"🧩 Etapa {i + 1}/{len(steps)}: extraindo pergunta e respostas..."
            )

            screenshot_url = await self.uploader.upload_base64(
                data_b64=step.pop("screenshot_b64", ""),
                key=f"projects/{self.project_id}/screenshots/quiz_step_{i + 1}.png",
                content_type="image/png",
            ) if step.get("screenshot_b64") else None

            processed_steps.append({**step, "screenshot": screenshot_url})
            await self._charge("quiz_step_import", f"Importação de etapa {i+1} do quiz", model="gpt-4o")

        await self.update_status("processing", 82, "🔎 Verificando rastreamentos...")

        return {
            "pageType": "QUIZ",
            "classification": classification,
            "quiz": {
                "title": quiz_data.get("title", "Quiz Importado"),
                "steps": processed_steps,
                "totalSteps": len(processed_steps),
            },
            "trackings": [],
            "hasCloaker": False,
            "assets": [],
        }
