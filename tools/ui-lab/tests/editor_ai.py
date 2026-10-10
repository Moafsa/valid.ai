import asyncio, json, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve, mock_api, AI_MOCK
from playwright.async_api import async_playwright
OUT = "/ui/shots"

async def ask(pg, text, wait=2200):
    ta = pg.locator(".ed-ai-composer textarea")
    await ta.fill(text)
    await pg.keyboard.press("Enter")
    await pg.wait_for_timeout(wait)

async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        logs = []
        pg.on("pageerror", lambda e: logs.append("PAGEERROR " + str(e)[:300]))
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text[:200]}") if m.type == "error" and "503" not in m.text else None)
        await pg.route("**/api/**", mock_api)
        await pg.goto("http://127.0.0.1:8123/editor.html")
        await pg.wait_for_selector(".gjs-frame", timeout=30000)
        await pg.wait_for_timeout(3000)
        await pg.get_by_role("button", name="Abrir o assistente de IA").click()
        await pg.wait_for_timeout(500)
        await ask(pg, "troque o fundo para preto")
        await pg.screenshot(path=f"{OUT}/10_bg_black.png")
        n_changes = await pg.locator(".ed-ai-change").count()
        print("bg black changes:", n_changes)
        # undo and verify
        await pg.get_by_role("button", name="Antes").click()
        await pg.wait_for_timeout(600)
        bg = await pg.evaluate("() => getComputedStyle(window.__vaiEditor.Canvas.getDocument().body).backgroundColor")
        sec = await pg.evaluate("() => { const e = window.__vaiEditor.Canvas.getDocument().querySelector('body > div > div > *'); return getComputedStyle(e).backgroundColor }")
        print("after undo body bg:", bg, "first section bg:", sec)
        await pg.screenshot(path=f"{OUT}/11_after_undo.png")
        await ask(pg, "deixe a página mais premium", 2600)
        await pg.screenshot(path=f"{OUT}/12_premium.png")
        await ask(pg, "adicione uma seção de depoimentos", 2200)
        await pg.screenshot(path=f"{OUT}/13_depoimentos.png")
        cnt = await pg.evaluate("() => window.__vaiEditor.Canvas.getDocument().body.innerText.includes('O que dizem nossos clientes')")
        print("depoimentos present:", cnt)
        await ask(pg, "deixe todos os botões maiores e arredondados", 2200)
        await pg.screenshot(path=f"{OUT}/14_botoes.png")
        print("\n".join(logs[:15]))
        await b.close()
    srv.terminate()
asyncio.run(main())
