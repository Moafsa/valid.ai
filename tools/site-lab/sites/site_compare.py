#!/usr/bin/env python3
"""Original vs clone for many real sites (home pages / landings).
Runs inside the scanner image (Playwright + Pillow), reaches the web app at http://web:3000.

usage: site_compare.py <sites.tsv> <scan_results.jsonl> <outdir> [--workers 3] [--from 1] [--to 9999] [--only 3,7]
For each scanned site and for widths 1440 and 390 it loads the original and the clone, scrolls through the page
(lazy images, reveals), then records: height/width, overflow, visible text recall, images (broken), videos/iframes
boxes (mini-player check), fonts, requests/bytes, hotlinks to the original, console errors, and the pixel
difference by screen-sized tile. Screenshots are saved so the worst ones can be looked at.
"""
import asyncio, json, os, re, sys, time
from urllib.parse import urlparse
from playwright.async_api import async_playwright
from PIL import Image, ImageChops

args = sys.argv[1:]
LIST, RES, OUT = args[0], args[1], args[2]
opt = lambda n, d: args[args.index(n) + 1] if n in args else d
WORKERS = int(opt("--workers", 3))
FROM, TO = int(opt("--from", 1)), int(opt("--to", 99999))
ONLY = {int(x) for x in opt("--only", "").split(",") if x}
WEB = "http://web:3000"
WIDTHS = [(1440, 900), (390, 844)]
MAX_SHOT_H = 7000

JS_METRICS = r"""
() => {
  const de = document.documentElement, b = document.body;
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity || '1') > 0.05; };
  const rect = el => { const r = el.getBoundingClientRect(); return [Math.round(r.left + scrollX), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)]; };
  const text = (b.innerText || '').replace(/\s+/g, ' ').trim();
  const imgs = [...document.images];
  const imgVis = imgs.filter(vis);
  const broken = imgVis.filter(i => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src));
  const media = [...document.querySelectorAll('video,iframe,[data-vai-player],vturb-smartplayer,wistia-player,[id^=vid_],[class*=smartplayer],[class*=video-player]')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 60 && r.height > 40; });
  const mediaInfo = media.map(el => { const cs = getComputedStyle(el); return { tag: el.tagName.toLowerCase(), src: (el.currentSrc || el.src || el.getAttribute('data-src') || '').slice(0, 90), rect: rect(el), fixed: cs.position === 'fixed' || !!el.closest('[style*="position: fixed"],[style*="position:fixed"]'), player: el.hasAttribute('data-vai-player') }; });
  const heads = [...document.querySelectorAll('h1,h2')].filter(vis).map(h => h.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12);
  const bodyCs = getComputedStyle(b);
  const faces = []; try { document.fonts.forEach(f => faces.push(f.family.replace(/["']/g, '') + ':' + f.status)); } catch (e) {}
  const fixedEls = [...document.querySelectorAll('body *')].filter(el => { const cs = getComputedStyle(el); return cs.position === 'fixed' && vis(el); }).slice(0, 12).map(el => ({ tag: el.tagName.toLowerCase(), cls: (el.className && el.className.baseVal === undefined ? el.className : '').toString().slice(0, 50), rect: rect(el) }));
  return {
    docH: Math.max(de.scrollHeight, b.scrollHeight), docW: Math.max(de.scrollWidth, b.scrollWidth), clientW: de.clientWidth,
    textLen: text.length, text: text.slice(0, 20000),
    imgs: imgs.length, imgVis: imgVis.length, broken: broken.length, brokenSrc: broken.slice(0, 4).map(i => (i.currentSrc || i.src).slice(0, 100)),
    svgs: document.querySelectorAll('svg').length, canvases: document.querySelectorAll('canvas').length,
    videos: document.querySelectorAll('video').length, iframes: document.querySelectorAll('iframe').length,
    links: document.querySelectorAll('a[href]').length, buttons: document.querySelectorAll('button,[role=button],a.btn,a[class*=button]').length,
    inputs: document.querySelectorAll('input,select,textarea').length, forms: document.forms.length,
    heads, media: mediaInfo, fixed: fixedEls,
    bg: bodyCs.backgroundColor, font: bodyCs.fontFamily.slice(0, 80), faces: faces.slice(0, 20),
    title: document.title.slice(0, 80), scripts: document.scripts.length,
  };
}
"""

AUTOSCROLL = r"""
async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let y = 0, last = -1, n = 0;
  while (n++ < 60) {
    const h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    if (y >= h || y > 26000) break;
    window.scrollTo(0, y); y += Math.round(innerHeight * 0.75);
    await sleep(110);
  }
  window.scrollTo(0, 0);
  await sleep(500);
}
"""


async def load_and_measure(browser, url, w, h, tag, shot_path, clone_host=None):
    ctx = await browser.new_context(
        viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600, device_scale_factor=1,
        user_agent=("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1" if w < 600 else "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"),
        ignore_https_errors=True, locale="pt-BR")
    page = await ctx.new_page()
    errors, failed, reqs = [], [], {}
    page.on("pageerror", lambda e: errors.append(str(e)[:120]))
    page.on("console", lambda m: errors.append("console: " + m.text[:100]) if m.type == "error" else None)
    page.on("requestfailed", lambda r: failed.append(r.url[:120]))
    cdp = await ctx.new_cdp_session(page)
    await cdp.send("Network.enable")
    cdp.on("Network.requestWillBeSent", lambda e: reqs.setdefault(e["requestId"], {"url": e["request"]["url"], "bytes": 0}))
    def fin(e):
        if e["requestId"] in reqs: reqs[e["requestId"]]["bytes"] = e.get("encodedDataLength", 0)
    cdp.on("Network.loadingFinished", fin)
    res = {"url": url, "ok": False}
    t0 = time.time()
    try:
        try:
            await page.goto(url, wait_until="load", timeout=45000)
        except Exception as e:
            res["gotoError"] = str(e)[:100]
        try:
            await page.wait_for_load_state("networkidle", timeout=3500)
        except Exception:
            pass
        res["loadSec"] = round(time.time() - t0, 1)
        try:
            await asyncio.wait_for(page.evaluate(AUTOSCROLL), 40)
        except Exception as e:
            res["scrollError"] = str(e)[:80]
        await page.wait_for_timeout(700)
        m = await page.evaluate(JS_METRICS)
        res.update(m)
        full_h = min(m["docH"], MAX_SHOT_H)
        await page.screenshot(path=shot_path, full_page=True, clip={"x": 0, "y": 0, "width": w, "height": full_h}, timeout=60000)
        res["ok"] = True
    except Exception as e:
        res["error"] = str(e)[:200]
    hosts = {}
    for r in reqs.values():
        try: hh = urlparse(r["url"]).netloc
        except Exception: hh = "?"
        d = hosts.setdefault(hh, [0, 0]); d[0] += 1; d[1] += r["bytes"]
    res["requests"] = len(reqs); res["kb"] = round(sum(r["bytes"] for r in reqs.values()) / 1024)
    res["hosts"] = dict(sorted(hosts.items(), key=lambda kv: -kv[1][1])[:8])
    res["errors"] = errors[:6]; res["nErrors"] = len(errors)
    res["failed"] = failed[:6]; res["nFailed"] = len(failed)
    await ctx.close()
    return res


def tile_diffs(fa, fb, h):
    ia, ib = Image.open(fa).convert("RGB"), Image.open(fb).convert("RGB")
    if ia.width != ib.width:
        ib = ib.resize((ia.width, int(ib.height * ia.width / ib.width)))
    n = max(1, min(ia.height, ib.height) // h)
    out = []
    for i in range(min(n, 8)):
        a, b = ia.crop((0, i * h, ia.width, (i + 1) * h)), ib.crop((0, i * h, ia.width, (i + 1) * h))
        hist = ImageChops.difference(a, b).convert("L").histogram()
        out.append(round(sum(hist[25:]) / (a.width * a.height) * 100, 1))
    return out


def words(t):
    return re.findall(r"[a-zà-ÿ0-9]{3,}", (t or "").lower())


def compare(o, c, w, h, fa, fb):
    r = {"w": w}
    if not o.get("ok") or not c.get("ok"):
        r["fail"] = "orig:" + str(o.get("error") or o.get("gotoError"))[:60] + " clone:" + str(c.get("error") or c.get("gotoError"))[:60]
        return r
    wo, wc = words(o["text"]), words(c["text"])
    so, sc = set(wo), set(wc)
    r["recall"] = round(len(so & sc) / max(1, len(so)), 3)
    r["extra"] = round(len(sc - so) / max(1, len(sc)), 3)
    seen, miss = set(), []
    for x in wo:
        if x not in sc and x not in seen:
            seen.add(x); miss.append(x)
    r["missing"] = miss[:25]
    r["heightRatio"] = round(c["docH"] / max(1, o["docH"]), 3)
    r["overflowX"] = c["docW"] > c["clientW"] + 2 and not (o["docW"] > o["clientW"] + 2)
    r["tiles"] = tile_diffs(fa, fb, h)
    r["diffTop"] = round(sum(r["tiles"][:3]) / max(1, len(r["tiles"][:3])), 1)
    r["diffAll"] = round(sum(r["tiles"]) / max(1, len(r["tiles"])), 1)
    r["imgVis"] = [o["imgVis"], c["imgVis"]]
    r["broken"] = [o["broken"], c["broken"]]
    r["videos"] = [o["videos"], c["videos"]]; r["iframes"] = [o["iframes"], c["iframes"]]
    r["links"] = [o["links"], c["links"]]; r["buttons"] = [o["buttons"], c["buttons"]]; r["inputs"] = [o["inputs"], c["inputs"]]
    r["kb"] = [o["kb"], c["kb"]]; r["requests"] = [o["requests"], c["requests"]]
    r["loadSec"] = [o.get("loadSec"), c.get("loadSec")]
    # video / mini player: biggest media box of each
    def big(m):
        ms = sorted(m["media"], key=lambda x: -x["rect"][2] * x["rect"][3])
        return ms[0] if ms else None
    bo, bc = big(o), big(c)
    if bo and not bc:
        r["videoMissing"] = True
    if bo and bc:
        ao, ac = bo["rect"][2] * bo["rect"][3], bc["rect"][2] * bc["rect"][3]
        r["videoArea"] = round(ac / max(1, ao), 2)
        r["videoRect"] = [bo["rect"], bc["rect"]]
    r["fixedMedia"] = [m for m in c["media"] if m["fixed"]][:2]
    r["mediaOrigClone"] = [[(m["tag"], m["rect"][2], m["rect"][3]) for m in o["media"][:4]], [(m["tag"], m["rect"][2], m["rect"][3], m["player"]) for m in c["media"][:4]]]
    # does the clone still lean on the original's servers?
    oh = urlparse(o["url"]).netloc.lower().removeprefix("www.")
    root = ".".join(oh.split(".")[-2:])
    hot = {k: v for k, v in c["hosts"].items() if root in k}
    r["hotlinks"] = hot
    r["cloneErrors"] = c["errors"][:4]; r["cloneFailed"] = c["failed"][:4]
    r["origErrors"] = o["nErrors"]; r["cloneNErrors"] = c["nErrors"]; r["cloneNFailed"] = c["nFailed"]
    r["facesClone"] = [f for f in c["faces"] if not f.endswith(":loaded")][:4]
    r["fontOC"] = [o["font"][:40], c["font"][:40]]
    r["bgOC"] = [o["bg"], c["bg"]]
    r["headsMissing"] = [x for x in o["heads"] if x and x.lower() not in " ".join(c["heads"]).lower() and x.lower()[:40] not in c["text"].lower()][:5]
    return r


async def one_site(browser, row, scan):
    idx = row["idx"]
    d = f"{OUT}/{idx:03d}"
    os.makedirs(d, exist_ok=True)
    result = {"idx": idx, "cat": row["cat"], "url": row["url"], "projectId": scan["projectId"], "slug": scan.get("slug"), "scan": {k: scan.get(k) for k in ("seconds", "pages", "blocks", "cssKB", "notes")}, "widths": {}}
    clone_url = f"{WEB}/projects/{scan['projectId']}/p/{scan['slug']}"
    result["cloneUrl"] = clone_url
    for w, h in WIDTHS:
        fa, fb = f"{d}/orig_{w}.png", f"{d}/clone_{w}.png"
        o, c = await asyncio.gather(load_and_measure(browser, row["url"], w, h, "o", fa), load_and_measure(browser, clone_url, w, h, "c", fb))
        cmp = compare(o, c, w, h, fa, fb)
        result["widths"][str(w)] = cmp
        json.dump({"orig": {k: v for k, v in o.items() if k != "text"}, "clone": {k: v for k, v in c.items() if k != "text"}}, open(f"{d}/raw_{w}.json", "w"))
        open(f"{d}/text_orig_{w}.txt", "w").write(o.get("text", "")); open(f"{d}/text_clone_{w}.txt", "w").write(c.get("text", ""))
    json.dump(result, open(f"{d}/result.json", "w"), indent=1)
    return result


async def main():
    rows = {}
    for l in open(LIST).read().strip().split("\n"):
        i, cat, url = l.split("\t")[:3]
        rows[int(i)] = {"idx": int(i), "cat": cat, "url": url}
    scans = {}
    for l in open(RES).read().strip().split("\n"):
        if l.strip():
            j = json.loads(l)
            if j.get("status") == "ok" and j.get("slug"):
                scans[j["idx"]] = j
    todo = [i for i in sorted(scans) if FROM <= i <= TO and (not ONLY or i in ONLY) and not os.path.exists(f"{OUT}/{i:03d}/result.json")]
    print(f"{len(todo)} sites to compare", flush=True)
    os.makedirs(OUT, exist_ok=True)
    q = asyncio.Queue()
    for i in todo: q.put_nowait(i)
    async with async_playwright() as p:
        async def worker():
            browser = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
            try:
                while True:
                    try: i = q.get_nowait()
                    except asyncio.QueueEmpty: return
                    t = time.time()
                    try:
                        r = await asyncio.wait_for(one_site(browser, rows[i], scans[i]), 300)
                        w = r["widths"].get("1440", {}); m = r["widths"].get("390", {})
                        print(f"#{i} {rows[i]['url'][:50]:50} d1440 top {w.get('diffTop')} all {w.get('diffAll')} recall {w.get('recall')} | d390 top {m.get('diffTop')} all {m.get('diffAll')} recall {m.get('recall')} ({round(time.time()-t)}s)", flush=True)
                    except Exception as e:
                        print(f"#{i} FAILED {str(e)[:80]}", flush=True)
                        os.makedirs(f"{OUT}/{i:03d}", exist_ok=True)
                        json.dump({"idx": i, "url": rows[i]["url"], "crash": str(e)[:200]}, open(f"{OUT}/{i:03d}/result.json", "w"))
                        try: await browser.close()
                        except Exception: pass
                        browser = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
            finally:
                try: await browser.close()
                except Exception: pass
        await asyncio.gather(*[worker() for _ in range(WORKERS)])

asyncio.run(main())
