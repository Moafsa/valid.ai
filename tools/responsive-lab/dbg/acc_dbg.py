import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1280, "height": 900})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        await pg.goto(sys.argv[1], wait_until="load"); await pg.wait_for_timeout(1500)
        await pg.locator("#b1").scroll_into_view_if_needed()
        box = await pg.locator("#b1").bounding_box()
        await pg.mouse.click(box["x"] + 50, box["y"] + box["height"] / 2)
        await pg.wait_for_timeout(600)
        print(await pg.evaluate("() => { const p = document.getElementById('p1'); const cs = getComputedStyle(p); return { hidden: p.hidden, style: p.getAttribute('style'), display: cs.display, h: p.getBoundingClientRect().height, exp: document.getElementById('b1').getAttribute('aria-expanded'), mx: document.getElementById('b1').hasAttribute('data-vai-mx') } }"))
        print(errs)
        await b.close()
asyncio.run(main())
