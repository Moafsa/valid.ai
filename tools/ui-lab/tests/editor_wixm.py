import asyncio, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve, mock_api
from playwright.async_api import async_playwright
OUT = "/ui/shots"
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        logs = []
        pg.on("pageerror", lambda e: logs.append("PAGEERROR " + str(e)[:300]))
        await pg.route("**/api/**", mock_api)
        await pg.goto("http://127.0.0.1:8123/editor_wixm.html")
        await pg.wait_for_selector(".gjs-frame", timeout=45000)
        await pg.wait_for_timeout(5000)
        await pg.screenshot(path=f"{OUT}/50_wixm.png")
        print("\n".join(logs[:10]) or "no page errors")
        await b.close()
    srv.terminate()
asyncio.run(main())
