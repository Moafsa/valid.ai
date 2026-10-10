import asyncio, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve, mock_api
from playwright.async_api import async_playwright
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for page_name in ("editor_wixm.html", "editor.html"):
            pg = await b.new_page(viewport={"width": 1440, "height": 900})
            await pg.route("**/api/**", mock_api)
            await pg.goto("http://127.0.0.1:8123/" + page_name)
            await pg.wait_for_selector(".gjs-frame", timeout=45000)
            await pg.wait_for_timeout(3500)
            js = """() => { const c=document.querySelector('.gjs-cv-canvas'); const w=document.querySelector('.gjs-frame-wrapper'); const cb=c.getBoundingClientRect(), wb=w.getBoundingClientRect(); return {dev: window.__vaiEditor.getDevice(), left: Math.round(wb.x-cb.x), right: Math.round(cb.right-wb.right), w: Math.round(wb.width)} }"""
            print(page_name, await pg.evaluate(js))
            for dev in ("Tablet", "Mobile", "Desktop"):
                await pg.evaluate(f"() => window.__vaiEditor.setDevice('{dev}')")
                await pg.wait_for_timeout(600)
                print(' ', dev, await pg.evaluate(js))
            await pg.get_by_role("button", name="Ampliar").click(); await pg.get_by_role("button", name="Ampliar").click()
            await pg.wait_for_timeout(400)
            await pg.evaluate("() => window.__vaiEditor.setDevice('Mobile')")
            await pg.wait_for_timeout(500)
            print('  zoomed mobile', await pg.evaluate(js))
            await pg.screenshot(path="/ui/shots/51_" + page_name.replace('.html','') + ".png")
        await b.close()
    srv.terminate()
asyncio.run(main())
