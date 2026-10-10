import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await (await b.new_context(viewport={"width":420,"height":800})).new_page()
        pg.on('pageerror', lambda e: print('pageerror', str(e)[:150]))
        await pg.goto("http://172.18.0.1:8099/player.html", wait_until="load"); await pg.wait_for_timeout(2500)
        print('idle: buy visible?', await pg.locator('#buy').is_visible(), '| play button:', await pg.locator('.vai-pl-play').count())
        await pg.screenshot(path='/tmp/shots/player_idle.png')
        await pg.click('.vai-pl'); await pg.wait_for_timeout(1500)
        s = await pg.evaluate("(() => { const v = document.querySelector('.vai-pl-main'); return {t: v.currentTime, paused: v.paused, muted: v.muted, rs: v.readyState, dur: v.duration, bar: document.querySelector('.vai-pl-bar i').style.width} })()")
        print('after click:', s)
        await pg.wait_for_timeout(2500)
        s = await pg.evaluate("(() => { const v = document.querySelector('.vai-pl-main'); return {t: round(v.currentTime), paused: v.paused, bar: document.querySelector('.vai-pl-bar i').style.width, pitch: document.getElementById('buy').hasAttribute('data-vai-shown') } ; function round(x){return Math.round(x*10)/10} })()")
        print('after 4s:', s)
        await pg.screenshot(path='/tmp/shots/player_playing.png')
        await pg.click('.vai-pl'); await pg.wait_for_timeout(500)
        print('after tap (pause):', await pg.evaluate("document.querySelector('.vai-pl-main').paused"))
        # seek lock
        await pg.evaluate("document.querySelector('.vai-pl-main').currentTime = 50"); await pg.wait_for_timeout(600)
        print('seek-ahead blocked? currentTime now', await pg.evaluate("Math.round(document.querySelector('.vai-pl-main').currentTime*10)/10"))
        print('events:', await pg.evaluate("window.__events"))
        # resume
        await pg.reload(wait_until='load'); await pg.wait_for_timeout(1500)
        await pg.click('.vai-pl'); await pg.wait_for_timeout(600)
        print('resume prompt shown?', await pg.locator('.vai-pl-resume.vai-show').count())
        await b.close()
asyncio.run(main())
