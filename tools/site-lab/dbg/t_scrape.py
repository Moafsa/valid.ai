import asyncio, sys, re, json
sys.path.insert(0, "/app")
from services.playwright_scraper import PlaywrightScraper
async def main():
    url = sys.argv[1]
    async with PlaywrightScraper(use_proxy=False) as sc:
        r = await sc.scrape_url(url, capture_thumbnail=False, try_funnel=False)
    html = " ".join(s.get("dom_html") or "" for s in r["sections"])
    text = re.sub(r"<[^>]+>", " ", html)
    print("sections", len(r["sections"]), "textlen", len(text), "mobile_variant", r.get("mobile_variant"))
    for pat in sys.argv[2:]:
        print(pat, len(re.findall(pat, text, re.I)))
asyncio.run(main())
