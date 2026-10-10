import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        await pg.route("**/api/**", lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))
        await pg.goto("file:///ui/dist/editor.html")
        await pg.wait_for_selector(".gjs-frame", timeout=30000)
        await pg.wait_for_timeout(2500)
        pre = await pg.evaluate("() => ({cw: document.querySelector('.gjs-cv-canvas').clientWidth, cont: document.querySelector('.gjs-editor').parentElement.clientWidth, st: document.querySelector('.gjs-cv-canvas__frames').getAttribute('style')})")
        print('before', pre)
        await pg.evaluate("window.__vaiEditor.__fit()")
        r = await pg.evaluate("""() => { const fr=document.querySelector('.gjs-cv-canvas__frames'); const cs=getComputedStyle(fr); const w=document.querySelector('.gjs-frame-wrapper');
          return {style:fr.getAttribute('style'), to:cs.transformOrigin, rect:fr.getBoundingClientRect().toJSON(), wrect:w.getBoundingClientRect().toJSON(), wOff:w.offsetWidth, cw:document.querySelector('.gjs-cv-canvas').clientWidth} }""")
        print(json.dumps(r, indent=1))
        await b.close()
asyncio.run(main())
