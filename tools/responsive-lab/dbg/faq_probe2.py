import asyncio, sys, json
from playwright.async_api import async_playwright
URL = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        await pg.goto(URL, wait_until="load", timeout=60000)
        await pg.wait_for_timeout(4000)
        await pg.evaluate("async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120))}}")
        await pg.evaluate("() => window.scrollTo(0, 5000)")
        await pg.wait_for_timeout(1500)
        info = await pg.evaluate("""() => {
          const out = [];
          const els = [...document.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); const y = r.top + scrollY; return y > 5250 && y < 6600 && r.width > 200 && r.height > 30 && r.height < 160 && getComputedStyle(e).cursor === 'pointer'; });
          for (const e of els.slice(0, 12)) { const r = e.getBoundingClientRect(); out.push({ tag: e.tagName, role: e.getAttribute('role'), h: Math.round(r.height), y: Math.round(r.top + scrollY), text: (e.innerText || '').trim().slice(0, 50), cls: String(e.className).slice(0, 50), name: e.getAttribute('data-framer-name'), kids: e.children.length }); }
          return out;
        }""")
        print(json.dumps(info, ensure_ascii=False, indent=0)[:1800])
        # click the first candidate and see what changes
        res = await pg.evaluate("""async () => {
          const els = [...document.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); const y = r.top + scrollY; return y > 5250 && y < 6600 && r.width > 200 && r.height > 30 && r.height < 160 && getComputedStyle(e).cursor === 'pointer'; });
          const el = els[0]; if (!el) return null;
          const root = document.body;
          const h0 = document.documentElement.scrollHeight;
          const snap = () => new Map([...document.querySelectorAll('*')].map((n, i) => [n, n.className + '|' + (n.getAttribute('style') || '') + '|' + (n.children.length)]));
          const s0 = snap();
          const nodes0 = document.querySelectorAll('*').length;
          el.click();
          await new Promise(r => setTimeout(r, 900));
          const h1 = document.documentElement.scrollHeight;
          const s1 = snap();
          let changed = 0; for (const [n, v] of s1) if (s0.has(n) && s0.get(n) !== v) changed++;
          return { h0, h1, nodes0, nodes1: document.querySelectorAll('*').length, changed, text: (el.innerText || '').slice(0, 80) };
        }""")
        print(json.dumps(res))
        await b.close()
asyncio.run(main())
