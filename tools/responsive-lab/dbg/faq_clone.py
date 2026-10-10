import asyncio, sys, json
from playwright.async_api import async_playwright
URL = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        await pg.goto(URL, wait_until="load", timeout=60000)
        await pg.wait_for_timeout(3000)
        await pg.evaluate("async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120))}}")
        loc = pg.locator('[data-framer-name="Closed"]').first
        print("items:", await pg.locator('[data-framer-name="Closed"]').count(), "mx attrs:", await pg.locator('[data-vai-mx]').count())
        await loc.scroll_into_view_if_needed(); await pg.wait_for_timeout(800)
        box = await loc.bounding_box()
        await pg.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        await pg.wait_for_timeout(1000)
        print("open after click:", await pg.locator('[data-framer-name="Open"]').count(), "| answer visible:", await pg.evaluate("() => /Não\\. A IA Lendária foi feita/.test(document.body.innerText)"))
        await b.close()
asyncio.run(main())
