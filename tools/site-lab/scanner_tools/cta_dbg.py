import asyncio, sys
sys.path.insert(0, '/app')
from services.playwright_scraper import PlaywrightScraper
from services.behavior_probe import BehaviorProbe, LIST_CTAS_JS
async def main():
    url = sys.argv[1]
    async with PlaywrightScraper() as sc:
        pr = BehaviorProbe(sc, url)
        context, page, navs, outs, dialogs, popups = await pr._fresh(False)
        await page.wait_for_timeout(2000)
        print('candidates:', await page.evaluate(LIST_CTAS_JS))
        print('all clickables:', await page.evaluate("[...document.querySelectorAll('button,a,[onclick],[role=button],div,span')].filter(e => /toca|abrir|comprar|quero/i.test(e.innerText||'') && e.children.length < 3).map(e => e.tagName + '.' + String(e.className).slice(0,30) + ' onclick=' + !!e.onclick + ' | ' + (e.innerText||'').slice(0,40)).slice(0,10)"))
        await context.close()
        print('ctas():', await pr.ctas())
asyncio.run(main())
