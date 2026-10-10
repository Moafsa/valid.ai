import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await (await b.new_context(viewport={"width":390,"height":844},is_mobile=True,device_scale_factor=2)).new_page()
        await pg.goto('https://be-vallid.com/',wait_until='networkidle'); await pg.wait_for_timeout(800)
        print('overflow-x', await pg.evaluate('document.documentElement.scrollWidth'), 'html bg', await pg.evaluate("getComputedStyle(document.documentElement).backgroundColor"))
        await pg.screenshot(path='/tmp/shots/lp_m1.png')
        el=await pg.query_selector('text=Se existe uma versão'); await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(500)
        await pg.screenshot(path='/tmp/shots/lp_m2.png'); await b.close()
asyncio.run(main())
