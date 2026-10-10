import asyncio, sys, json
from playwright.async_api import async_playwright
URL = sys.argv[1]; W = int(sys.argv[2]) if len(sys.argv) > 2 else 1440
JS = """() => { const de=document.documentElement; const cw=de.clientWidth; const out=[];
 document.querySelectorAll('body *').forEach(e=>{ const r=e.getBoundingClientRect(); if(r.width>0 && r.right>cw+8){ const cs=getComputedStyle(e); if(cs.position==='fixed') return; let clipped=false; for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const o=getComputedStyle(p); if(o.overflowX!=='visible'){ const pr=p.getBoundingClientRect(); if(pr.right<=cw+8){clipped=true;break;} }} if(!clipped) out.push([e.tagName+'#'+e.id+'.'+String(e.className).slice(0,50), Math.round(r.left), Math.round(r.right), Math.round(r.width), cs.position, (e.getAttribute('style')||'').slice(0,60)]); }});
 return {docW:de.scrollWidth, cw, n:out.length, first: out.slice(0,12)}; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":W,"height":900})
        await pg.goto(URL, wait_until="load", timeout=40000)
        await pg.wait_for_timeout(3000)
        await pg.evaluate("async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,80))}window.scrollTo(0,0)}")
        await pg.wait_for_timeout(800)
        r = await pg.evaluate(JS)
        print(r['docW'], r['cw'], r['n'])
        for x in r['first']: print(' ', x)
        await b.close()
asyncio.run(main())
