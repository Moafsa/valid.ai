import asyncio, sys
from playwright.async_api import async_playwright
url = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width":390,"height":844}, is_mobile=True)
        pg = await ctx.new_page()
        cdp = await ctx.new_cdp_session(pg)
        await cdp.send('Performance.enable'); await cdp.send('HeapProfiler.enable')
        await pg.goto(url, wait_until='load'); await pg.wait_for_timeout(2500)
        for i in range(24):
            try: await pg.locator('[data-vai-next]:visible').first.click(timeout=6000)
            except Exception: print('end'); break
            await pg.wait_for_timeout(900)
            if i % 4 == 3:
                await cdp.send('HeapProfiler.collectGarbage')
                mm = {x['name']: x['value'] for x in (await cdp.send('Performance.getMetrics'))['metrics']}
                live = await pg.evaluate("document.getElementsByTagName('*').length")
                print(f"after {i+1} steps: live DOM={live} allocated nodes={int(mm['Nodes'])} heap={mm['JSHeapUsedSize']/1048576:.1f}MB listeners={int(mm['JSEventListeners'])} docs={int(mm['Documents'])}")
        await b.close()
asyncio.run(main())
