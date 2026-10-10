"""
Where things are: the part of the review that does not look at a screenshot but at the page's geometry.

Every heading, paragraph, link, button, picture and field is measured (position, size, font size, visible or not) on the
original and on the clone, paired by tag + text (or picture name) + occurrence, and compared. It answers the questions a
person asks while flipping between two windows: is it all there, is it in the same place, is it the same size, does the
page scroll sideways, does the menu button open the menu.

The same measurements are used by the regression suite (tools/responsive-lab/responsive_compare.py keeps a copy of the
script and the comparison for the lab's own runs).
"""
import asyncio
from typing import Optional

AUTOSCROLL = r"""
async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let y = 0, n = 0;
  while (n++ < 60) {
    const h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    if (y >= h || y > 26000) break;
    window.scrollTo(0, y); y += Math.round(innerHeight * 0.7);
    await sleep(90);
  }
  window.scrollTo(0, 0);
  await sleep(600);
}
"""

GEOMETRY_JS = r"""
() => {
  const de = document.documentElement, b = document.body;
  const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = (r, cs) => r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.05;
  const els = [];
  const SEL = 'h1,h2,h3,h4,h5,h6,p,a[href],button,[role=button],img,input,select,textarea,label,summary,video,li';
  const counts = new Map();
  const ownText = e => { let t = ''; for (const n of e.childNodes) if (n.nodeType === 3) t += n.textContent; return norm(t); };
  const OWN = ['DIV','SECTION','ARTICLE','ASIDE','HEADER','FOOTER','NAV','TD','TH','FIGURE','BLOCKQUOTE','SPAN','SMALL','STRONG','EM','B','I','DT','DD','FIGCAPTION','PRE','CODE','TIME'];
  const all = [...b.querySelectorAll('*')].filter(e => e.matches(SEL) || (OWN.includes(e.tagName) && ownText(e).length >= 3));
  for (const e of all) {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    const tag = e.tagName.toLowerCase();
    let text = '';
    if (tag === 'img') { const s = (e.currentSrc || e.src || '').split('?')[0].split('/').pop() || ''; text = s.replace(/^.*_section_\d+_x?\d+\./, '').slice(0, 40) || norm(e.alt).slice(0, 40); }
    else if (tag === 'input' || tag === 'textarea' || tag === 'select') text = norm(e.placeholder || e.name || e.type);
    else if (!e.matches(SEL)) text = ownText(e).slice(0, 60);
    else text = norm(e.innerText).slice(0, 60);
    if (!text && tag !== 'img' && tag !== 'video') continue;
    if (tag === 'li' && e.querySelector('a,button,p,h1,h2,h3,h4')) continue;
    const key = tag + '|' + text;
    const n = (counts.get(key) || 0) + 1; counts.set(key, n);
    els.push({ k: key + '#' + n, t: tag, v: visible(r, cs) ? 1 : 0, x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height), fs: Math.round(parseFloat(cs.fontSize) * 10) / 10, f: cs.position === 'fixed' || cs.position === 'sticky' ? 1 : 0 });
    if (els.length >= 2200) break;
  }
  return { docW: Math.max(de.scrollWidth, b.scrollWidth), docH: Math.max(de.scrollHeight, b.scrollHeight), clientW: de.clientWidth, els };
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
  const r0 = cands[0].getBoundingClientRect();
  return { tried: true, x: r0.left + r0.width / 2, y: r0.top + r0.height / 2, before: shown(), shownFn: null };
}
"""

SHOWN_JS = r"""
() => { const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 4 && r.height > 4 && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.05; };
  return [...document.querySelectorAll('a[href]')].filter(a => visible(a) && a.getBoundingClientRect().top < innerHeight).length; }
"""


async def measure(page, width: int, with_menu: bool) -> dict:
    """Scrolls through an already loaded page and measures it. The menu test presses the button for real, so it goes last."""
    out: dict = {"ok": False}
    try:
        try:
            await asyncio.wait_for(page.evaluate(AUTOSCROLL), 40)
        except Exception:
            pass
        await page.wait_for_timeout(400)
        out.update(await page.evaluate(GEOMETRY_JS))
        if with_menu:
            try:
                probe = await asyncio.wait_for(page.evaluate(MENU_TEST), 10)
                if probe.get("tried"):
                    await page.mouse.click(probe["x"], probe["y"])
                    await page.wait_for_timeout(800)
                    after = await page.evaluate(SHOWN_JS)
                    out["menu"] = {"tried": True, "opened": after > probe["before"]}
                else:
                    out["menu"] = {"tried": False}
            except Exception:
                out["menu"] = {"tried": False}
        out["ok"] = True
    except Exception as e:
        out["error"] = str(e)[:140]
    return out


def compare(o: dict, c: dict, width: int) -> Optional[dict]:
    """How well the clone's geometry agrees with the original's at this width."""
    if not (o.get("ok") and c.get("ok")):
        return None
    ce = {e["k"]: e for e in c["els"]}
    oe = [e for e in o["els"] if e["v"] and not e["f"]]
    matched = bad = 0
    tolx, tolw = max(24, 0.03 * width), max(24, 0.08 * width)
    for e in oe:
        m = ce.get(e["k"])
        if not m or not m["v"]:
            continue
        matched += 1
        dx, dw = abs(m["x"] - e["x"]), abs(m["w"] - e["w"])
        dh = abs(m["h"] - e["h"]) / max(30, e["h"])
        fs = abs(m["fs"] - e["fs"]) > 1.6 and abs(m["fs"] - e["fs"]) / max(1, e["fs"]) > 0.08
        if dx > tolx or dw > max(tolw, 0.12 * e["w"]) or fs or (dh > 0.6 and e["t"] in ("img", "video", "button")):
            bad += 1
    n = max(1, len(oe))
    om, cm = o.get("menu") or {}, c.get("menu") or {}
    return {
        "n": len(oe), "matched": round(matched / n, 3), "bad": round(bad / max(1, matched), 3),
        "menuBroken": bool(om.get("tried") and om.get("opened") and not cm.get("opened")),
        "heightRatio": round(c["docH"] / max(1, o["docH"]), 3),
    }


async def measure_loaded(page, width: int, with_menu: bool) -> dict:
    """Same as measure() for a page the caller has already scrolled through."""
    out: dict = {"ok": False}
    try:
        out.update(await page.evaluate(GEOMETRY_JS))
        if with_menu:
            try:
                probe = await asyncio.wait_for(page.evaluate(MENU_TEST), 10)
                if probe.get("tried"):
                    await page.mouse.click(probe["x"], probe["y"])
                    await page.wait_for_timeout(800)
                    after = await page.evaluate(SHOWN_JS)
                    out["menu"] = {"tried": True, "opened": after > probe["before"]}
                else:
                    out["menu"] = {"tried": False}
            except Exception:
                out["menu"] = {"tried": False}
        out["ok"] = True
    except Exception as e:
        out["error"] = str(e)[:140]
    return out
