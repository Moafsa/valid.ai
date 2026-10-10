import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1]
JS = """() => { const e=document.querySelector('.bubble-element.Page, [class*="bubble-element Page"]'); if(!e) return 'none'; const out=[]; for(let n=e;n&&n!==document.documentElement;n=n.parentElement){const c=getComputedStyle(n); out.push([n.tagName,(n.className||'').toString().slice(0,50),c.overflowX,c.position,c.width,(n.getAttribute('style')||'').slice(0,80)])} return out }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":1440,"height":900})
        await pg.goto(URL, wait_until="load", timeout=40000)
        await pg.wait_for_timeout(3000)
        r = await pg.evaluate(JS)
        for x in (r if isinstance(r,list) else [r]): print(x)
        await b.close()
asyncio.run(main())
