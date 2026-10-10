import asyncio, sys, re
sys.path.insert(0, "/app")
from services.playwright_scraper import PlaywrightScraper
async def main():
    async with PlaywrightScraper(use_proxy=False) as sc:
        r = await sc.scrape_url(sys.argv[1], capture_thumbnail=False, try_funnel=False)
    for i, s in enumerate(r["sections"]):
        h = s["dom_html"]
        print(i, len(h), 'BADGE' if 'grecaptcha-badge' in h else '', h[:100].replace(chr(10),' '))
asyncio.run(main())
