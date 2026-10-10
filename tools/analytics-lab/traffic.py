#!/usr/bin/env python3
"""Real visitors for the analytics center: every one is a real browser opening the published test page, coming from
an ad / search / nowhere, on a phone or a computer, doing something specific (watching the video up to a known second,
pressing the button, filling the form, hammering something that does not respond, or leaving at once).

What each did is written to truth.json; verify.ts then checks that what the dashboard's queries say is what happened.

usage: traffic.py <state.json> <truth.json> [--mode main|ab] [--n 1.0]
"""
import asyncio, json, random, sys, time

from playwright.async_api import async_playwright

WEB = "http://web:3000"
UA_PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
UA_DESK = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
UA_IG = "Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 Instagram 345.0.0.34.108 Android (33/13; 480dpi; 1080x2340; samsung; SM-A546E; a54x; exynos1380; pt_BR; 606388439)"
UA_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"

IPS = {"BR": "200.147.67.14", "US": "8.8.8.8", "PT": "193.137.78.1"}
TZ = {"BR": "America/Sao_Paulo", "US": "America/New_York", "PT": "Europe/Lisbon"}

# who comes: (source label, referrer, utm query, device kind, count, how far they watch (media seconds, None = never press play), press the button after, fill the form after)
FB = "utm_source=facebook&utm_medium=cpc&utm_campaign={c}&utm_content={a}&fbclid=IwAR_{c}"
PERSONAS = [
    # campaign A (facebook, phone): worse retention
    dict(name="fb_A", ref="https://l.facebook.com/", q=FB.format(c="campA", a="adA1"), dev="mobile", ua=UA_PHONE, vp=(390, 844), geo="BR", n=14,
         watch=[None] * 2 + [8] * 3 + [20] * 3 + [35] * 3 + [50] * 2 + [60] * 1, cta_after=45, lead=0.0, scroll=0.7),
    # campaign B (facebook, phone): better retention
    dict(name="fb_B", ref="https://l.facebook.com/", q=FB.format(c="campB", a="adB1"), dev="mobile", ua=UA_ANDROID, vp=(412, 915), geo="BR", n=14,
         watch=[None] * 1 + [8] * 1 + [20] * 2 + [35] * 3 + [50] * 3 + [60] * 4, cta_after=45, lead=0.0, scroll=0.9),
    # google organic, desktop, readers: they fill the form
    dict(name="google", ref="https://www.google.com/", q="", dev="desktop", ua=UA_DESK, vp=(1366, 768), geo="US", n=10,
         watch=[None] * 3 + [20] * 4 + [60] * 3, cta_after=None, lead=0.6, scroll=1.0),
    # nowhere (direct), desktop: most leave at once
    dict(name="direct", ref=None, q="", dev="desktop", ua=UA_MAC, vp=(1280, 800), geo="PT", n=8,
         watch=[None] * 8, cta_after=None, lead=0.0, scroll=0.0, bounce=True),
    # Instagram, phone, with a tracker blocker: the script (or its reports) never gets out. The server must still count them.
    dict(name="blocked", ref="https://l.instagram.com/", q="utm_source=instagram&utm_medium=social&utm_campaign=campC", dev="mobile", ua=UA_IG, vp=(412, 915), geo="BR", n=6,
         watch=[None] * 6, cta_after=None, lead=0.0, scroll=0.5, blocked=True),
]


def plan(scale: float):
    random.seed(7)
    out = []
    for p in PERSONAS:
        n = max(1, round(p["n"] * scale))
        watches = (p["watch"] * 3)[: max(n, len(p["watch"]))] if scale >= 1 else p["watch"][:n]
        watches = list(p["watch"])
        for i in range(n):
            w = watches[i % len(watches)]
            v = dict(p)
            v["id"] = f'{p["name"]}_{i}'
            v["watch_to"] = w
            v["press_cta"] = bool(p["cta_after"] and w is not None and w >= p["cta_after"])
            v["fill_lead"] = (random.random() < p["lead"]) if p["lead"] else False
            v["rage"] = (i % 5 == 0) and not p.get("bounce")           # one in five hammers the "bonus" box that does nothing
            v["dead"] = (i % 7 == 3) and not p.get("bounce")           # some press it once, slowly
            v["checkout"] = (i % 6 == 1) and not p.get("bounce") and not v["press_cta"]
            v["returning"] = (p["name"] == "google" and i < 2)
            if p.get("blocked"):
                v["block"] = "script" if i % 2 == 0 else "post"
                v["press_cta"] = i in (0, 1, 3)
                v["rage"] = v["dead"] = v["checkout"] = False
            out.append(v)
    return out


async def visit(browser, v, slug, results, sem):
    async with sem:
        t = {"id": v["id"], "persona": v["name"], "device": v["dev"], "source": {"fb_A": "facebook", "fb_B": "facebook", "google": "google", "direct": "direct", "blocked": "instagram"}[v["name"]],
             "campaign": ("campA" if v["name"] == "fb_A" else "campB" if v["name"] == "fb_B" else "campC" if v["name"] == "blocked" else None), "block": v.get("block"), "country": v["geo"],
             "watch_to": v["watch_to"], "press_cta": v["press_cta"], "fill_lead": v["fill_lead"], "rage": v["rage"], "dead": v["dead"], "checkout": v["checkout"],
             "returning": v["returning"], "ok": False}
        w, h = v["vp"]
        ctx = await browser.new_context(user_agent=v["ua"], viewport={"width": w, "height": h}, is_mobile=v["dev"] == "mobile", has_touch=v["dev"] == "mobile",
                                         timezone_id=TZ[v["geo"]], locale="pt-BR", extra_http_headers={"x-forwarded-for": IPS[v["geo"]]})
        page = await ctx.new_page()
        if v.get("block") == "script":
            await page.route("**/vai-m.js", lambda r: r.abort())
        elif v.get("block") == "post":
            async def drop_reports(r):
                if '"v":1' in (r.request.post_data or ""):
                    await r.abort()
                else:
                    await r.continue_()
            await page.route("**/api/track**", drop_reports)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:120]))
        try:
            url = f"{WEB}/s/{slug}?vai_test=1" + (("&" + v["q"]) if v["q"] else "")
            await page.goto(url, referer=v["ref"] or None, wait_until="load")
            await page.wait_for_timeout(900)
            if v.get("bounce"):
                await page.wait_for_timeout(random.randint(400, 1200))
            else:
                # read a little, scroll as far as this person scrolls
                depth = v["scroll"]
                total = await page.evaluate("Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)")
                target = int(max(0, (total - h) * depth))
                y = 0
                while y < target:
                    y = min(target, y + 400)
                    await page.evaluate(f"window.scrollTo(0, {y})")
                    await page.wait_for_timeout(120)
                await page.evaluate("window.scrollTo(0, 0)")
                await page.wait_for_timeout(500)
                if v["watch_to"] is not None:
                    await page.click("#vsl")
                    await page.wait_for_function("(() => { const x = document.querySelector('video.vai-pl-main'); return x && x.currentTime > 0.3 && !x.paused })()", timeout=20000)
                    await page.evaluate("document.querySelector('video.vai-pl-main').playbackRate = 4")
                    if v["name"] == "google" and v["watch_to"] == 60:
                        # one viewer who jumps ahead: watches 6s, skips to 40s, watches to the end
                        await page.wait_for_function("document.querySelector('video.vai-pl-main').currentTime >= 6", timeout=20000)
                        await page.evaluate("document.querySelector('video.vai-pl-main').currentTime = 40")
                        t["skipped"] = [6, 40]
                    await page.wait_for_function(f"(() => {{ const x = document.querySelector('video.vai-pl-main'); return x.currentTime >= {v['watch_to']} || x.ended }})()", timeout=60000)
                    await page.wait_for_timeout(300)
                    await page.evaluate("document.querySelector('video.vai-pl-main').pause()")
                    await page.wait_for_timeout(300)
                if v["rage"]:
                    await page.evaluate("document.getElementById('fake').scrollIntoView({block:'center'})")
                    box = await page.locator("#fake").bounding_box()
                    for _ in range(4):
                        await page.mouse.click(box["x"] + 20, box["y"] + 10)
                        await page.wait_for_timeout(120)
                if v["dead"]:
                    await page.evaluate("document.getElementById('fake').scrollIntoView({block:'center'})")
                    await page.wait_for_timeout(1500)                      # let the rage detector's window pass
                    box = await page.locator("#fake").bounding_box()
                    await page.mouse.click(box["x"] + 60, box["y"] + 14)
                    await page.wait_for_timeout(900)
                if v["fill_lead"]:
                    await page.evaluate("document.getElementById('lead').scrollIntoView({block:'center'})")
                    await page.fill("#lead input[name=email]", f"{v['id']}@teste.dev")
                    await page.click("#send")
                    await page.wait_for_timeout(900)
                if v["checkout"]:
                    # a link out: the request is aborted (nothing listens there), the click and the "outbound" are what is measured
                    await page.route("https://pay.hotmart.com/**", lambda r: r.abort())
                    await page.evaluate("document.getElementById('checkout').scrollIntoView({block:'center'})")
                    await page.click("#checkout", no_wait_after=True)
                    await page.wait_for_timeout(800)
                if v["press_cta"]:
                    await page.evaluate("document.getElementById('cta') && document.getElementById('cta').scrollIntoView({block:'center'})")
                    await page.click("#cta")
                    await page.wait_for_selector("#thanks", timeout=8000)
                    await page.wait_for_timeout(1500)
                if v["returning"]:
                    # same browser, hours later: a new visit of a known visitor
                    await page.goto("about:blank")
                    await page.wait_for_timeout(600)
                    await page.evaluate("0") if False else None
            # leaving: the page goes away (this is what flushes the last batch)
            await page.goto("about:blank")
            await page.wait_for_timeout(700)
            if v["returning"]:
                # same browser, hours later: the old visit is aged before the page's own script looks at it, so this is a NEW visit of a KNOWN visitor
                p2 = await ctx.new_page()
                await ctx.add_cookies([{"name": "vai_s", "value": "0123456789abcdef.0.1", "url": WEB}])
                await p2.add_init_script("try{const s=JSON.parse(localStorage.getItem('vai_s')||'null');if(s){s.last=Date.now()-3600000;localStorage.setItem('vai_s',JSON.stringify(s))}}catch(e){}")
                await p2.goto(f"{WEB}/s/{slug}?vai_test=1&utm_source=google&utm_medium=organic", wait_until="load")
                await p2.wait_for_timeout(1500)
                await p2.goto("about:blank")
                await p2.wait_for_timeout(600)
            t["ok"] = True
        except Exception as e:
            t["error"] = str(e)[:200]
        t["page_errors"] = errors[:3]
        try:
            await ctx.close()
        except Exception:
            pass
        results.append(t)


async def main():
    state = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    scale = float(sys.argv[sys.argv.index("--n") + 1]) if "--n" in sys.argv else 1.0
    visitors = plan(scale)
    results: list = []
    started = time.time()
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        sem = asyncio.Semaphore(5)
        await asyncio.gather(*[visit(browser, v, state["slug"], results, sem) for v in visitors])
        await browser.close()
    json.dump({"state": state, "visitors": results, "seconds": round(time.time() - started)}, open(out, "w"), indent=1)
    ok = sum(1 for r in results if r["ok"])
    print(f"{ok}/{len(results)} visitors done in {round(time.time() - started)}s")
    for r in results:
        if not r["ok"]:
            print("FAILED", r["id"], r.get("error"))


asyncio.run(main())
