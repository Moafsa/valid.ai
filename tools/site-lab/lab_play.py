#!/usr/bin/env python3
"""Plays a lab funnel (the original or its clone) like a visitor and records every screen.
usage: lab_play.py <url> <outdir> [--width 390] [--max 80] [--slow] [--settle 1.3]
Writes <outdir>/steps.json (title, type, step number, arrival time, bytes, longtasks) and one PNG per screen."""
import asyncio, json, os, re, sys, time
from playwright.async_api import async_playwright

args = sys.argv[1:]
URL, OUT = args[0], args[1]
opt = lambda name, default: (args[args.index(name) + 1] if name in args else default)
W = int(opt("--width", 390))
MAXS = int(opt("--max", 80))
SETTLE = float(opt("--settle", 1.3))
SLOW = "--slow" in args
SHOTS = "--noshots" not in args
SCROLL = "--scroll" in args
os.makedirs(OUT, exist_ok=True)

INFO_JS = """() => {
  const s = document.querySelector('section.screen');
  const root = s || document.body;
  const t = root.querySelector('.title, h1, h2');
  return {
    step: s ? s.getAttribute('data-lab-step') : null,
    type: s ? s.getAttribute('data-lab-type') : null,
    title: t ? t.innerText.trim() : (document.title || ''),
    path: location.pathname + location.search + location.hash,
    opts: document.querySelectorAll('.opt, a.opt').length,
    cont: !!document.querySelector('[data-lab-continue], .continue'),
    contDisabled: !!document.querySelector('[data-lab-continue][disabled]'),
    cta: !!document.querySelector('[data-lab-cta], .cta'),
    ctaVisible: (() => { const e = document.querySelector('[data-lab-cta], .cta'); return !!e && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden'; })(),
    fields: document.querySelectorAll('[data-lab-field]').length,
    select: !!document.querySelector('[data-lab-select]'),
    slider: !!document.querySelector('[data-lab-slider]'),
    video: !!document.querySelector('video'),
    pct: (document.querySelector('[data-lab-pct]') || {}).textContent || null,
    h: document.documentElement.scrollHeight
  };
}"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": W, "height": 844 if W < 600 else 900}, is_mobile=W < 600, has_touch=W < 600)
        exits = []

        async def route(r, req):
            host = req.url.split("/")[2] if "//" in req.url else ""
            if req.resource_type == "document" and req.frame.parent_frame is None and "example.com" in host:
                exits.append(req.url)
                await r.abort()
                return
            if "youtube.com" in host or "ytimg" in host or "google" in host:
                await r.abort()
                return
            await r.continue_()
        await ctx.route("**/*", route)
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        cdp = await ctx.new_cdp_session(pg)
        await cdp.send("Network.enable")
        if SLOW:
            await cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
            await cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 150, "downloadThroughput": 200000, "uploadThroughput": 100000})
        bytes_total = {"n": 0}
        cdp.on("Network.loadingFinished", lambda e: bytes_total.__setitem__("n", bytes_total["n"] + int(e.get("encodedDataLength", 0))))
        await pg.add_init_script("""
        (() => {
          const L = (window.__lab = { clicks: [], seen: [], cur: null });
          document.addEventListener('click', () => L.clicks.push(performance.now()), true);
          const key = () => { const s = document.querySelector('section.screen'); const t = (s || document.body).querySelector('.title, h1, h2'); return (s ? s.getAttribute('data-lab-step') : '') + '|' + (t ? t.innerText.trim() : '') + '|' + location.pathname + location.search + location.hash; };
          const eff = el => { let o = 1; for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
          function frame() {
            try {
              const s = document.querySelector('section.screen'); const t = (s || document.body).querySelector('.title, h1, h2');
              const k = key();
              if (k !== (L.cur && L.cur.k)) { L.cur = { k, dom: performance.now(), vis: null }; L.seen.push(L.cur); }
              if (L.cur && L.cur.vis === null && t && eff(t) >= 0.95) L.cur.vis = performance.now();
            } catch (e) {}
            requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        })();
        """)
        await pg.add_init_script("window.__lt=[];try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__lt.push(Math.round(e.duration)))).observe({entryTypes:['longtask']})}catch(e){}")
        t0 = time.time()
        await pg.goto(URL, wait_until="domcontentloaded", timeout=60000)
        lab_last = None
        steps, last_key, stuck, k = [], None, 0, 0
        while k < MAXS and stuck < 14:
            try:
                info = await pg.evaluate(INFO_JS)
            except Exception:
                await pg.wait_for_timeout(300)
                continue
            try:
                lab_last = await pg.evaluate("window.__lab ? {clicks: window.__lab.clicks, seen: window.__lab.seen} : null") or lab_last
            except Exception:
                pass
            key = (info["step"], info["title"], info["path"])
            if key != last_key and (info["title"] or info["step"]):
                last_key = key
                stuck = 0
                arrive = time.time() - t0
                await pg.wait_for_timeout(int(SETTLE * 1000))
                info2 = await pg.evaluate(INFO_JS)
                shot = None
                if SHOTS:
                    shot = f"{OUT}/s{len(steps) + 1:03d}.png"
                    try:
                        await pg.screenshot(path=shot, timeout=15000)
                    except Exception:
                        shot = None
                lt = await pg.evaluate("window.__lt || []")
                steps.append({"n": len(steps) + 1, "step": info["step"], "type": info["type"], "title": info["title"], "path": info["path"], "t": round(arrive, 2),
                              "bytes": bytes_total["n"], "longtasks": len(lt), "ltmax": max(lt) if lt else 0, "pct": info2.get("pct"), "ctaVisible": info2["ctaVisible"], "shot": shot})
                k += 1
                info = info2
            else:
                stuck += 1
            # ---- act ----
            acted = False
            try:
                # a visitor closes the popup that covers the screen before doing anything else
                if await pg.locator("[data-lab-close]:visible").count():
                    await pg.locator("[data-lab-close]:visible").first.click(timeout=1500)
                    await pg.wait_for_timeout(250)
            except Exception:
                pass
            try:
                if info["fields"]:
                    fs = pg.locator("[data-lab-field]")
                    for i in range(await fs.count()):
                        typ = await fs.nth(i).get_attribute("type")
                        await fs.nth(i).fill("ana@email.com" if typ == "email" else "11999990000" if typ == "tel" else "Ana Souza")
                    acted = True
                if info["select"]:
                    await pg.select_option("[data-lab-select]", index=2)
                    acted = True
                if info["slider"]:
                    await pg.evaluate("(() => { const r = document.querySelector('[data-lab-slider]'); r.value = Math.round((+r.min + +r.max) / 2); r.dispatchEvent(new Event('input', {bubbles: true})); })()")
                    acted = True
                if info["opts"] and not info["fields"]:
                    o = pg.locator(".opt")
                    await o.first.dispatch_event("click")
                    if info["type"] == "multi":
                        await o.nth(1).dispatch_event("click")
                    acted = True
                if info["video"]:
                    await pg.evaluate("(() => { const v = document.querySelector('video'); if (v) { v.muted = true; v.play().catch(() => {}); } })()")
                    await pg.wait_for_timeout(4200)
                    if info["ctaVisible"] or (await pg.evaluate(INFO_JS))["ctaVisible"]:
                        await pg.locator("[data-lab-cta], .cta").first.dispatch_event("click")
                    acted = True
                if (info["cont"] and not info["video"]) or acted:
                    await pg.wait_for_timeout(250)
                    cur = await pg.evaluate(INFO_JS)
                    if (cur["step"], cur["title"], cur["path"]) == (info["step"], info["title"], info["path"]):   # still the same screen
                        c = pg.locator("[data-lab-continue]:not([disabled])")
                        if await c.count():
                            await c.first.dispatch_event("click")
                if info["type"] == "result" and info["ctaVisible"]:
                    await pg.locator("[data-lab-cta], .cta").first.dispatch_event("click")
                    await pg.wait_for_timeout(600)
                    if exits:
                        break
            except Exception as e:
                errs.append("act: " + str(e)[:100])
            await pg.wait_for_timeout(350)
            if exits and info["type"] in ("result", "video"):
                break
        if SCROLL:
            # a visitor reads the whole page: everything lazy is fetched by then, so the weight is the real one
            try:
                h = await pg.evaluate("document.documentElement.scrollHeight")
                y = 0
                while y < h:
                    await pg.evaluate(f"window.scrollTo(0, {y})")
                    await pg.wait_for_timeout(250)
                    y += 500
                await pg.wait_for_timeout(1200)
            except Exception:
                pass
        try:
            lab = await pg.evaluate("window.__lab ? {clicks: window.__lab.clicks, seen: window.__lab.seen} : null") or lab_last
        except Exception:
            lab = lab_last
        lats = []
        if lab:
            for i, sn in enumerate(lab["seen"][1:], start=1):
                prior = [c for c in lab["clicks"] if c <= sn["dom"] + 5]
                if prior and sn["vis"] is not None:
                    lats.append([round(sn["dom"] - prior[-1]), round(sn["vis"] - prior[-1])])
        json.dump({"url": URL, "lat": lats, "steps": steps, "exits": exits, "errors": errs[:5], "total_s": round(time.time() - t0, 1), "bytes": bytes_total["n"]}, open(f"{OUT}/steps.json", "w"), ensure_ascii=False, indent=1)
        print(f"{URL}: {len(steps)} screens, exits={exits[-1:]} errors={len(errs)} total={round(time.time() - t0, 1)}s bytes={bytes_total['n']}")
        await b.close()
asyncio.run(main())
