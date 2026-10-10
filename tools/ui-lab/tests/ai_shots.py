import asyncio, json, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve
from playwright.async_api import async_playwright
OPS = [{"op": "theme", "theme": {"accent": "#7c5cff", "radius": 14, "shadow": "soft", "density": "airy"}, "label": "Visual premium"},
       {"op": "style", "target": {"by": "kind", "kind": "heading", "nth": [1]}, "css": {"color": "#ffffff"}, "label": "Título principal em branco"}]
async def api(route):
    u = route.request.url
    if "ai-assist" in u: await route.fulfill(status=200, content_type="application/json", body=json.dumps({"reply": "Deixei a página mais elegante: títulos mais fortes, cantos arredondados e botões na cor de destaque.", "operations": OPS, "credits": {"used": 214, "limit": 300, "plan": "Basic"}}))
    elif "/api/ai/credits" in u: await route.fulfill(status=200, content_type="application/json", body=json.dumps({"used": 214, "limit": 300, "plan": "Basic"}))
    else: await route.fulfill(status=200, content_type="application/json", body="{}")
async def main():
    srv = serve()
    async with async_playwright() as p:
        for theme in ("light", "dark"):
            b = await p.chromium.launch(ignore_default_args=["--hide-scrollbars"], args=["--disable-features=OverlayScrollbar,FluentOverlayScrollbar,FluentScrollbar"])
            ctx = await b.new_context(viewport={"width": 1500, "height": 900})
            await ctx.add_init_script(f"localStorage.setItem('vai-editor-theme','{theme}')")
            pg = await ctx.new_page()
            await pg.route("**/api/**", api)
            await pg.goto("http://127.0.0.1:8123/editor_ia.html")
            await pg.wait_for_selector(".gjs-frame", timeout=40000); await pg.wait_for_timeout(3000)
            await pg.get_by_role("button", name="Abrir o assistente de IA").click(); await pg.wait_for_timeout(800)
            await pg.screenshot(path=f"/ui/shots/panel_{theme}_hello.png")
            await pg.locator(".ed-ai-composer textarea").fill("deixe a página mais elegante"); await pg.keyboard.press("Enter")
            await pg.wait_for_selector(".ed-ai-reply", timeout=30000); await pg.wait_for_timeout(2600)
            await pg.screenshot(path=f"/ui/shots/panel_{theme}_done.png")
            await b.close()
    srv.terminate()
asyncio.run(main())
