import asyncio, sys
from playwright.async_api import async_playwright
pid = sys.argv[1]
BASE = f"http://web:3000/projects/{pid}/p"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        # ---- mobile: player
        ctx = await b.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:120]))
        pg.on('console', lambda m: errs.append('console:' + m.text[:100]) if m.type == 'error' else None)
        await pg.goto(BASE + '/home', wait_until='load'); await pg.wait_for_timeout(4000)
        await pg.screenshot(path='/tmp/shots/glu2_preview.png')
        info = await pg.evaluate("""() => { const h = document.querySelector('[data-vai-player]'); const v = h && h.querySelectorAll('video'); return { ready: h && h.getAttribute('data-vai-ready'), videos: v ? [...v].map(x => [x.className, x.paused, x.muted, x.currentSrc.slice(-30), x.readyState]) : null } }""")
        print('preview state:', info)
        await pg.mouse.click(195, 400) if False else await pg.tap('[data-vai-player]')
        await pg.wait_for_timeout(7000)
        await pg.screenshot(path='/tmp/shots/glu2_playing.png')
        st = await pg.evaluate("""() => { const v = document.querySelector('.vai-pl-main'); const bar = document.querySelector('.vai-pl-bar i'); return v ? { t: v.currentTime, dur: v.duration, paused: v.paused, muted: v.muted, rs: v.readyState, bar: bar && bar.style.width } : null }""")
        print('after tap:', st, errs[:3])
        # pitch element + smart bar
        # ---- desktop: exit rule
        dctx = await b.new_context(viewport={"width":1280,"height":800})
        exits = []
        async def route(r, req):
            if req.resource_type == 'document' and req.frame.parent_frame is None and 'web:3000' not in req.url:
                exits.append(req.url); await r.abort(); return
            await r.continue_()
        await dctx.route('**/*', route)
        dp = await dctx.new_page()
        await dp.goto(BASE + '/home', wait_until='load'); await dp.wait_for_timeout(3000)
        await dp.mouse.move(600, 300); await dp.mouse.move(600, 2, steps=4); await dp.mouse.move(600, -8, steps=3)
        await dp.wait_for_timeout(2500)
        print('after exit-intent on home ->', dp.url.split('/p/')[-1], '|', (await dp.inner_text('body'))[:80].replace('\n', ' / '))
        await dp.screenshot(path='/tmp/shots/glu2_gift.png')
        await dp.mouse.move(600, 300); await dp.mouse.move(600, 2, steps=4); await dp.mouse.move(600, -8, steps=3)
        await dp.wait_for_timeout(2500)
        print('after exit-intent on gift ->', exits[-1:] )
        # once-only: reload home, leave again -> should NOT redirect a second time
        await dp.goto(BASE + '/home', wait_until='load'); await dp.wait_for_timeout(2000)
        await dp.mouse.move(600, 300); await dp.mouse.move(600, -8, steps=4); await dp.wait_for_timeout(2000)
        print('second time (once):', dp.url.split('/p/')[-1])
        # ---- back button on mobile
        m2 = await b.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
        mp = await m2.new_page()
        await mp.goto(BASE + '/home', wait_until='load'); await mp.wait_for_timeout(2500)
        try: await mp.go_back(); 
        except Exception as e: print('go_back', str(e)[:60])
        await mp.wait_for_timeout(2500)
        print('after BACK on mobile ->', mp.url.split('/p/')[-1])
        await b.close()
asyncio.run(main())
