import asyncio, sys
from playwright.async_api import async_playwright
sys.path.insert(0, '/tmp')
exec(open('/tmp/behave_probe.py').read().split("async def main")[0].split("url = sys.argv[1]")[1])  # INSTR
url = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width":1280,"height":800})
        await ctx.add_init_script(INSTR)
        navs = []
        async def route(r, req):
            if req.resource_type == 'document' and req.frame.parent_frame is None and 'gluteobrasileno' not in req.url:
                navs.append('EXTERNAL DOC ' + req.url[:120]); await r.abort(); return
            if req.method != 'GET' and req.resource_type in ('xhr','fetch'):
                await r.fulfill(status=200, content_type='application/json', body='{}'); return
            await r.continue_()
        await ctx.route('**/*', route)
        pg = await ctx.new_page()
        pg.on('framenavigated', lambda f: navs.append('nav ' + f.url[:140]) if f == pg.main_frame else None)
        pg.on('dialog', lambda d: (navs.append('DIALOG ' + d.type + ': ' + d.message[:80]), asyncio.ensure_future(d.dismiss())))
        await pg.goto(url, wait_until='load'); await pg.wait_for_timeout(4000)
        print('base url', pg.url)
        before = (await pg.inner_text('body'))[:150].replace('\n',' / ')
        print('A) mouse leaves through the top (exit intent)')
        await pg.mouse.move(600, 300); await pg.mouse.move(600, 1); await pg.mouse.move(600, -5, steps=3)
        await pg.wait_for_timeout(2500)
        print('   url', pg.url)
        print('   overlays:', await pg.evaluate("[...document.querySelectorAll('body *')].filter(e => getComputedStyle(e).position==='fixed' && e.getBoundingClientRect().width>300 && e.getBoundingClientRect().height>200).map(e => e.tagName + '#' + e.id + '.' + String(e.className).slice(0,40) + ' :: ' + (e.innerText||'').slice(0,60).replace(/\\n/g,' '))"))
        print('B) back button')
        try:
            await pg.go_back(); await pg.wait_for_timeout(2500)
        except Exception as e: print('   go_back error', str(e)[:80])
        print('   url now:', pg.url)
        print('   navigation log so far:', navs[-6:])
        print('B) back button')
        try:
            await pg.go_back(); await pg.wait_for_timeout(2500)
        except Exception as e: print('   go_back error', str(e)[:80])
        print('   url', pg.url, '| text:', (await pg.inner_text('body'))[:150].replace('\n',' / '))
        print('C) tab hidden')
        await pg.evaluate("Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true}); document.dispatchEvent(new Event('visibilitychange'))")
        await pg.wait_for_timeout(1500)
        print('   url', pg.url)
        print('--- navigation log:'); [print('  ', n) for n in navs[:15]]
        print('--- behaviours during probes:'); [print('  ', e) for e in (await pg.evaluate("window.__behav || []"))[-18:]]
        await b.close()
asyncio.run(main())
