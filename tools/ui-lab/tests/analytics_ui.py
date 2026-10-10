"""Looks at the analytics center the way the owner does: every screen, light and dark, wide and phone-sized, with the REAL
numbers of the test project (the API is the real route handlers against the database, served by analytics-lab's serve_api.ts).
usage: analytics_ui.py <projectId> <slug> [view ...]
"""
import asyncio, json, sys, os
sys.path.insert(0, "/ui/tests")
from uilab import serve
from playwright.async_api import async_playwright

API = "http://an_api:3100"
PID, SLUG = sys.argv[1], sys.argv[2]
VIEWS = sys.argv[3:] or ["overview", "audience", "journey", "video", "maps", "friction", "recordings", "sources", "sessions", "ai", "tests", "settings"]
os.makedirs("/ui/dist/data", exist_ok=True)
open("/ui/dist/data/analytics.js", "w").write("window.__FIXTURE=" + json.dumps({"projectId": PID, "slug": SLUG, "name": "TEST analytics"}))
fails = 0
def ok(c, what, extra=""):
    global fails
    print(("PASS  " if c else "FAIL  ") + what + ("" if c else "  -> " + str(extra)))
    if not c: fails += 1

async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for theme, vp in (("light", (1440, 900)), ("dark", (1440, 900)), ("light", (390, 844))):
            ctx = await b.new_context(viewport={"width": vp[0], "height": vp[1]}, device_scale_factor=1)
            await ctx.add_init_script(f"try{{localStorage.setItem('vai-editor-theme','{theme}')}}catch(e){{}}")
            pg = await ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
            async def api(route):
                u = route.request.url
                path = u.split("8123")[-1]
                r = await route.fetch(url=API + path, method=route.request.method, post_data=route.request.post_data, headers={"content-type": "application/json"})
                await route.fulfill(response=r)
            await pg.route("**/api/projects/*/analytics/**", api)
            for v in VIEWS:
                await pg.goto(f"http://127.0.0.1:8123/analytics.html?v={v}&period=24h")
                await pg.wait_for_selector(".an-page", timeout=20000)
                await pg.wait_for_timeout(2500 if v in ("maps", "recordings") else 1200)
                n_err = await pg.locator(".an-err").count()
                tag = f"{theme}_{vp[0]}"
                await pg.screenshot(path=f"/ui/shots/analytics_{v}_{tag}.png", full_page=False)
                ok(n_err == 0, f"{v} [{tag}] renders without an error box", await pg.locator(".an-err").first.inner_text() if n_err else "")
                if vp[0] == 1440 and theme == "light":
                    ov = await pg.evaluate("document.querySelector('.an-main').scrollWidth <= document.querySelector('.an-main').clientWidth + 2")
                    ok(ov, f"{v}: no sideways scroll")
            ok(not errs, f"[{theme}_{vp[0]}] no page errors", errs[:2])
            await ctx.close()
        await b.close()
    srv.terminate()
    print("\nALL PASSED" if fails == 0 else f"\n{fails} FAILED")
    sys.exit(1 if fails else 0)
asyncio.run(main())
