import asyncio, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve, mock_api
from playwright.async_api import async_playwright
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1600, "height": 950})
        await pg.route("**/api/**", mock_api)
        await pg.goto("http://127.0.0.1:8123/editor_ia.html")
        await pg.wait_for_selector(".gjs-frame", timeout=40000); await pg.wait_for_timeout(3500)
        r = await pg.evaluate("""() => {
          const d = window.__vaiEditor.Canvas.getDocument(), w = d.defaultView
          const out = []
          const els = Array.from(d.querySelectorAll('a')).filter(a => /Clonar/.test(a.innerText))
          for (const a of els) { for (let n = a, i = 0; n && i < 4; n = n.parentElement, i++) { const cs = w.getComputedStyle(n); out.push([n.tagName.toLowerCase(), (n.className||'').toString().slice(0,26), cs.backgroundColor, cs.backgroundImage.slice(0,50), cs.borderTopLeftRadius, cs.paddingTop + '/' + cs.paddingLeft, cs.display, Math.round(n.getBoundingClientRect().width) + 'x' + Math.round(n.getBoundingClientRect().height), (n.getAttribute('data-framer-name')||'')]) } out.push('---') }
          return out
        }""")
        for x in r: print(x)
        await b.close()
    srv.terminate()
asyncio.run(main())
