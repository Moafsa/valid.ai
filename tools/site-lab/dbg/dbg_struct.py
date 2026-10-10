import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1]
JS = """() => { const d=(e,depth)=>{ if(depth>4) return; const kids=[...e.children].filter(c=>!['SCRIPT','STYLE','LINK','NOSCRIPT','TEMPLATE'].includes(c.tagName)); const t=(e.innerText||'').length; return {n: e.tagName+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.split(' ')[0].slice(0,24):''), t, k: kids.length>12? kids.length+' kids':kids.map(c=>d(c,depth+1))}; };
 const fmt=(o,ind)=>{ if(!o) return ''; let s=' '.repeat(ind)+o.n+' ['+o.t+']\\n'; if(Array.isArray(o.k)) for(const c of o.k){ if(c && c.t>30) s+=fmt(c,ind+2); } else s+=' '.repeat(ind+2)+o.k+'\\n'; return s; };
 return fmt(d(document.body,0),0); }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":1440,"height":900})
        await pg.goto(URL, wait_until="load", timeout=40000)
        await pg.wait_for_timeout(3000)
        await pg.evaluate("async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,100))}window.scrollTo(0,0)}")
        print(await pg.evaluate(JS))
        await b.close()
asyncio.run(main())
