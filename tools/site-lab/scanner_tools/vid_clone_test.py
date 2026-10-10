import asyncio, sys
from playwright.async_api import async_playwright
pid = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await (await b.new_context(viewport={"width": 420, "height": 900})).new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:120]))
        await pg.goto(f"http://web:3000/projects/{pid}/p/videos-html", wait_until="load"); await pg.wait_for_timeout(1500)
        print('players mounted:', await pg.evaluate("[...document.querySelectorAll('[data-vai-player]')].map(e => e.getAttribute('data-vai-ready'))"))
        print('decorative video playing:', await pg.evaluate("(() => { const v = document.querySelector('.hero video'); return v ? [!v.paused, v.muted] : 'missing' })()"))
        await pg.screenshot(path='/tmp/shots/vid1_idle.png', full_page=True)
        await pg.locator('[data-vai-player]').first.scroll_into_view_if_needed()
        await pg.locator('[data-vai-player]').first.click(); await pg.wait_for_timeout(1500)
        print('video player after tap:', await pg.evaluate("(() => { const v = document.querySelector('.vai-pl-main'); return v ? {paused: v.paused, t: v.currentTime} : null })()"))
        print('full controls visible:', await pg.locator('.vai-pl-ctl').first.is_visible())
        await pg.locator('[data-vai-player]').nth(1).scroll_into_view_if_needed()
        await pg.locator('[data-vai-player]').nth(1).click(); await pg.wait_for_timeout(800)
        print('youtube iframe created on tap:', await pg.evaluate("document.querySelectorAll('iframe').length"), await pg.evaluate("(document.querySelector('iframe')||{}).src"))
        await pg.screenshot(path='/tmp/shots/vid1_after.png', full_page=True)
        print('errors:', errs)
        await b.close()
asyncio.run(main())
