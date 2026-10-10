import asyncio, sys, json
from playwright.async_api import async_playwright
URL, TXT = sys.argv[1], sys.argv[2]
JS = """(txt) => { const w=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while(n=w.nextNode()){ if(n.textContent.includes(txt)) break; } if(!n) return 'no text node';
 const out=[]; for(let e=n.parentElement; e && e!==document.documentElement; e=e.parentElement){ const cs=getComputedStyle(e); const r=e.getBoundingClientRect(); out.push([e.tagName+'#'+e.id+'.'+String(e.className).slice(0,40), cs.display, cs.opacity, cs.visibility, cs.position, Math.round(r.width)+'x'+Math.round(r.height), (e.getAttribute('style')||'').slice(0,80), cs.transform==='none'?'':cs.transform.slice(0,30)].join(' | ')); } return out; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":1440,"height":900})
        await pg.goto(URL, wait_until="load", timeout=40000)
        await pg.wait_for_timeout(3500)
        r = await pg.evaluate(JS, TXT)
        print("\n".join(r) if isinstance(r, list) else r)
        await b.close()
asyncio.run(main())
