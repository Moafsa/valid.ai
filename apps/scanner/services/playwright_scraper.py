from playwright.async_api import async_playwright, Browser, Page
from loguru import logger
from typing import Optional, List, Tuple
import asyncio
import base64
from pathlib import Path
import tempfile

from config import settings


class PlaywrightScraper:
    """
    Stealth browser scraper using Playwright.
    Captures full page and per-section screenshots.
    Extracts HTML, scripts, and metadata.
    """

    # Viewport mimicking a real desktop user
    VIEWPORT = {"width": 1440, "height": 900}

    # Realistic user agent
    USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    )

    def __init__(self, use_proxy: bool = False):
        self.use_proxy = use_proxy and bool(settings.PROXY_URL)
        self._browser: Optional[Browser] = None

    async def __aenter__(self):
        self._playwright = await async_playwright().start()

        launch_kwargs = {
            "headless": True,
            "args": [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ]
        }

        if self.use_proxy:
            launch_kwargs["proxy"] = {"server": settings.PROXY_URL}

        self._browser = await self._playwright.chromium.launch(**launch_kwargs)
        return self

    async def __aexit__(self, *args):
        if self._browser:
            await self._browser.close()
        await self._playwright.stop()

    async def get_page(self) -> Page:
        context = await self._browser.new_context(
            viewport=self.VIEWPORT,
            user_agent=self.USER_AGENT,
            locale="pt-BR",
            timezone_id="America/Sao_Paulo",
            extra_http_headers={
                "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
            }
        )
        # Mask automation flags
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
            Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'en-US', 'en'] })
        """)
        return await context.new_page()

    async def scrape_url(self, url: str) -> dict:
        """
        Loads a page and returns:
        - full_screenshot: base64 PNG of the full page
        - html: raw HTML source
        - section_screenshots: list of {name, screenshot_b64} per section
        - detected_scripts: list of external script URLs found
        - pixel_ids: detected tracking pixel IDs
        """
        logger.info(f"Scraping URL: {url}")
        page = await self.get_page()

        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(2000)  # Extra wait for dynamic content

            # Scroll to load lazy images
            await self._scroll_page(page)

            # Get full HTML
            html = await page.content()

            # Full page screenshot
            full_screenshot_bytes = await page.screenshot(full_page=True)
            full_screenshot_b64 = base64.b64encode(full_screenshot_bytes).decode()

            # Per-section screenshots
            section_screenshots = await self._capture_sections(page)

            # Extract external scripts and pixels
            scripts = await self._extract_scripts(page)
            pixel_ids = await self._detect_pixels(page, html)

            logger.info(f"Scrape complete: {len(section_screenshots)} sections found")

            return {
                "html": html,
                "full_screenshot_b64": full_screenshot_b64,
                "section_screenshots": section_screenshots,
                "scripts": scripts,
                "pixel_ids": pixel_ids,
            }

        finally:
            await page.close()

    async def _scroll_page(self, page: Page):
        """Scroll down the page to trigger lazy loading."""
        await page.evaluate("""
            async () => {
                await new Promise((resolve) => {
                    let totalHeight = 0;
                    const distance = 300;
                    const timer = setInterval(() => {
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= document.body.scrollHeight) {
                            clearInterval(timer);
                            window.scrollTo(0, 0);
                            resolve();
                        }
                    }, 100);
                });
            }
        """)
        await page.wait_for_timeout(1000)

    async def _capture_sections(self, page: Page) -> List[dict]:
        """
        Identifies major visual sections and takes individual screenshots.
        Uses semantic HTML elements and visual breaks.
        """
        # Try to find semantic sections
        sections = await page.evaluate("""
            () => {
                const candidates = [
                    ...document.querySelectorAll(
                        'section, [class*="section"], [class*="block"], [class*="hero"], '
                        '[class*="benefit"], [class*="testimonial"], [class*="faq"], '
                        '[class*="cta"], [class*="footer"], header, footer, main > div'
                    )
                ];

                return candidates
                    .filter(el => {
                        const rect = el.getBoundingClientRect();
                        const style = window.getComputedStyle(el);
                        return (
                            rect.height > 100 &&
                            rect.width > 400 &&
                            style.display !== 'none' &&
                            style.visibility !== 'hidden'
                        );
                    })
                    .map((el, i) => ({
                        index: i,
                        tag: el.tagName,
                        className: el.className.substring(0, 100),
                        rect: el.getBoundingClientRect()
                    }));
            }
        """)

        screenshots = []
        page_height = await page.evaluate("document.body.scrollHeight")

        # If no sections found, split full page into 900px chunks
        if not sections:
            chunk_size = 900
            num_chunks = max(1, page_height // chunk_size)
            for i in range(num_chunks):
                y = i * chunk_size
                await page.evaluate(f"window.scrollTo(0, {y})")
                await page.wait_for_timeout(300)
                chunk_bytes = await page.screenshot(clip={
                    "x": 0, "y": 0,
                    "width": self.VIEWPORT["width"],
                    "height": min(chunk_size, page_height - y)
                })
                screenshots.append({
                    "name": f"section_{i+1}",
                    "screenshot_b64": base64.b64encode(chunk_bytes).decode()
                })
            return screenshots

        # Capture each detected section
        for section in sections[:15]:  # Cap at 15 sections
            try:
                rect = section["rect"]
                if rect["height"] < 50:
                    continue

                # Scroll section into view
                await page.evaluate(f"window.scrollTo(0, {rect['y']} - 20)")
                await page.wait_for_timeout(300)

                shot = await page.screenshot(clip={
                    "x": max(0, rect["x"]),
                    "y": max(0, rect["y"]),
                    "width": min(rect["width"], self.VIEWPORT["width"]),
                    "height": min(rect["height"], 1200)
                })

                screenshots.append({
                    "name": f"section_{section['index']+1}_{section['tag'].lower()}",
                    "class_hint": section["className"],
                    "screenshot_b64": base64.b64encode(shot).decode()
                })
            except Exception as e:
                logger.warning(f"Failed to capture section {section}: {e}")

        return screenshots

    async def _extract_scripts(self, page: Page) -> List[str]:
        """Extract all external script URLs."""
        return await page.evaluate("""
            () => Array.from(document.scripts)
                .map(s => s.src)
                .filter(s => s && s.startsWith('http'))
        """)

    async def _detect_pixels(self, page: Page, html: str) -> List[dict]:
        """Detect common tracking pixels from HTML and window vars."""
        import re
        pixels = []

        # Meta Pixel
        meta_match = re.search(
            r"fbq\s*\(\s*['\"]init['\"]\s*,\s*['\"]?(\d{10,20})",
            html
        )
        if meta_match:
            pixels.append({"type": "meta_pixel", "id": meta_match.group(1)})

        # TikTok Pixel
        tiktok_match = re.search(
            r"ttq\.load\s*\(\s*['\"]([A-Z0-9]{20,})",
            html
        )
        if tiktok_match:
            pixels.append({"type": "tiktok_pixel", "id": tiktok_match.group(1)})

        # Google Tag Manager
        gtm_match = re.search(r"GTM-([A-Z0-9]+)", html)
        if gtm_match:
            pixels.append({"type": "gtm", "id": f"GTM-{gtm_match.group(1)}"})

        # Google Analytics GA4
        ga4_match = re.search(r"G-([A-Z0-9]+)", html)
        if ga4_match:
            pixels.append({"type": "google_analytics", "id": f"G-{ga4_match.group(1)}"})

        return pixels
