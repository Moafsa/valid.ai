import asyncio, sys, json
from playwright.async_api import async_playwright
pid = sys.argv[1]
start = sys.argv[2] if len(sys.argv) > 2 else 'etapa-3'
BASE = f"http://web:3000/projects/{pid}/p"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        cdp = await ctx.new_cdp_session(pg)
        await pg.goto(BASE + '/' + start, wait_until='load')
        await pg.wait_for_timeout(2500)
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        await cdp.send('Profiler.enable')
        await cdp.send('Profiler.setSamplingInterval', {'interval': 200})
        await cdp.send('Profiler.start')
        await cdp.send('Tracing.start', {'categories': 'devtools.timeline', 'transferMode': 'ReturnAsStream'}) if False else None
        await pg.locator('[data-vai-next]').first.dispatch_event('click')
        await pg.wait_for_timeout(2500)
        prof = (await cdp.send('Profiler.stop'))['profile']
        nodes = {n['id']: n for n in prof['nodes']}
        self_t = {}
        dts = prof['timeDeltas']
        for sid, dt in zip(prof['samples'], dts):
            n = nodes[sid]; cf = n['callFrame']
            key = (cf['functionName'] or '(anon)') + ' ' + cf['url'].split('/')[-1][:30] + ':' + str(cf['lineNumber'])
            self_t[key] = self_t.get(key, 0) + dt
        tot = sum(self_t.values())
        print('total sampled ms (4x cpu):', round(tot / 1000))
        for k, v in sorted(self_t.items(), key=lambda kv: -kv[1])[:14]:
            print(f'{v/1000:8.1f}ms  {k}')
        await b.close()
asyncio.run(main())
