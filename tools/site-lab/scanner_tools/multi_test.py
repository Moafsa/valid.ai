import asyncio, sys
from playwright.async_api import async_playwright
pid, slug = sys.argv[1], sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)).new_page()
        pg.on('pageerror', lambda e: print('PAGEERR', str(e)[:120]))
        await pg.goto(f"http://web:3000/projects/{pid}/p/{slug}", wait_until="load"); await pg.wait_for_timeout(1500)
        n = await pg.locator('[data-vai-select]').count()
        kinds = await pg.evaluate("[...new Set([...document.querySelectorAll('[data-vai-select]')].map(e => e.getAttribute('data-vai-select')))]")
        print('options:', n, 'kinds:', kinds)
        base = await pg.evaluate("[...document.querySelectorAll('[data-vai-select]')].map(e => e.className)")
        async def lit():
            cur = await pg.evaluate("[...document.querySelectorAll('[data-vai-select]')].map(e => e.className)")
            return [i for i, (a, c) in enumerate(zip(base, cur)) if a != c]
        cont = pg.locator('button:has-text("CONTINUAR"), button:has-text("Continuar")').first
        async def cont_state():
            try: return 'enabled' if await cont.is_enabled() else 'disabled'
            except Exception: return '?'
        print('start: lit', await lit(), 'continue', await cont_state())
        steps = [3, 1, 3, 1, 5]
        for i in steps:
            await pg.locator('[data-vai-select]').nth(i).click(); await pg.wait_for_timeout(250)
            print(f'click option {i}: lit ->', await lit(), '| continue', await cont_state())
        await pg.screenshot(path='/tmp/shots/multi_after.png')
        await b.close()
asyncio.run(main())
