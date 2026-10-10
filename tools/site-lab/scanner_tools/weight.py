import asyncio, sys, time, json
from playwright.async_api import async_playwright
url, mode = sys.argv[1], sys.argv[2]   # mode: orig | clone
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True)
        pg = await ctx.new_page()
        cdp = await ctx.new_cdp_session(pg)
        await cdp.send('Network.enable'); await cdp.send('Performance.enable')
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        await cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150, 'downloadThroughput': 1.6*1024*1024/8, 'uploadThroughput': 750*1024/8})
        total = {'bytes': 0, 'reqs': 0}
        cdp.on('Network.loadingFinished', lambda e: total.__setitem__('bytes', total['bytes'] + e.get('encodedDataLength', 0)))
        cdp.on('Network.requestWillBeSent', lambda e: total.__setitem__('reqs', total['reqs'] + 1))
        await pg.add_init_script("window.__lt=0;new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__lt+=e.duration)).observe({entryTypes:['longtask']})")
        t = time.time(); await pg.goto(url, wait_until='load'); await pg.wait_for_timeout(3000)
        print(f"first load: {time.time()-t:.1f}s  bytes={total['bytes']//1024}KB reqs={total['reqs']}")
        for i in range(8):
            before = dict(total)
            nxt = pg.locator('[data-vai-next]:visible').first if mode == 'clone' else pg.locator('button:visible').first
            try:
                await nxt.click(timeout=8000)
            except Exception as e:
                print('no click', str(e)[:60]); break
            await pg.wait_for_timeout(2500)
            m = await cdp.send('Performance.getMetrics')
            mm = {x['name']: x['value'] for x in m['metrics']}
            print(f"step {i+1}: +{(total['bytes']-before['bytes'])//1024}KB +{total['reqs']-before['reqs']} reqs  nodes={int(mm.get('Nodes',0))} heap={int(mm.get('JSHeapUsedSize',0)/1024/1024)}MB longtasks={int(await pg.evaluate('window.__lt'))}ms  h1={(await pg.evaluate('(document.querySelector(\"h1,h2,h3\")||{}).innerText||\"\"'))[:40]!r}")
        print(f"TOTAL: {total['bytes']//1024}KB, {total['reqs']} requests")
        await b.close()
asyncio.run(main())
