"""Opens clones with a video in a real browser and watches what it fetches: the playlist and the first pieces must come from OUR storage, nothing from the
original site; the page must show the player (with the 'sound' tag when it starts muted) and keep its button working.
usage (scanner image, --network host):  play_check.py <base> <name:projectId:slug> ...   e.g. https://be-vallid.com vsl_mp4:abc123:home"""
import asyncio, re, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1]
fails = 0
def ok(c, what, extra=""):
    global fails
    print(("PASS  " if c else "FAIL  ") + what + ("" if c else "   -> " + str(extra)[:300]))
    if not c: fails += 1
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        for spec in sys.argv[2:]:
            name, pid, slug = spec.split(":")
            pg = await b.new_page(viewport={"width": 390, "height": 844}); reqs = []; errs = []
            pg.on("request", lambda r: reqs.append(r.url)); pg.on("pageerror", lambda e: errs.append(str(e)))
            await pg.goto(f"{BASE}/projects/{pid}/p/{slug}?vai_test=1", wait_until="load")
            await pg.wait_for_timeout(1500)
            player = await pg.locator("[data-vai-player]").count()
            ok(player >= 1, f"{name}: the page has the smart player", player)
            # start it the way a visitor does (a tap on the cover), then give the pieces time to arrive
            try: await pg.locator("[data-vai-player]").first.click(timeout=3000)
            except Exception: pass
            await pg.wait_for_timeout(6000)
            m3u8 = [u for u in reqs if ".m3u8" in u]
            pieces = [u for u in reqs if re.search(r"\.(ts|m4s)(\?|$)", u)]
            ok(m3u8 and all("s3.be-vallid.com" in u for u in m3u8), f"{name}: the playlist comes from our storage", m3u8[:2])
            ok(pieces and all("s3.be-vallid.com" in u for u in pieces), f"{name}: the pieces come from our storage ({len(pieces)} fetched, not the whole video)", pieces[:2])
            ok(not [u for u in reqs if "172.18.0.1" in u and "/media/" in u], f"{name}: nothing is fetched from the original site", [u for u in reqs if "/media/" in u and "s3." not in u][:2])
            ok(not [u for u in reqs if re.search(r"\.mp4(\?|$)", u) and not re.search(r"/aux_\d+\.mp4|init", u)], f"{name}: no whole .mp4 file is downloaded", [u for u in reqs if u.endswith(".mp4")][:2])
            ok(await pg.locator("a.cta, a[href*=hotmart]").count() >= 1, f"{name}: the buy button is still there")
            ok(not errs, f"{name}: no script errors", errs[:2])
            st = await pg.evaluate("(() => { const v = document.querySelector('[data-vai-player] video.vai-pl-main, video'); return v ? {paused: v.paused, t: v.currentTime, ready: v.readyState, muted: v.muted, err: v.error && v.error.code} : null })()")
            print("      video state:", st)
            await pg.close()
        await b.close()
    print("\nALL PASSED" if fails == 0 else f"\n{fails} FAILED")
    sys.exit(1 if fails else 0)
asyncio.run(main())
