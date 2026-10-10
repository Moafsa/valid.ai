import asyncio, sys, time, re, json
from playwright.async_api import async_playwright
pid = sys.argv[1]
SLOW = len(sys.argv) > 2 and sys.argv[2] == 'slow'
BASE = f"http://web:3000/projects/{pid}/p"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: print('  PAGEERR', str(e)[:150]))
        cdp = await ctx.new_cdp_session(pg)
        if SLOW:
            await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
            await cdp.send('Network.enable')
            await cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150, 'downloadThroughput': 200000, 'uploadThroughput': 100000})
        await pg.add_init_script("""
          window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(Math.round(e.duration)))).observe({entryTypes: ['longtask']}); } catch (e) {}
        """)
        await pg.goto(BASE + '/home', wait_until='load')
        t0 = time.time(); last = None; seen = []
        async def snap():
            return await pg.evaluate("""() => {
              const t = ((document.querySelector('[data-vai-root]') || document.body).innerText || '').replace(/\\s+/g, ' ').trim();
              return {path: location.pathname.split('/').pop(), t: t.slice(0, 90), lt: window.__lt ? window.__lt.length : 0, ltmax: Math.max(0, ...(window.__lt || [0]))};
            }""")
        for i in range(400):
            s = await snap()
            key = s['path'] + '|' + re.sub(r'\d+%', 'N%', s['t'])
            if key != last:
                last = key
                print(f"{time.time()-t0:5.1f}s [{s['path']}] {s['t'][:80]!r}  longtasks={s['lt']} max={s['ltmax']}ms", flush=True)
            # advance
            await pg.evaluate("""() => {
              const sel = document.querySelector('[data-vai-select]'); if (sel) sel.click();
            }""")
            nxt = pg.locator('[data-vai-next]:not([data-vai-select]), [data-vai-href]:not([data-vai-select])')
            for n in range(await nxt.count()):
                el = nxt.nth(n)
                try:
                    if await el.is_visible():
                        href = await el.get_attribute('data-vai-href')
                        if href: print('EXIT ->', href[:80]); await b.close(); return
                        await el.dispatch_event('click'); break
                except Exception: pass
            await pg.wait_for_timeout(250)
            if time.time() - t0 > 150: break
        await b.close()
asyncio.run(main())
