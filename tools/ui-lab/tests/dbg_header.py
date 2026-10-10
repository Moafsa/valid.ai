import asyncio, json, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve, mock_api
from playwright.async_api import async_playwright
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        await pg.route("**/api/**", mock_api)
        await pg.goto("http://127.0.0.1:8123/editor.html")
        await pg.wait_for_selector(".gjs-frame", timeout=30000)
        await pg.wait_for_timeout(2500)
        r = await pg.evaluate("""() => { const d=window.__vaiEditor.Canvas.getDocument(); const w=d.defaultView;
          const els=d.elementsFromPoint(700,20); return els.slice(0,7).map(e=>{const cs=w.getComputedStyle(e); const r=e.getBoundingClientRect(); return {tag:e.tagName, cls:(e.className||'').toString().slice(0,40), bg:cs.backgroundColor, bgi:cs.backgroundImage.slice(0,40), pos:cs.position, w:Math.round(r.width), h:Math.round(r.height), depth: (()=>{let n=0,x=e;while(x){x=x.parentElement;n++}return n})(), style:(e.getAttribute('style')||'').slice(0,80)}}) }""")
        for e in r: print(e)
        await b.close()
    srv.terminate()
asyncio.run(main())
