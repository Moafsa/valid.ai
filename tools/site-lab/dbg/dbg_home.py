import asyncio, sys, json
from playwright.async_api import async_playwright
URL = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":1440,"height":900})
        errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        pg.on("console", lambda m: errs.append(m.type+': '+m.text[:150]) if m.type in ('error','warning') else None)
        await pg.goto(URL, wait_until="load", timeout=40000)
        for t in (300, 1000, 2500, 5000):
            await pg.wait_for_timeout(t if t==300 else 1500)
            r = await pg.evaluate("""() => { const e=document.querySelector('#home'); if(!e) return 'no #home'; const cs=getComputedStyle(e); const r=e.getBoundingClientRect(); return [e.className, cs.display, cs.opacity, cs.visibility, Math.round(r.width)+'x'+Math.round(r.height), document.body.className, (document.querySelector('#preloader')||{}).className, document.querySelector('#preloader') && getComputedStyle(document.querySelector('#preloader')).display] }""")
            print(t, r)
        print(errs[:8])
        await b.close()
asyncio.run(main())
