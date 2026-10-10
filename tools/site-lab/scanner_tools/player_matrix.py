import asyncio, json, urllib.parse, sys
from playwright.async_api import async_playwright
BASE = "http://172.18.0.1:8099/pm.html#"
POSTER = "https://interactive-examples.mdn.mozilla.net/media/cc0-images/grapefruit-slice-332-332.jpg"
res = []
def ok(name, cond, extra=""):
    res.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name, extra, flush=True)
async def page(b, cfg, autoplay=True, w=420, h=800):
    ctx = await b.new_context(viewport={"width": w, "height": h})
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: print('   pageerror', str(e)[:150]))
    await pg.goto(BASE + urllib.parse.quote(json.dumps(cfg)), wait_until="load")
    await pg.wait_for_timeout(1200)
    return ctx, pg
VIDEO = "document.querySelector('.vai-pl-main')"
async def state(pg):
    return await pg.evaluate("(() => { const v = %s; return v ? {paused: v.paused, t: Math.round(v.currentTime*10)/10, muted: v.muted, shown: v.style.display !== 'none'} : null })()" % VIDEO)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        b2 = await p.chromium.launch()   # strict autoplay policy (default)
        # 1. click start: idle until clicked
        ctx, pg = await page(b, {"poster": POSTER, "start": "click", "bar": "smart"})
        s = await state(pg); ok("click: not started on open", s and s["paused"] and not s["shown"], s)
        ok("click: has play button", await pg.locator('.vai-pl-play').count() == 1)
        await pg.click('.vai-pl'); await pg.wait_for_timeout(1500)
        s = await state(pg); ok("click: plays after tap", s and not s["paused"] and s["t"] > 0, s)
        await ctx.close()
        # 2. auto start
        ctx, pg = await page(b, {"poster": POSTER, "start": "auto", "bar": "smart"})
        await pg.wait_for_timeout(1500)
        s = await state(pg); ok("auto: plays on open", s and not s["paused"] and s["t"] > 0, s)
        await ctx.close()
        ctx, pg = await page(b2, {"poster": POSTER, "start": "auto", "bar": "smart"})
        await pg.wait_for_timeout(1500)
        s = await state(pg); ok("auto (strict browser): plays muted", s and not s["paused"] and s["muted"], s)
        ok("auto (strict browser): sound tag", await pg.locator('.vai-pl.vai-muted').count() == 1)
        await pg.click('.vai-pl'); await pg.wait_for_timeout(500)
        s = await state(pg); ok("auto: tap turns the sound on and keeps playing", s and not s["paused"] and not s["muted"], s)
        await ctx.close(); 
        # 3. pause free
        ctx, pg = await page(b, {"poster": POSTER, "start": "click", "pause": "free"})
        await pg.click('.vai-pl'); await pg.wait_for_timeout(1500)
        await pg.click('.vai-pl'); await pg.wait_for_timeout(400)
        s = await state(pg); ok("pause free: tap pauses", s and s["paused"], s)
        await pg.click('.vai-pl'); await pg.wait_for_timeout(600)
        s = await state(pg); ok("pause free: tap resumes", s and not s["paused"], s)
        ev = await pg.evaluate("window.__vev"); ok("events: play/pause/resume", ev[:3] == ['play', 'pause', 'resume'], ev)
        await ctx.close()
        # 4. pause never
        ctx, pg = await page(b, {"poster": POSTER, "start": "click", "pause": "never"})
        await pg.click('.vai-pl'); await pg.wait_for_timeout(1500)
        await pg.click('.vai-pl'); await pg.wait_for_timeout(500)
        s = await state(pg); ok("pause never: tap does nothing", s and not s["paused"], s)
        await pg.evaluate("%s.pause()" % VIDEO); await pg.wait_for_timeout(500)
        s = await state(pg); ok("pause never: forced pause comes back", s and not s["paused"], s)
        await ctx.close()
        # 5. pause once
        ctx, pg = await page(b, {"poster": POSTER, "start": "click", "pause": "once"})
        await pg.click('.vai-pl'); await pg.wait_for_timeout(1500)
        await pg.click('.vai-pl'); await pg.wait_for_timeout(400)
        s = await state(pg); ok("pause once: first pause works", s and s["paused"], s)
        await pg.click('.vai-pl'); await pg.wait_for_timeout(600)
        s = await state(pg); ok("pause once: resume works", s and not s["paused"], s)
        await pg.click('.vai-pl'); await pg.wait_for_timeout(500)
        s = await state(pg); ok("pause once: second pause is locked", s and not s["paused"], s)
        await ctx.close()
        # 6. seek
        ctx, pg = await page(b, {"poster": POSTER, "start": "click", "seek": False})
        await pg.click('.vai-pl'); await pg.wait_for_timeout(1500)
        await pg.evaluate("%s.currentTime = 20" % VIDEO); await pg.wait_for_timeout(700)
        s = await state(pg); ok("seek blocked: stays near what was watched", s and s["t"] < 8, s)
        await ctx.close()
        ctx, pg = await page(b, {"poster": POSTER, "start": "click", "seek": True})
        await pg.click('.vai-pl'); await pg.wait_for_timeout(1500)
        await pg.evaluate("%s.currentTime = 5" % VIDEO); await pg.wait_for_timeout(700)
        s = await state(pg); ok("seek allowed", s and s["t"] >= 4.5, s)
        await ctx.close()
        # 7. full controls + fullscreen button
        ctx, pg = await page(b, {"poster": POSTER, "start": "click", "bar": "full", "fullscreen": True})
        await pg.click('.vai-pl'); await pg.wait_for_timeout(1500)
        ok("full: control bar visible", await pg.locator('.vai-pl-ctl').is_visible())
        ok("full: time shown", '/' in (await pg.locator('.vai-pl-ctl span').inner_text()))
        ok("full: fullscreen button", await pg.locator('.vai-pl-ctl button').count() == 3)
        await pg.screenshot(path='/tmp/shots/pm_full.png')
        await pg.click('.vai-pl-ctl button >> nth=0'); await pg.wait_for_timeout(400)
        s = await state(pg); ok("full: play/pause button pauses", s and s["paused"], s)
        await ctx.close()
        # 8. bar none / plain
        ctx, pg = await page(b, {"poster": POSTER, "start": "click", "bar": "none"})
        await pg.click('.vai-pl'); await pg.wait_for_timeout(1200)
        ok("bar none: no bar drawn", not await pg.locator('.vai-pl-bar').is_visible())
        await ctx.close()
        # 9. standalone fullscreen button
        ctx, pg = await page(b, {"poster": POSTER, "start": "click", "bar": "smart", "fullscreen": True})
        await pg.click('.vai-pl'); await pg.wait_for_timeout(1200)
        ok("fs button present", await pg.locator('.vai-pl-fs').count() == 1)
        await ctx.close()
        # 10. embed (iframe made only on click)
        ctx, pg = await page(b, {"src": None, "embed": "about:blank#x", "poster": POSTER, "start": "click"})
        ok("embed: no iframe before the tap", await pg.locator('iframe').count() == 0)
        await pg.click('.vai-pl'); await pg.wait_for_timeout(500)
        ok("embed: iframe after the tap", await pg.locator('iframe').count() == 1)
        await ctx.close()
        # 11. proportion kept on different widths
        for w in (360, 1280):
            ctx, pg = await page(b, {"poster": POSTER, "start": "click"}, w=w)
            box = await pg.evaluate("(() => { const r = document.querySelector('.vai-pl').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] })()")
            ok("ratio at %d" % w, abs(box[1] / box[0] - 0.5625) < 0.01, box)
            await ctx.close()
        # 12. pitch: the offer appears at the moment
        ctx, pg = await page(b, {"poster": POSTER, "start": "click"})
        ok("pitch: hidden before", not await pg.locator('#buy').is_visible())
        await pg.click('.vai-pl'); await pg.wait_for_timeout(3500)
        ok("pitch: visible after 2s of video", await pg.locator('#buy').is_visible())
        await ctx.close()
        await b.close(); await b2.close()
    bad = [n for n, o in res if not o]
    print("\n%d/%d passed" % (len(res) - len(bad), len(res)), "FAILED:" if bad else "", bad)
asyncio.run(main())
