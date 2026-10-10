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
        logs = []
        pg.on("pageerror", lambda e: logs.append("PAGEERROR " + str(e)[:300]))
        await pg.route("**/api/**", mock_api)
        await pg.goto("http://127.0.0.1:8123/editor.html")
        await pg.wait_for_selector(".gjs-frame", timeout=30000)
        await pg.wait_for_timeout(3000)
        before = await pg.evaluate("() => window.__vaiEditor.Canvas.getDocument().querySelectorAll('section').length")
        await pg.evaluate("""() => { window.__ev = []; const ed = window.__vaiEditor; ['block:drag:start','block:drag:stop','block:drag','block:custom'].forEach(n => ed.on(n, () => window.__ev.push(n))); document.addEventListener('dragstart', e => window.__ev.push('DOM dragstart ' + e.target.className), true); }""")
        card = pg.locator(".ed-block", has_text="Preço").first
        await card.hover()
        box = await card.bounding_box()
        fr = await pg.locator(".gjs-frame").bounding_box()
        # start the drag natively, then finish it inside the canvas document with synthetic events
        await card.dispatch_event("dragstart")
        await pg.wait_for_timeout(300)
        res = await pg.evaluate("""() => {
          const ed = window.__vaiEditor; const doc = ed.Canvas.getDocument();
          const target = doc.querySelector('h1') || doc.body;
          const r = target.getBoundingClientRect();
          const fire = (type) => { const e = new doc.defaultView.DragEvent(type, { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + r.height - 4, dataTransfer: new doc.defaultView.DataTransfer() }); target.dispatchEvent(e); };
          fire('dragenter'); fire('dragover'); fire('dragover'); fire('drop');
          return 'ok'
        }""")
        await pg.locator(".ed-block").first.dispatch_event("dragend")
        await pg.wait_for_timeout(900)
        txt = await pg.evaluate("() => window.__vaiEditor.Canvas.getDocument().body.innerText.includes('Oferta especial')")
        print("dropped by drag:", txt, await pg.evaluate("() => window.__ev"))
        print("\n".join(logs[:5]))
        await b.close()
    srv.terminate()
asyncio.run(main())
