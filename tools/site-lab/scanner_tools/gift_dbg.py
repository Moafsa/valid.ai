import asyncio, sys
sys.path.insert(0, '/app')
from services.playwright_scraper import PlaywrightScraper
from services.behavior_probe import BehaviorProbe, CLICK_CTA_JS
async def main():
    async with PlaywrightScraper() as sc:
        pr = BehaviorProbe(sc, 'https://gluteobrasileno.online/presente.html')
        context, page, navs, outs, dialogs, popups = await pr._fresh(False)
        await page.wait_for_timeout(1500)
        print('click ok:', await page.evaluate(CLICK_CTA_JS, ['button', '👇 TOCA PARA ABRIR', 0]))
        for i in range(8):
            await page.wait_for_timeout(1500)
            print(f' +{(i+1)*1.5:.1f}s navs={[n[-40:] for n in navs[-2:]]} outs={outs[-1:]} popups={popups[-1:]} opens={await page.evaluate("(window.__probe && window.__probe.opens) || []")} text={(await page.inner_text("body"))[:90]!r}')
        await context.close()
asyncio.run(main())
