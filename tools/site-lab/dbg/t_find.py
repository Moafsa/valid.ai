import asyncio, sys, re
sys.path.insert(0, "/app")
from services.playwright_scraper import PlaywrightScraper
async def main():
    async with PlaywrightScraper(use_proxy=False) as sc:
        r = await sc.scrape_url(sys.argv[1], capture_thumbnail=False, try_funnel=False)
    for i, s in enumerate(r["sections"]):
        h = s["dom_html"]
        m = re.search(sys.argv[2], h)
        if m:
            print("block", i, "len", len(h), "root:", h[:200].replace("\n", " "))
            st = h.rfind("<", 0, m.start() - 2500 if m.start() > 2500 else 0)
            seg = h[max(0, m.start() - 1800): m.start() + 100]
            tags = re.findall(r'<(?:div|section|aside|dialog)\b[^>]*>', seg)
            for t in tags[-8:]: print("   ", t[:260])
asyncio.run(main())
