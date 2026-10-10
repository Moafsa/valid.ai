import asyncio, sys, time, re, json, os
from playwright.async_api import async_playwright
pid, tag = sys.argv[1], sys.argv[2]
W = int(sys.argv[3]) if len(sys.argv) > 3 else 1440
H = 900 if W > 600 else 844
BASE = f"http://web:3000/projects/{pid}/p"
async def main():
    os.makedirs('/tmp/shots', exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": W, "height": H})
        exits = []
        async def route(r, req):
            if req.resource_type == 'document' and req.frame.parent_frame is None and 'web:3000' not in req.url:
                exits.append(req.url); await r.abort(); return
            await r.continue_()
        await ctx.route('**/*', route)
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: print('  PAGEERR', str(e)[:150]))
        await pg.goto(BASE + '/home', wait_until='load')
        for i in range(14):
            await pg.wait_for_timeout(900)
            path = pg.url.replace('http://web:3000','')
            head = await pg.evaluate("() => { const h = document.querySelector('h1,h2,h3'); return h ? h.innerText.trim().slice(0,50) : '' }")
            info = await pg.evaluate("""() => ({
              sw: document.documentElement.scrollWidth, delayed: [...document.querySelectorAll('[data-vai-delay]')].map(e => [e.getAttribute('data-vai-delay'), (e.innerText||'').trim().slice(0,30)]),
              selects: document.querySelectorAll('[data-vai-select]').length, nexts: document.querySelectorAll('[data-vai-next],[data-vai-href]').length })""")
            await pg.screenshot(path=f'/tmp/shots/pt_{tag}_{W}_{i}.png')
            print(f"[{i}] {path}  h={head!r} {info}")
            # advance
            t0 = time.time()
            sel = pg.locator('[data-vai-select]')
            if await sel.count():
                await sel.first.click()
                await pg.wait_for_timeout(500)
                await pg.screenshot(path=f'/tmp/shots/pt_{tag}_{W}_{i}_sel.png')
            nxt = pg.locator('[data-vai-next]:not([data-vai-select]), [data-vai-href]:not([data-vai-select])')
            if not await nxt.count():
                print("   no next control; end"); break
            target = None
            for n in range(await nxt.count()):
                el = nxt.nth(n)
                try:
                    await el.wait_for(state='visible', timeout=40000)
                    target = el; break
                except Exception: pass
            if not target: print("   next never became visible"); break
            appeared = round(time.time() - t0, 1)
            if info['delayed']: print(f"   next visible after {appeared}s (expected {info['delayed'][0][0]})")
            nexturl = await target.get_attribute('data-vai-next') or await target.get_attribute('data-vai-href')
            await target.click()
            await pg.wait_for_timeout(1500)
            if exits:
                print("   EXIT ->", exits[-1]); break
        await b.close()
asyncio.run(main())
