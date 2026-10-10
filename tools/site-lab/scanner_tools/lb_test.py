import asyncio
from playwright.async_api import async_playwright
async def overlay_open(pg):
    return await pg.evaluate("(() => { const o = [...document.querySelectorAll('body > div')].find(d => d.style.zIndex === '2147483646'); return !!o && o.style.display !== 'none' })()")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for mode in ('landing', 'funnel'):
            pg = await (await b.new_context(viewport={"width": 500, "height": 900})).new_page()
            await pg.goto("http://172.18.0.1:8099/lb.html" + ('#funnel' if mode == 'funnel' else ''), wait_until="load"); await pg.wait_for_timeout(800)
            await pg.click('#plain'); await pg.wait_for_timeout(200)
            print(mode, 'plain photo opens lightbox:', await overlay_open(pg))
            if await overlay_open(pg):
                await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
                print(mode, '   Esc closes it:', not await overlay_open(pg))
            await pg.click('#cover'); await pg.wait_for_timeout(200)
            print(mode, 'cover next to a video opens lightbox (must be False):', await overlay_open(pg))
            await pg.click('#player', position={'x': 100, 'y': 100}); await pg.wait_for_timeout(200)
            print(mode, 'player poster opens lightbox (must be False):', await overlay_open(pg))
        await b.close()
asyncio.run(main())
