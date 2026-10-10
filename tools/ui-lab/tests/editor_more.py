import asyncio, json, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve, mock_api
from playwright.async_api import async_playwright
OUT = "/ui/shots"
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        logs, saves = [], []
        pg.on("pageerror", lambda e: logs.append("PAGEERROR " + str(e)[:300]))
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text[:200]}") if m.type == "error" else None)
        async def api(route):
            req = route.request
            if "save-page" in req.url:
                saves.append(json.loads(req.post_data or "{}"))
            await mock_api(route)
        await pg.route("**/api/**", api)
        await pg.goto("http://127.0.0.1:8123/editor.html")
        await pg.wait_for_selector(".gjs-frame", timeout=30000)
        await pg.wait_for_timeout(3000)
        # 1. insert a block by click, check it landed and got an id
        await pg.get_by_text("Depoimentos", exact=True).first.click()
        await pg.wait_for_timeout(800)
        n = await pg.evaluate("() => window.__vaiEditor.Canvas.getDocument().body.innerText.includes('O que dizem nossos clientes')")
        print("block inserted by click:", n)
        # 2. dark theme
        await pg.get_by_role("button", name="Ajustes").click()
        await pg.get_by_text("Escuro", exact=True).click()
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=f"{OUT}/30_dark.png")
        # 3. mobile device
        await pg.get_by_title("Celular").first.click()
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=f"{OUT}/31_mobile.png")
        await pg.get_by_title("Computador").first.click()
        # 4. save + undo state
        await pg.get_by_role("button", name="Salvar").click()
        await pg.wait_for_timeout(800)
        print("saved blocks:", len(saves[0]["blocks"]) if saves else None, "dirty label:", await pg.locator(".ed-dirty").inner_text())
        # 5. preview mode
        await pg.get_by_role("button", name="Visualizar").click()
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=f"{OUT}/32_preview.png")
        await pg.keyboard.press("Escape")
        await pg.wait_for_timeout(500)
        print("topbar back:", await pg.locator(".ed-topbar").is_visible())
        # 6. publish dialog
        await pg.get_by_role("button", name="Publicar").click()
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=f"{OUT}/33_publish.png")
        print("\n".join(logs[:10]))
        await b.close()
    srv.terminate()
asyncio.run(main())
