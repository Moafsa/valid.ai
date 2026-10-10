import asyncio, sys, json
from playwright.async_api import async_playwright
URL = sys.argv[1]; WS = [int(x) for x in sys.argv[2].split(",")]
JS = """() => { const m = {}; const skip = new Set(['SCRIPT','STYLE','LINK','META','NOSCRIPT']); let i = 0;
  const walk = (el, path) => { const cnt = {}; for (const c of el.children) { if (skip.has(c.tagName)) continue; const t = c.tagName.toLowerCase(); cnt[t] = (cnt[t]||0)+1; const p = path + '/' + t + cnt[t]; m[p] = typeof c.className === 'string' ? c.className : ''; walk(c, p) } };
  walk(document.body, ''); m['html'] = document.documentElement.className; m['body'] = document.body.className; return m }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        res = {}
        for w in WS:
            ctx = await b.new_context(viewport={"width": w, "height": 900}, is_mobile=w <= 500, has_touch=w <= 500)
            pg = await ctx.new_page()
            await pg.goto(URL, wait_until="load", timeout=60000); await pg.wait_for_timeout(3000)
            res[w] = await pg.evaluate(JS); await ctx.close()
        base = res[WS[0]]
        for w in WS[1:]:
            print("== width", w)
            n = 0
            for k, v in res[w].items():
                a = set(base.get(k, "").split()); bb = set(v.split())
                if a != bb:
                    n += 1
                    if n <= 14: print(f"  {k[-40:]:40} +{sorted(bb-a)[:6]} -{sorted(a-bb)[:6]}")
            print("  elements with class differences:", n)
        await b.close()
asyncio.run(main())
