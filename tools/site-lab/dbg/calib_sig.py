import asyncio, sys, json, random
from playwright.async_api import async_playwright
DESK_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
PHONE_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
SIG = r"""
() => {
  const text = (document.body.innerText || '').toLowerCase();
  const words = [...new Set(text.match(/[a-zà-ÿ0-9]{3,}/g) || [])];
  const q = s => document.body.querySelectorAll(s).length;
  const cls = new Set(), ids = new Set();
  let n = 0, vis = 0;
  document.body.querySelectorAll('*').forEach(e => { n++; e.classList && e.classList.forEach(c => cls.add(c)); if (e.id) ids.add(e.id);
     const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) vis++; });
  const names = [...new Set([...document.querySelectorAll('[data-framer-name],[data-testid],[data-hook],[data-mesh-id]')].map(e => e.getAttribute('data-framer-name') || e.getAttribute('data-testid') || e.getAttribute('data-hook') || e.getAttribute('data-mesh-id')))];
  return { words: words.slice(0, 1500), classes: [...cls].slice(0, 6000), ids: [...ids].slice(0, 3000), names: names.slice(0, 3000), n, vis,
    counts: { a: q('a[href]'), button: q('button,[role=button]'), img: q('img'), h2: q('h1,h2,h3'), section: q('section'), li: q('li'), p: q('p'), input: q('input,select,textarea'), svg: q('svg'), div: q('div') } };
}
"""
SCROLL = """async () => { const s=ms=>new Promise(r=>setTimeout(r,ms)); let y=0,n=0; while(n++<25){ const h=document.documentElement.scrollHeight; if(y>=h) break; window.scrollTo(0,y); y+=innerHeight*0.8; await s(120);} window.scrollTo(0,0); await s(400); }"""
async def sig(b, url, mobile):
    ctx = await b.new_context(viewport={"width":390 if mobile else 1440,"height":844 if mobile else 900}, is_mobile=mobile, has_touch=mobile, user_agent=PHONE_UA if mobile else DESK_UA, locale="pt-BR")
    await ctx.route("**/*", lambda r: r.abort() if r.request.resource_type in ("image","media","font") else r.continue_())
    pg = await ctx.new_page()
    try:
        await pg.goto(url, wait_until="load", timeout=35000)
        try: await pg.wait_for_load_state("networkidle", timeout=4000)
        except Exception: pass
        await asyncio.wait_for(pg.evaluate(SCROLL), 25)
        return await pg.evaluate(SIG)
    except Exception as e:
        return {"error": str(e)[:100]}
    finally:
        await ctx.close()
async def main():
    rows = [l.rstrip("\n").split("\t") for l in open(sys.argv[1])]
    out = open(sys.argv[2], "a")
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for idx, cat, url, *_ in rows:
            d = await sig(b, url, False); m = await sig(b, url, True)
            out.write(json.dumps({"idx": int(idx), "cat": cat, "url": url, "d": d, "m": m}) + "\n"); out.flush()
        await b.close()
asyncio.run(main())
