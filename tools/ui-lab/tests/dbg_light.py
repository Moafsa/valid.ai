import asyncio, json, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve
from playwright.async_api import async_playwright
OPS = [{"op": "theme", "theme": {"mood": "light", "accent": "#0a72f5", "radius": 10, "shadow": "soft"}}]
async def api(route):
    if "ai-assist" in route.request.url:
        await route.fulfill(status=200, content_type="application/json", body=json.dumps({"reply": "ok", "operations": OPS}))
    else:
        await route.fulfill(status=200, content_type="application/json", body="{}")
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1600, "height": 950})
        await pg.route("**/api/**", api)
        await pg.goto("http://127.0.0.1:8123/editor_ia.html")
        await pg.wait_for_selector(".gjs-frame", timeout=40000); await pg.wait_for_timeout(3500)
        probe = """() => {
          const d = window.__vaiEditor.Canvas.getDocument(), w = d.defaultView
          const h = d.querySelector('h1'); const chain = []
          for (let n = h; n; n = n.parentElement) { const cs = w.getComputedStyle(n); chain.push([n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + '.' + (n.className||'').toString().slice(0,30), cs.backgroundColor, cs.backgroundImage.slice(0,40), Math.round(n.getBoundingClientRect().height)]) }
          return chain
        }"""
        print("BEFORE chain (h1 -> html):")
        for r in await pg.evaluate(probe): print("  ", r)
        await pg.get_by_role("button", name="Abrir o assistente de IA").click(); await pg.wait_for_timeout(500)
        await pg.locator(".ed-ai-composer textarea").fill("clara"); await pg.keyboard.press("Enter")
        await pg.wait_for_selector(".ed-ai-reply", timeout=30000); await pg.wait_for_timeout(1500)
        print("AFTER chain:")
        for r in await pg.evaluate(probe): print("  ", r)
        css = await pg.evaluate("() => window.__vaiEditor.getCss().split('}').filter(x => /^\\s*(body|#wrapper|html)\\b/.test(x) || /background-color:\\s*#ffffff/.test(x)).slice(0,8).join('}\\n')")
        print("RULES touching body/wrapper:\n", css[:900])
        await b.close()
    srv.terminate()
asyncio.run(main())
