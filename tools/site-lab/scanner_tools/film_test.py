import asyncio, sys, json
sys.path.insert(0, '/app')
from playwright.async_api import async_playwright
from services.capture_engine import engine_js
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width":390,"height":844})
        await ctx.add_init_script(engine_js())
        pg = await ctx.new_page()
        await pg.goto("http://172.18.0.1:8099/film.html", wait_until="load")
        await pg.wait_for_timeout(4500)
        await pg.evaluate("() => window.__vai.plan()")
        html = await pg.evaluate("() => { const out = []; for (let i = 0; i < 8; i++) { const s = window.__vai.snapshot(i, { tagAll: true, anims: true }); if (!s) break; out.push(s.domHtml); } return out.join('') }")
        import re
        for m in re.finditer(r'<(\w+)[^>]*data-vai-tl="([^"]+)"', html):
            print(m.group(1), m.group(2).replace('&quot;', '"'))
        await b.close()
asyncio.run(main())
