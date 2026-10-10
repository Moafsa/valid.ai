"""Opens a clone in a real browser and checks the thing that is tied to the video: hidden at the start, still hidden before its second, shown after.
The video clock is fed the way the player gets it (a native video's timeupdate, or the message a YouTube / Vimeo frame sends), so the real code path runs.
usage (scanner image, --network host):  reveal_check.py <base> <projectId> <slug> "<button text>" <at seconds> [native|youtube|vimeo]"""
import asyncio, json, sys
from playwright.async_api import async_playwright
BASE, PID, SLUG, TEXT, AT = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], float(sys.argv[5])
KIND = sys.argv[6] if len(sys.argv) > 6 else "youtube"
fails = 0
def ok(c, what, extra=""):
    global fails
    print(("PASS  " if c else "FAIL  ") + what + ("" if c else "   -> " + str(extra)[:240]))
    if not c: fails += 1
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": 430, "height": 900}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(f"{BASE}/projects/{PID}/p/{SLUG}?vai_test=1", wait_until="load")
        await pg.wait_for_timeout(1500)
        state = "(() => { const e = [...document.querySelectorAll('a,button')].find(x => (x.textContent||'').trim().startsWith(%s)); if (!e) return 'missing'; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return (cs.display === 'none' || r.height < 2) ? 'hidden' : 'shown'; })()" % json.dumps(TEXT[:20])
        ok(await pg.locator("[data-vai-player]").count() >= 1, "the page has the smart player")
        ok(await pg.evaluate(state) == "hidden", "the button is hidden when the page opens", await pg.evaluate(state))
        # press play the way a visitor does
        await pg.locator("[data-vai-player]").first.click()
        await pg.wait_for_timeout(1200)
        frame = await pg.evaluate("(() => { const f = document.querySelector('[data-vai-player] iframe'); return f ? f.src : null })()")
        if KIND != "native":
            ok(frame and ("enablejsapi=1" in frame if KIND == "youtube" else "api=1" in frame), "the frame is created asking to report its clock", frame)
        async def clock(t):
            if KIND == "native":
                await pg.evaluate("t => window.dispatchEvent(new CustomEvent('vai:video-time', {detail: {t: t}}))", t)
            elif KIND == "youtube":
                await pg.evaluate("t => { const f = document.querySelector('[data-vai-player] iframe'); window.dispatchEvent(new MessageEvent('message', {data: JSON.stringify({event: 'infoDelivery', info: {currentTime: t, playerState: 1, duration: 300}}), source: f.contentWindow})) }", t)
            else:
                await pg.evaluate("t => { const f = document.querySelector('[data-vai-player] iframe'); window.dispatchEvent(new MessageEvent('message', {data: JSON.stringify({event: 'timeupdate', data: {seconds: t, duration: 300}}), source: f.contentWindow})) }", t)
            await pg.wait_for_timeout(250)
        await clock(max(1, AT - 15))
        ok(await pg.evaluate(state) == "hidden", f"still hidden at {AT - 15:.0f}s of the video", await pg.evaluate(state))
        await clock(AT + 3)
        ok(await pg.evaluate(state) == "shown", f"shown at {AT + 3:.0f}s of the video", await pg.evaluate(state))
        ok(not errs, "no script errors", errs[:2])
        await b.close()
    print("\nALL PASSED" if fails == 0 else f"\n{fails} FAILED")
    sys.exit(1 if fails else 0)
asyncio.run(main())
