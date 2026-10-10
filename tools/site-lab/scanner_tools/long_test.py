import asyncio, sys
from playwright.async_api import async_playwright
pid = sys.argv[1]
BASE = f"http://web:3000/projects/{pid}/p"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width":390,"height":844})
        exits = []
        async def route(r, req):
            if req.resource_type == 'document' and req.frame.parent_frame is None and 'web:3000' not in req.url:
                exits.append(req.url); await r.abort(); return
            await r.continue_()
        await ctx.route('**/*', route)
        pg = await ctx.new_page()
        await pg.goto(BASE + '/etapa-5', wait_until='load')
        print('Q:', (await pg.inner_text('h1')).strip())
        await pg.locator('[data-vai-next]').nth(2).click()      # option C of Q5
        await pg.wait_for_timeout(1200)
        print('after option C ->', pg.url.split('/p/')[-1], '|', (await pg.inner_text('h1')).strip())
        await pg.click('a.cta, [data-vai-href]'); await pg.wait_for_timeout(800)
        print('exit ->', exits[-1:])
        # normal path: Q5 option A -> Q6
        await pg.goto(BASE + '/etapa-5', wait_until='load')
        await pg.locator('[data-vai-next]').nth(0).click(); await pg.wait_for_timeout(900)
        print('option A ->', pg.url.split('/p/')[-1], '|', (await pg.inner_text('h1')).strip())
        # last step
        pages = None
        await pg.goto(BASE + '/etapa-61', wait_until='load')
        print('Q60:', (await pg.inner_text('h1')).strip())
        await pg.locator('[data-vai-next]').nth(0).click(); await pg.wait_for_timeout(900)
        print('after Q60 ->', pg.url.split('/p/')[-1], '|', (await pg.inner_text('h1')).strip())
        await pg.click('[data-vai-href]'); await pg.wait_for_timeout(800)
        print('final exit ->', exits[-1:])
        await b.close()
asyncio.run(main())
