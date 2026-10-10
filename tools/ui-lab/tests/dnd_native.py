import asyncio, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve
from playwright.async_api import async_playwright
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1200, "height": 800})
        await pg.goto("http://127.0.0.1:8123/gjs/plain.html")
        await pg.wait_for_selector(".gjs-frame")
        await pg.wait_for_timeout(1500)
        await pg.locator(".gjs-block").first.drag_to(pg.locator(".gjs-frame"), target_position={"x": 300, "y": 100}, force=True)
        await pg.wait_for_timeout(1000)
        print("native dropped:", await pg.evaluate("() => ed.Canvas.getDocument().body.innerText.includes('DROPPED-NATIVE')"))
        await b.close()
    srv.terminate()
asyncio.run(main())
