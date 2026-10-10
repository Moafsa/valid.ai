#!/usr/bin/env python3
"""Original vs clone at many screen sizes, measured by geometry (not by eye).

usage: responsive_compare.py <pairs.tsv> <outdir> [--widths 1920,1440,...] [--workers 2] [--only 12,34]
pairs.tsv: idx <TAB> original url <TAB> clone url

For each width both pages are opened (phone widths with a phone user agent and touch, like a real phone), scrolled
through, and every heading / paragraph / link / button / picture / field is measured: where it is, how big, which font
size, whether it is visible. Elements are paired by tag + text (or picture file name) + occurrence, and then compared:

  matched     share of the original's visible elements that exist, visible, in the clone
  bad         share of the matched ones that moved/resized/changed font more than the tolerance
  overflowX   the clone scrolls sideways when the original does not
  extra       visible elements only the clone has (content a script hid in the original)
  navOk       the same number of links is visible in the top bar

A site is "responsive-faithful" at a width when matched >= 0.9, bad <= 0.12 and no new sideways scroll.
"""
import asyncio, json, os, re, sys, time
from urllib.parse import urlparse
from playwright.async_api import async_playwright

args = sys.argv[1:]
LIST, OUT = args[0], args[1]
opt = lambda n, d: args[args.index(n) + 1] if n in args else d
WIDTHS = [int(x) for x in opt("--widths", "1920,1440,1280,1024,820,768,600,480,414,390,360,320").split(",")]
WORKERS = int(opt("--workers", 2))
ONLY = {int(x) for x in opt("--only", "").split(",") if x}

DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
TABLET_UA = "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"

AUTOSCROLL = r"""
async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let y = 0, n = 0;
  while (n++ < 70) {
    const h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    if (y >= h || y > 30000) break;
    window.scrollTo(0, y); y += Math.round(innerHeight * 0.7);
    await sleep(100);
  }
  window.scrollTo(0, 0);
  await sleep(600);
}
"""

GEOMETRY = r"""
() => {
  const de = document.documentElement, b = document.body;
  const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = (e, r, cs) => r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.05;
  const inView = r => r.bottom + scrollY > -50;
  const els = [];
  const SEL = 'h1,h2,h3,h4,h5,h6,p,a[href],button,[role=button],img,input,select,textarea,label,summary,video,li';
  const counts = new Map();
  const ownText = e => { let t = ''; for (const n of e.childNodes) if (n.nodeType === 3) t += n.textContent; return norm(t); };
  const all = [...b.querySelectorAll('*')].filter(e => e.matches(SEL) || (['DIV','SECTION','ARTICLE','ASIDE','HEADER','FOOTER','NAV','TD','TH','FIGURE','BLOCKQUOTE','SPAN','SMALL','STRONG','EM','B','I','DT','DD','FIGCAPTION','PRE','CODE','TIME'].includes(e.tagName) && ownText(e).length >= 3));
  for (const e of all) {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    const tag = e.tagName.toLowerCase();
    let text = '';
    if (tag === 'img') { const s = (e.currentSrc || e.src || '').split('?')[0].split('/').pop() || ''; text = s.replace(/^.*_section_\d+_x?\d+\./, '').slice(0, 40) || norm(e.alt).slice(0, 40); }
    else if (tag === 'input' || tag === 'textarea' || tag === 'select') text = norm(e.placeholder || e.name || e.type);
    else if (tag === 'li' || tag === 'a' || tag === 'label' || tag === 'summary') text = norm(e.innerText).slice(0, 60);
    else if (!e.matches(SEL)) text = ownText(e).slice(0, 60);
    else text = norm(e.innerText).slice(0, 60);
    if (!text && tag !== 'img' && tag !== 'video') continue;
    // li/a that only wrap other measured elements are noise: keep the ones with their own visible text
    if ((tag === 'li') && e.querySelector('a,button,p,h1,h2,h3,h4')) continue;
    const key = tag + '|' + text;
    const n = (counts.get(key) || 0) + 1; counts.set(key, n);
    els.push({ k: key + '#' + n, t: tag, v: visible(e, r, cs) ? 1 : 0, x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height), fs: Math.round(parseFloat(cs.fontSize) * 10) / 10, f: cs.position === 'fixed' || cs.position === 'sticky' ? 1 : 0 });
    if (els.length >= 2200) break;
  }
  const nav = els.filter(e => e.v && e.t === 'a' && e.y < 130 && !e.f).length;
  return { docW: Math.max(de.scrollWidth, b.scrollWidth), docH: Math.max(de.scrollHeight, b.scrollHeight), clientW: de.clientWidth, els, nav,
           burger: !!document.querySelector('[class*=burger i],[class*=hamburger i],[class*=menu-toggle i],[class*=nav-toggle i],[aria-label*=menu i],[class*=menu-btn i]') };
}
"""


MENU_TEST = r"""
async () => {
  const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 4 && r.height > 4 && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.05; };
  const shown = () => [...document.querySelectorAll('a[href]')].filter(a => visible(a) && a.getBoundingClientRect().top < innerHeight).length;
  const looks = /(burger|hamburger|menu-?(toggle|btn|button|icon|trigger)|nav-?(toggle|btn|button|icon|trigger)|navbar-toggler|toggle-?menu|open-?menu|\bmenu\b)/i;
  const cands = [...document.querySelectorAll('button,a,div,span,label,[role=button],li')].filter(el => {
    const r = el.getBoundingClientRect();
    if (!visible(el) || r.width > 120 || r.height > 120 || r.top > 160 || r.top < -5) return false;
    const c = (typeof el.className === 'string' ? el.className : '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '');
    if (el.tagName === 'A' && (el.getAttribute('href') || '').replace(/#.*/, '') && !el.hasAttribute('aria-expanded')) return false;
    return looks.test(c) || el.hasAttribute('aria-expanded');
  });
  if (!cands.length) return { tried: false };
  const before = shown();
  try { cands[0].click(); } catch (e) { return { tried: false }; }
  await new Promise(r => setTimeout(r, 700));
  return { tried: true, before, after: shown(), opened: shown() > before };
}
"""


async def measure(browser, url, w):
    h = max(640, min(1000, round(w * 0.62)))
    phone = w <= 500
    ctx = await browser.new_context(viewport={"width": w, "height": h}, is_mobile=w <= 900, has_touch=w <= 900,
                                    user_agent=PHONE_UA if phone else (TABLET_UA if 600 <= w <= 900 and False else DESKTOP_UA),
                                    ignore_https_errors=True, locale="pt-BR", device_scale_factor=1)
    page = await ctx.new_page()
    res = {"ok": False}
    try:
        try:
            await page.goto(url, wait_until="load", timeout=45000)
        except Exception as e:
            res["gotoError"] = str(e)[:80]
        try:
            await page.wait_for_load_state("networkidle", timeout=3000)
        except Exception:
            pass
        try:
            await asyncio.wait_for(page.evaluate(AUTOSCROLL), 45)
        except Exception:
            pass
        await page.wait_for_timeout(500)
        res.update(await page.evaluate(GEOMETRY))
        if w <= 900:
            try:
                res["menu"] = await asyncio.wait_for(page.evaluate(MENU_TEST), 15)
            except Exception:
                res["menu"] = {"tried": False}
        res["ok"] = True
    except Exception as e:
        res["error"] = str(e)[:160]
    finally:
        await ctx.close()
    return res


def compare(o, c, w):
    if not (o.get("ok") and c.get("ok")):
        return {"fail": (o.get("error") or c.get("error") or o.get("gotoError") or c.get("gotoError") or "load")[:80]}
    ce = {e["k"]: e for e in c["els"]}
    oe = [e for e in o["els"] if e["v"] and not e["f"]]
    matched = bad = 0
    worst = []
    fontBad = posBad = sizeBad = hid = 0
    tolx, tolw = max(24, 0.03 * w), max(24, 0.08 * w)
    for e in oe:
        m = ce.get(e["k"])
        if not m or not m["v"]:
            hid += 1
            continue
        matched += 1
        dx, dw = abs(m["x"] - e["x"]), abs(m["w"] - e["w"])
        # a block of text may wrap differently by a line: height is judged relatively
        dh = abs(m["h"] - e["h"]) / max(30, e["h"])
        fs = abs(m["fs"] - e["fs"]) > 1.6 and abs(m["fs"] - e["fs"]) / max(1, e["fs"]) > 0.08
        isbad = dx > tolx or dw > max(tolw, 0.12 * e["w"]) or fs or (dh > 0.6 and e["t"] in ("img", "video", "button"))
        if isbad:
            bad += 1
            fontBad += fs
            posBad += dx > tolx
            sizeBad += dw > max(tolw, 0.12 * e["w"])
            if len(worst) < 6: worst.append({"k": e["k"][:60], "o": [e["x"], e["w"], e["fs"]], "c": [m["x"], m["w"], m["fs"]]})
    seen_o = {e["k"] for e in o["els"] if e["v"]}
    extra = sum(1 for e in c["els"] if e["v"] and not e["f"] and e["k"] not in seen_o)
    n = max(1, len(oe))
    r = {
        "n": len(oe), "matched": round(matched / n, 3), "bad": round(bad / max(1, matched), 3), "extra": round(extra / max(1, len(c["els"])), 3),
        "overflowO": o["docW"] > o["clientW"] + 2, "overflowC": c["docW"] > c["clientW"] + 2, "docWc": c["docW"], "clientW": c["clientW"],
        "heightRatio": round(c["docH"] / max(1, o["docH"]), 3), "nav": [o["nav"], c["nav"]], "burger": [o["burger"], c["burger"]],
        "fontBad": fontBad, "posBad": posBad, "sizeBad": sizeBad, "hidden": hid, "worst": worst,
    }
    om, cm = o.get("menu") or {}, c.get("menu") or {}
    r["menu"] = [om.get("opened") if om.get("tried") else None, cm.get("opened") if cm.get("tried") else None]
    menu_broken = bool(om.get("tried") and om.get("opened") and not cm.get("opened"))
    r["menuBroken"] = menu_broken
    r["faithful"] = bool(r["matched"] >= 0.9 and r["bad"] <= 0.12 and not (r["overflowC"] and not r["overflowO"]) and not menu_broken)
    return r


async def one(browser, idx, orig, clone):
    d = os.path.join(OUT, f"{idx:03d}")
    os.makedirs(d, exist_ok=True)
    out = {"idx": idx, "url": orig, "clone": clone, "widths": {}}
    for w in WIDTHS:
        o, c = await asyncio.gather(measure(browser, orig, w), measure(browser, clone, w))
        out["widths"][str(w)] = compare(o, c, w)
        if idx and w in (390, 1440):
            json.dump({"o": o, "c": c}, open(os.path.join(d, f"geo_{w}.json"), "w"))
    json.dump(out, open(os.path.join(d, "result.json"), "w"), ensure_ascii=False)
    ok = sum(1 for v in out["widths"].values() if v.get("faithful"))
    print(f"#{idx:<3} {ok}/{len(WIDTHS)} widths faithful  {orig[:60]}", flush=True)


async def main():
    rows = []
    for l in open(LIST):
        p = l.rstrip("\n").split("\t")
        if len(p) >= 3 and (not ONLY or int(p[0]) in ONLY):
            if os.path.exists(os.path.join(OUT, f"{int(p[0]):03d}", "result.json")) and not ONLY: continue
            rows.append((int(p[0]), p[1], p[2]))
    sem = asyncio.Semaphore(WORKERS)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        async def run(r):
            async with sem:
                try:
                    await one(browser, *r)
                except Exception as e:
                    print(f"#{r[0]} crash {e!r}"[:200], flush=True)
        await asyncio.gather(*(run(r) for r in rows))
        await browser.close()

asyncio.run(main())
