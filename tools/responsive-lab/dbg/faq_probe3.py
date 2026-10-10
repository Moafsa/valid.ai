import asyncio, sys, json
from playwright.async_api import async_playwright
URL = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        await pg.goto(URL, wait_until="load", timeout=60000)
        await pg.wait_for_timeout(4000)
        await pg.evaluate("async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120))}}")
        await pg.evaluate("() => window.scrollTo(0, 5100)")
        await pg.wait_for_timeout(1500)
        loc = pg.locator('[data-framer-name="Closed"]').first
        html0 = await loc.evaluate("e => e.parentElement.outerHTML")
        box = await loc.bounding_box()
        print("box", box)
        await pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        await pg.mouse.down(); await pg.mouse.up()
        await pg.wait_for_timeout(1200)
        res = await pg.evaluate("""() => { const open = document.querySelectorAll('[data-framer-name="Open"]'); return { open: open.length, h: document.documentElement.scrollHeight } }""")
        print(res)
        parent = pg.locator('[data-framer-name="Open"]').first
        if await parent.count():
            html1 = await parent.evaluate("e => e.parentElement.outerHTML")
            print("closed html len", len(html0), "open html len", len(html1))
            print("CLOSED:", html0[:1200].replace("\n", " "))
            print("OPEN:", html1[:2200].replace("\n", " "))
        await b.close()
asyncio.run(main())
