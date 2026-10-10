import asyncio, sys, re
sys.path.insert(0, "/app")
from services.playwright_scraper import PlaywrightScraper
async def main():
    async with PlaywrightScraper(use_proxy=False) as sc:
        r = await sc.scrape_url(sys.argv[1], capture_thumbnail=False, try_funnel=True)
    if r.get("funnel"):
        f = r["funnel"]; print("FUNNEL steps", len(f["steps"]))
        for st in f["steps"]:
            h = st.get("html") or st.get("dom_html") or str(st)[:2000]
            print(' step', st.get("slug") or st.get("id"), len(h), 'BADGE' if 'grecaptcha-badge' in h else '', 'MKTO' if 'mkto' in h.lower() else '')
    else:
        print("PAGE", len(r["sections"]))
asyncio.run(main())
