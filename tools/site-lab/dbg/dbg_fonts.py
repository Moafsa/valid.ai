import asyncio, sys, json
from playwright.async_api import async_playwright
URL, PAT = sys.argv[1], sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":1440,"height":900})
        await pg.goto(URL, wait_until="load", timeout=40000)
        await pg.wait_for_timeout(2500)
        await pg.evaluate("async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,80))}window.scrollTo(0,0)}")
        await pg.wait_for_timeout(1500)
        r = await pg.evaluate("""(pat) => { const out=[]; document.fonts.forEach(f=>{ if(new RegExp(pat,'i').test(f.family)) out.push(f.family+':'+f.status) }); return out }""", PAT)
        print(r)
        await b.close()
asyncio.run(main())
