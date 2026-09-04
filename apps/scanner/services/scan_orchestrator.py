import asyncio
import time
from loguru import logger
from typing import List, Optional

from config import settings
from services.playwright_scraper import PlaywrightScraper
from services.screenshot_to_code_client import ScreenshotToCodeClient
from services.page_classifier import PageClassifier
from services.asset_uploader import AssetUploader
from services.cloaker_detector import CloakerDetector
from services.progress_store import ProgressStore


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

    def __init__(self, job_id: str, project_id: str, url: str):
        self.job_id = job_id
        self.project_id = project_id
        self.url = url
        self.progress = ProgressStore()
        self.s2c = ScreenshotToCodeClient()
        self.classifier = PageClassifier()
        self.uploader = AssetUploader()

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

            await self.update_status(
                "processing", 30,
                f"🎯 Tipo de página: {page_type}. Iniciando clonagem por seção..."
            )

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

                # Convert screenshot → React+Tailwind code
                try:
                    code = await self.s2c.screenshot_to_react(
                        screenshot_b64=section["screenshot_b64"],
                        stack="react_tailwind",
                    )
                except Exception as e:
                    logger.error(f"S2C failed for section {i}: {e}")
                    code = f"<!-- Section {i+1}: code generation failed -->"

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
