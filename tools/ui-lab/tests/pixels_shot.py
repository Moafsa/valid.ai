import asyncio, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve
from playwright.async_api import async_playwright
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w, h in ((1280, 900), (390, 844)):
            pg = await b.new_page(viewport={"width": w, "height": h})
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            await pg.route("**/api/projects/**", lambda r: r.fulfill(json={"events": []}))
            await pg.goto("http://127.0.0.1:8123/pixels.html")
            await pg.wait_for_timeout(600)
            await pg.screenshot(path=f"/ui/shots/pixels_{w}.png", full_page=True)
            # an edit makes the bar ask to save
            await pg.click("text=Evento personalizado")
            await pg.fill("input[placeholder='Ex.: Clicou no WhatsApp']", "Abriu o chat")
            await pg.fill("input[placeholder='Ex.: Quero começar']", "Chat")
            await pg.click("text=Adicionar à lista")
            assert "ainda não foram salvas" in await pg.inner_text("body")
            await pg.click("text=Adicionar integração >> xpath=following::button[1]")
            ov = await pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2")
            assert ov or w > 500, "sideways scroll"
            assert not errs, errs
            await pg.goto("http://127.0.0.1:8123/pixels.html?draft=1")
            await pg.wait_for_timeout(400)
            assert "só rodam na página" in await pg.inner_text("body")
        await b.close()
    srv.terminate(); print("ALL PASSED")
asyncio.run(main())
