"""
Quiz Importer Service — scans dynamic quizzes step by step using Playwright.
Takes screenshot of each step, uses GPT-4o Vision to extract questions, options,
images, progress bar, and converts into FunnelAI Quiz Engine format.
"""
from loguru import logger
from openai import AsyncOpenAI
import json
import base64
from typing import List, Dict, Any, Optional

from services.playwright_scraper import PlaywrightScraper
from services.screenshot_to_code_client import ScreenshotToCodeClient, CredentialProvider
from services.html_utils import extract_body_html


async def _get_client() -> Optional[AsyncOpenAI]:
    """Reads the superadmin-configured key instead of the static .env one."""
    creds = await CredentialProvider.get()
    api_key = creds.get("openai")
    return AsyncOpenAI(api_key=api_key) if api_key else None


class QuizImporter:
    """
    Scans a multi-step quiz by clicking through options and taking screenshots.
    Reconstructs the full quiz tree with conditional branching logic.
    """

    QUIZ_STEP_PROMPT = """
You are an expert quiz scanner analyzing a screenshot of ONE step of a marketing quiz.
Extract:
1. The question text (headline)
2. Question subtitle/description if present
3. All answer options (texts, images, values)
4. Question type: "single", "multiple", "scale", "text", or "image-choice"
5. Progress bar percentage if visible (0-100)
6. If this step has a lead capture form (name/email/phone input)

Respond ONLY with valid JSON:
{
  "question": "Qual é seu maior objetivo?",
  "subtitle": "Selecione uma opção abaixo",
  "questionType": "single",
  "progressPercent": 25,
  "hasLeadCapture": false,
  "answers": [
    { "id": "ans_1", "text": "Emagrecer rápido", "value": "weight_loss" },
    { "id": "ans_2", "text": "Ganhar massa", "value": "muscle_gain" }
  ]
}
"""

    async def import_quiz(self, url: str, max_steps: int = 15) -> Dict[str, Any]:
        logger.info(f"Starting quiz import for: {url}")
        steps = []
        s2c = ScreenshotToCodeClient()

        async with PlaywrightScraper(use_proxy=True) as scraper:
            page = await scraper.get_page()
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(2000)

            for step_idx in range(max_steps):
                logger.info(f"Scanning quiz step {step_idx + 1}")

                # Take screenshot of current step
                shot_bytes = await page.screenshot(full_page=False)
                shot_b64 = base64.b64encode(shot_bytes).decode()

                # Extract step data via GPT-4o Vision
                step_data = await self._analyze_step_vision(shot_b64)
                step_data["id"] = f"step_{step_idx + 1}"
                step_data["order"] = step_idx
                step_data["screenshot_b64"] = shot_b64  # uploaded to S3 by the caller

                # Generate the step's visual background via screenshot-to-code.
                # This is only decorative (the actual question/answers are
                # rendered by the quiz player from step_data, not from this
                # HTML) — it gives the step a matching background/styling.
                try:
                    step_code = await s2c.screenshot_to_react(shot_b64, stack="html_tailwind")
                    step_data["generatedCode"] = extract_body_html(step_code)
                except Exception as e:
                    logger.warning(f"S2C failed for quiz step {step_idx + 1}: {e}")
                    step_data["generatedCode"] = ""

                steps.append(step_data)

                # Try to click an option to advance to the next step. A click
                # "succeeding" isn't proof the quiz actually moved on — e.g. a
                # generic container div can match one of the selectors below
                # and absorb the click with no effect — so we additionally
                # compare the DOM before/after and only count it as real
                # progress if something actually changed.
                html_before = await page.content()
                advanced = await self._click_next_option(page)
                if advanced:
                    await page.wait_for_timeout(1500)
                    html_after = await page.content()
                    if html_after == html_before:
                        logger.info(f"Click on step {step_idx + 1} had no effect — treating as final step")
                        advanced = False

                if not advanced:
                    logger.info(f"Quiz reached final step at step {step_idx + 1}")
                    break

        logger.info(f"Quiz import complete: {len(steps)} steps extracted")
        return {
            "title": steps[0]["question"] if steps else "Quiz Importado",
            "steps": steps,
            "totalSteps": len(steps),
        }

    async def _analyze_step_vision(self, shot_b64: str) -> Dict[str, Any]:
        client = await _get_client()
        if not client:
            return {
                "question": "Pergunta do Quiz",
                "subtitle": "",
                "questionType": "single",
                "progressPercent": 0,
                "hasLeadCapture": False,
                "answers": [{"id": "a1", "text": "Opção 1", "value": "v1"}],
            }
        try:
            resp = await client.chat.completions.create(
                model="gpt-4o",
                max_tokens=600,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": self.QUIZ_STEP_PROMPT},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{shot_b64}", "detail": "low"}}
                    ]
                }]
            )
            raw = resp.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(raw)
        except Exception as e:
            logger.error(f"Quiz step vision analysis failed: {e}")
            return {
                "question": "Pergunta",
                "subtitle": "",
                "questionType": "single",
                "progressPercent": 0,
                "hasLeadCapture": False,
                "answers": [],
            }

    async def _click_next_option(self, page) -> bool:
        """Finds and clicks an option button or next button to advance the quiz."""
        selectors = [
            'button:not([disabled])',
            '[class*="option"]',
            '[class*="answer"]',
            '[class*="btn"]',
            'input[type="radio"]',
            # Deliberately no generic [class*="card"] — a step's own outer
            # wrapper is very often named *-card and stays in the DOM across
            # every step, so it used to "absorb" clicks that never actually
            # advanced anything (see the html_before/after check above,
            # which catches this class of bug regardless of selector choice).
        ]
        for sel in selectors:
            try:
                elements = await page.query_selector_all(sel)
                for el in elements:
                    if await el.is_visible():
                        text = await el.inner_text()
                        if len(text.strip()) > 1 and "voltar" not in text.lower():
                            await el.click()
                            return True
            except Exception:
                continue
        return False
