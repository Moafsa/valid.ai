import asyncio, sys, re
from playwright.async_api import async_playwright
pid = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={"width":390,"height":844})).new_page()
        await pg.goto(f"http://web:3000/projects/{pid}/p/etapa-20", wait_until="load")
        h1 = (await pg.inner_text('body'))[:80].replace('\n',' ')
        auto = await pg.evaluate("(() => { const e = document.querySelector('[data-vai-auto-to]'); return e ? [e.getAttribute('data-vai-auto-to'), e.getAttribute('data-vai-auto-after')] : null })()")
        hist = await pg.evaluate("document.querySelectorAll('[data-vai-hist]').length")
        print('screen:', h1, '| auto:', auto, '| hist leaves:', hist)
        for i in range(12):
            await pg.wait_for_timeout(1000)
            if not pg.url.endswith('etapa-20'): break
        print('after wait ->', pg.url.split('/p/')[-1], '|', (await pg.inner_text('body'))[:70].replace('\n',' '))
        await b.close()
asyncio.run(main())
