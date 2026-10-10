import asyncio, sys
from playwright.async_api import async_playwright
pid = sys.argv[1]
BASE = f"http://web:3000/projects/{pid}/p"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
        exits = []
        async def route(r, req):
            if req.resource_type == 'document' and req.frame.parent_frame is None and 'web:3000' not in req.url:
                exits.append(req.url); await r.abort(); return
            await r.continue_()
        await ctx.route('**/*', route)
        pg = await ctx.new_page()
        await pg.goto(BASE + '/presente-html', wait_until='load'); await pg.wait_for_timeout(1500)
        print('gift closed:', (await pg.inner_text('body'))[:70].replace('\n',' / '))
        await pg.screenshot(path='/tmp/shots/gift_s1.png')
        await pg.locator('[data-vai-next]').first.dispatch_event('click'); await pg.wait_for_timeout(2500)
        print('after tap ->', pg.url.split('/p/')[-1], '|', (await pg.inner_text('body'))[:120].replace('\n',' / '))
        await pg.screenshot(path='/tmp/shots/gift_s2.png')
        c0 = await pg.evaluate("[...document.querySelectorAll('[data-vai-cd]')].map(e=>e.textContent)")
        await pg.wait_for_timeout(2200)
        c1 = await pg.evaluate("[...document.querySelectorAll('[data-vai-cd]')].map(e=>e.textContent)")
        print('countdown', c0, '->', c1)
        btns = await pg.evaluate("[...document.querySelectorAll('[data-vai-href],[data-vai-next]')].map(e => e.tagName + ':' + (e.innerText||'').trim().slice(0,30) + ' -> ' + (e.getAttribute('data-vai-href')||e.getAttribute('data-vai-next')).slice(0,60))")
        print('wired:', btns)
        if btns:
            await pg.locator('[data-vai-href]').first.dispatch_event('click'); await pg.wait_for_timeout(1500)
            print('exit ->', exits[-1:])
        await b.close()
asyncio.run(main())
