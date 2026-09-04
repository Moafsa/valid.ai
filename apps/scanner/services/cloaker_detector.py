import difflib
from loguru import logger
from openai import AsyncOpenAI
from typing import Optional

from config import settings
from services.playwright_scraper import PlaywrightScraper

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None


class CloakerDetector:
    """
    Detects cloaking by comparing two versions of the same page:
    Version A: accessed without UTM params (simulates bot/reviewer)
    Version B: accessed with realistic UTM params (simulates real traffic)
    """

    BOT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
    }

    REAL_UTM_SUFFIX = "?utm_source=fb&utm_medium=cpc&utm_campaign=test&fbclid=test123"

    async def analyze(self, url: str) -> dict:
        logger.info(f"Analyzing cloaker for: {url}")

        # Access A: no UTM (bot-like)
        html_a = await self._fetch_html(url, use_real_browser=False)

        # Access B: with UTM (real traffic simulation)
        url_with_utm = url + ("&" if "?" in url else "?") + "utm_source=fb&utm_medium=cpc&fbclid=abc123"
        html_b = await self._fetch_html(url_with_utm, use_real_browser=True)

        # Compare
        diff_ratio = self._compare_html(html_a, html_b)
        cloaker_detected = diff_ratio < 0.85  # More than 15% difference

        details = ""
        if cloaker_detected and client:
            details = await self._analyze_diff_with_ai(html_a, html_b)

        result = {
            "detected": cloaker_detected,
            "similarity_ratio": round(diff_ratio, 4),
            "version_a_length": len(html_a),
            "version_b_length": len(html_b),
            "ai_analysis": details,
        }

        logger.info(f"Cloaker result: detected={cloaker_detected}, similarity={diff_ratio:.2%}")
        return result

    async def _fetch_html(self, url: str, use_real_browser: bool) -> str:
        """Fetch page HTML either with a real browser or simple HTTP."""
        if use_real_browser:
            async with PlaywrightScraper(use_proxy=True) as scraper:
                result = await scraper.scrape_url(url)
                return result["html"]
        else:
            import httpx
            async with httpx.AsyncClient(follow_redirects=True, timeout=20) as c:
                resp = await c.get(url, headers=self.BOT_HEADERS)
                return resp.text

    def _compare_html(self, html_a: str, html_b: str) -> float:
        """Returns similarity ratio between 0 (totally different) and 1 (identical)."""
        seq = difflib.SequenceMatcher(
            None,
            html_a[:50000],  # Compare first 50KB
            html_b[:50000]
        )
        return seq.ratio()

    async def _analyze_diff_with_ai(self, html_a: str, html_b: str) -> str:
        """Use GPT-4o to explain the differences between both page versions."""
        prompt = f"""
You are analyzing two versions of the same URL:
- Version A: accessed without UTM params (might be shown to reviewers/bots)
- Version B: accessed with UTM params from paid ads (real traffic)

Version A snippet (first 2000 chars):
{html_a[:2000]}

Version B snippet (first 2000 chars):
{html_b[:2000]}

Describe in 2-3 sentences what differences you detect, and whether this looks like cloaking.
Be specific: different content? Different redirect? Different product being promoted?
"""
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.choices[0].message.content.strip()
