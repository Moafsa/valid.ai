#!/usr/bin/env python3
"""Opens the original and the clone side by side, takes a screenshot of each at the same moments after load
(no clicking) and reports the pixel difference. For things that happen BY THEMSELVES: chat bubbles, loaders,
popups, carousels, late buttons, countdowns.
usage: lab_timeline.py <orig_url> <clone_url> <outdir> [--times 0.6,2,4,7,11] [--width 390] [--full]"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
try:
    from PIL import Image, ImageChops
except Exception:
    Image = None
args = sys.argv[1:]
A, B, OUT = args[0], args[1], args[2]
opt = lambda n, d: args[args.index(n) + 1] if n in args else d
TIMES = [float(x) for x in opt("--times", "0.6,2,4,7,11").split(",")]
W = int(opt("--width", 390))
FULL = "--full" in args
os.makedirs(OUT, exist_ok=True)

async def run(p, url, tag):
    b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = await b.new_context(viewport={"width": W, "height": 844 if W < 600 else 900}, is_mobile=W < 600, has_touch=W < 600)
    async def route(r, req):
        host = req.url.split("/")[2] if "//" in req.url else ""
        if req.resource_type == "document" and req.frame.parent_frame is None and "example.com" in host:
            await r.abort(); return
        if "youtube" in host or "ytimg" in host or "google" in host:
            await r.abort(); return
        await r.continue_()
    await ctx.route("**/*", route)
    pg = await ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
    await pg.goto(url, wait_until="domcontentloaded")
    import time
    t0 = time.time()
    shots = []
    SC = [int(x) for x in opt("--scrolls", "").split(",") if x != ""]
    if SC:
        await pg.wait_for_timeout(1500)
    for t in (SC if SC else TIMES):
        if SC:
            await pg.evaluate(f"window.scrollTo(0, {t})")
            await pg.wait_for_timeout(700)
        else:
            wait = t - (time.time() - t0)
            if wait > 0:
                await pg.wait_for_timeout(int(wait * 1000))
        f = f"{OUT}/{tag}_{int(t * 10):03d}.png"
        await pg.screenshot(path=f, full_page=FULL)
        text = await pg.evaluate("(document.body.innerText || '').replace(/\\s+/g,' ').trim().slice(0, 140)")
        shots.append((t, f, text))
    await b.close()
    return shots, errs

def diff(fa, fb):
    if not Image: return None
    ia, ib = Image.open(fa).convert("RGB"), Image.open(fb).convert("RGB")
    if ia.size != ib.size:
        h = min(ia.height, ib.height); ia, ib = ia.crop((0, 0, ia.width, h)), ib.crop((0, 0, ib.width, h))
    hist = ImageChops.difference(ia, ib).convert("L").histogram()
    return round(sum(hist[25:]) / (ia.size[0] * ia.size[1]) * 100, 2)

async def main():
    async with async_playwright() as p:
        (sa, ea), (sb, eb) = await asyncio.gather(run(p, A, "orig"), run(p, B, "clone"))
        print(f"{'t(s)':>5}  diff%   original text | clone text")
        worst = 0
        for (t, fa, ta), (_, fb, tb) in zip(sa, sb):
            d = diff(fa, fb); worst = max(worst, d or 0)
            print(f"{t:>5}  {str(d):>6}  {ta[:48]!r} | {tb[:48]!r}")
        print("errors orig/clone:", ea[:2], eb[:2], "| worst diff", worst)
asyncio.run(main())
