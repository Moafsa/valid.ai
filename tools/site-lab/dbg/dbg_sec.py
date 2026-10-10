import asyncio, sys, json
from playwright.async_api import async_playwright
URL, SEL = sys.argv[1], sys.argv[2]
JS = """(sel) => { const e=document.querySelector(sel); if(!e) return 'none'; const cs=getComputedStyle(e); const r=e.getBoundingClientRect();
  return {cls:e.className, style:e.getAttribute('style'), display:cs.display, h:Math.round(r.height), pos:cs.position, op:cs.opacity, vis:cs.visibility, ov:cs.overflow, mh:cs.maxHeight, parentCls:e.parentElement.className, parentDisp:getComputedStyle(e.parentElement).display, sibs:[...e.parentElement.children].slice(0,6).map(c=>c.id+':'+c.className+':'+(c.getAttribute('style')||'')+':'+Math.round(c.getBoundingClientRect().height))} }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":1440,"height":900})
        await pg.goto(URL, wait_until="load", timeout=40000)
        await pg.wait_for_timeout(3000)
        print(json.dumps(await pg.evaluate(JS, SEL), ensure_ascii=False)[:1500])
        await b.close()
asyncio.run(main())
