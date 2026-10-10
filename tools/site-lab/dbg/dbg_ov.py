import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1]
JS = """() => { const g=e=>{const c=getComputedStyle(e); return [e.tagName, c.overflowX, c.overflowY, c.position, e.getAttribute('style')||'', (e.className||'').toString().slice(0,60)]}; return [g(document.documentElement), g(document.body), ...[...document.body.children].slice(0,6).map(g), document.documentElement.scrollWidth] }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":1440,"height":900})
        await pg.goto(URL, wait_until="load", timeout=40000)
        await pg.wait_for_timeout(3000)
        for x in await pg.evaluate(JS): print(x)
        await b.close()
asyncio.run(main())
