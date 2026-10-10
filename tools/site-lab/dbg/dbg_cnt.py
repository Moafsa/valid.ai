import asyncio, json
from playwright.async_api import async_playwright
JS = """() => { const l=[...document.querySelectorAll('[style]')].filter(el=>{const s=el.style; return s.display==='none'||s.visibility==='hidden'||s.opacity==='0'}); const i=l.findIndex(e=>e.id==='linktree-section'); return {total:l.length, idxLinktree:i, firstSections: l.slice(0,300).map((e,k)=>e.tagName==='SECTION'?k:null).filter(x=>x!==null).slice(0,5)} }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":1440,"height":900})
        await pg.goto("https://startwith.carrd.co/", wait_until="load", timeout=40000)
        await pg.wait_for_timeout(3000)
        print(await pg.evaluate(JS))
        await b.close()
asyncio.run(main())
