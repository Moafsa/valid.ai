"""Shoots the dashboard home (new workspace design) with fake projects: desktop and phone, idle / URL typed / empty."""
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
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            await pg.goto("http://127.0.0.1:8123/home.html")
            await pg.wait_for_timeout(700)
            await pg.screenshot(path=f"/ui/shots/home_{w}.png", full_page=True)
            await pg.fill("input", "https://exemplo.com/pagina-de-vendas")
            await pg.wait_for_timeout(200)
            await pg.screenshot(path=f"/ui/shots/home_typed_{w}.png")
            await pg.click("text=mudar o nome")
            await pg.wait_for_timeout(200)
            assert await pg.locator("input[aria-label='Nome do projeto']").count() == 1
            assert not errs, errs
            # the first tile sends the person back to the field
            await pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await pg.click("text=Clonar outra página")
            await pg.wait_for_timeout(900)
            assert await pg.evaluate("document.activeElement && document.activeElement.getAttribute('aria-label')") == "Endereço da página para clonar"
            await pg.goto("http://127.0.0.1:8123/home.html?empty=1")
            await pg.wait_for_timeout(500)
            await pg.screenshot(path=f"/ui/shots/home_empty_{w}.png", full_page=True)
        await b.close()
    srv.terminate()
    print("ALL PASSED")
asyncio.run(main())
