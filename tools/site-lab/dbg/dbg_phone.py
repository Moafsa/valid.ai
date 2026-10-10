import asyncio, sys, json
from playwright.async_api import async_playwright
PHONE_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
URL = sys.argv[1]
JS = """() => { const de=document.documentElement; const h=document.querySelector('h1'); const r=h?h.getBoundingClientRect():null; const cs=h?getComputedStyle(h):null;
 const wide=[...document.querySelectorAll('body *')].filter(e=>{const b=e.getBoundingClientRect(); return b.right>de.clientWidth+40 && b.width>0 && getComputedStyle(e).position!=='fixed'}).slice(0,8).map(e=>e.tagName+'.'+String(e.className).slice(0,50)+' '+Math.round(e.getBoundingClientRect().right));
 return {docW:de.scrollWidth, cw:de.clientWidth, vp:(document.querySelector('meta[name=viewport]')||{}).content, h1: r&&[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)], disp: cs&&[cs.display,cs.visibility,cs.opacity,cs.transform], wide} }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True, user_agent=PHONE_UA, locale="pt-BR")
        pg = await ctx.new_page()
        await pg.goto(URL, wait_until="load", timeout=40000)
        await pg.wait_for_timeout(3000)
        print(json.dumps(await pg.evaluate(JS), ensure_ascii=False))
        await b.close()
asyncio.run(main())
