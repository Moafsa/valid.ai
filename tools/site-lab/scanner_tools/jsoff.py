import asyncio, sys
sys.path.insert(0, '/app')
from services.playwright_scraper import PlaywrightScraper
async def main():
    for js in (True, False):
        try:
            async with PlaywrightScraper(js=js) as sc:
                r = await sc.scrape_url(sys.argv[1], capture_thumbnail=False, try_funnel=False)
            print('js', js, 'sections', len(r['sections']), [len(s['dom_html']) for s in r['sections']][:5])
        except Exception as e:
            print('js', js, 'ERROR', repr(e)[:200])
asyncio.run(main())
