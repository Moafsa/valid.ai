from openai import AsyncOpenAI
from loguru import logger
import json
from typing import Optional

from config import settings

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


class PageClassifier:
    """
    Uses GPT-4o Vision to classify the page type and identify sections.
    """

    CLASSIFY_PROMPT = """
You are an expert at analyzing digital marketing pages.
Given a screenshot of a web page, identify:
1. The page type: LP (landing page), QUIZ (multi-step quiz funnel), VSL (video sales letter), CHECKOUT, or FUNNEL (multi-page)
2. The main sections visible (e.g., hero, benefits, testimonials, vsl, offer, faq, cta, footer)
3. If there's a video player, describe its position
4. If there's a form or lead capture

Respond ONLY with valid JSON in this exact format:
{
  "page_type": "LP",
  "confidence": 0.95,
  "sections": ["hero", "benefits", "vsl", "testimonials", "cta", "footer"],
  "has_video": true,
  "has_form": false,
  "has_quiz": false,
  "notes": "Standard LP with VSL in the middle section"
}
"""

    async def classify(self, screenshot_b64: str) -> dict:
        """
        Classifies the page type and sections from a screenshot.
        Returns a dict with page_type, sections, etc.
        """
        logger.info("Classifying page type...")

        try:
            response = await client.chat.completions.create(
                model="gpt-4o",
                max_tokens=500,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": self.CLASSIFY_PROMPT},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{screenshot_b64}",
                                    "detail": "low"
                                }
                            }
                        ]
                    }
                ]
            )

            raw = response.choices[0].message.content.strip()
            # Clean markdown code blocks if present
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

            result = json.loads(raw)
            logger.info(f"Page classified as: {result.get('page_type')} (confidence: {result.get('confidence')})")
            return result

        except Exception as e:
            logger.error(f"Classification failed: {e}")
            return {
                "page_type": "LP",
                "confidence": 0.5,
                "sections": ["hero", "cta", "footer"],
                "has_video": False,
                "has_form": False,
                "has_quiz": False,
                "notes": f"Classification failed: {e}"
            }

    async def classify_section(
        self,
        screenshot_b64: str,
        section_index: int,
        class_hint: str = ""
    ) -> str:
        """
        Classifies a single section type (hero, benefits, etc.)
        Returns one of: hero, benefits, testimonials, vsl, offer, faq, cta, footer, text, image
        """
        prompt = f"""
Given this screenshot of a single section of a landing page, identify what type of section it is.
Class hint from HTML: "{class_hint}"
Section index (0-based): {section_index}

Return ONLY one word from this list:
hero, benefits, testimonials, vsl, offer, faq, cta, footer, text, image, lead-capture, countdown

If you are not sure, return: text
"""
        try:
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                max_tokens=10,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{screenshot_b64}",
                                "detail": "low"
                            }
                        }
                    ]
                }]
            )
            section_type = response.choices[0].message.content.strip().lower()
            valid_types = {
                "hero", "benefits", "testimonials", "vsl", "offer",
                "faq", "cta", "footer", "text", "image", "lead-capture", "countdown"
            }
            return section_type if section_type in valid_types else "text"

        except Exception:
            return "text"
