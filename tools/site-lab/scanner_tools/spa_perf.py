import asyncio, sys, time
from playwright.async_api import async_playwright
pid, throttled = sys.argv[1], sys.argv[2] == '1'
HOST = (sys.argv[3] if len(sys.argv) > 3 else "http://web:3000").split("//")[1]
BASE = (sys.argv[3] if len(sys.argv) > 3 else "http://web:3000") + f"/projects/{pid}/p"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True)
        exits = []
        async def route(r, req):
            if req.resource_type == 'document' and req.frame.parent_frame is None and HOST not in req.url:
                exits.append(req.url); await r.abort(); return
            await r.continue_()
        await ctx.route('**/*', route)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:150]))
        if throttled:
            cdp = await ctx.new_cdp_session(pg)
            await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
            await cdp.send('Network.enable')
            await cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150, 'downloadThroughput': 1.6*1024*1024/8, 'uploadThroughput': 750*1024/8})
        t = time.time()
        await pg.goto(BASE + '/home', wait_until='load')
        print(f"first load {time.time()-t:.1f}s")
        await pg.evaluate("window.__marker = 'same-document'")
        await pg.wait_for_timeout(3000)  # prefetch time
        for i in range(30):
            head = await pg.evaluate("(document.querySelector('h1,h2,h3')||{}).innerText || ''")
            sel = pg.locator('[data-vai-select]')
            if await sel.count():
                await sel.first.click(); await pg.wait_for_timeout(300)
            nxt = pg.locator('[data-vai-next]:not([data-vai-select]), [data-vai-href]:not([data-vai-select])')
            target = None
            for n in range(await nxt.count()):
                try:
                    await nxt.nth(n).wait_for(state='visible', timeout=40000); target = nxt.nth(n); break
                except Exception: pass
            if not target:
                print(f"[{i}] {head[:40]!r}: no next control; end"); break
            before = await pg.evaluate("location.pathname")
            t = time.time()
            await target.click()
            try:
                await pg.wait_for_function("(b) => location.pathname !== b", arg=before, timeout=8000)
                await pg.wait_for_function("() => { const r = document.querySelector('[data-vai-root]'); return r && getComputedStyle(r).opacity === '1' }", timeout=5000)
            except Exception:
                pass
            dt = time.time() - t
            marker = await pg.evaluate("window.__marker")
            print(f"[{i}] {head[:38]!r} -> {pg.url.split('/p/')[-1]}  {dt*1000:.0f}ms  same-document={marker=='same-document'}")
            if exits: print("   EXIT ->", exits[-1][:100]); break
            await pg.wait_for_timeout(700)
        print('errors:', errs[:3])
        await b.close()
asyncio.run(main())
