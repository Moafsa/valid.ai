"""
Responsive replay: what the original's SCRIPTS did at other screen sizes.

A clone has no scripts. Whatever a script wrote into style="" at the capture width (1440) stays written, and CSS
@media rules cannot undo an inline style: a carousel whose slides got `width:660px`, cards equalised to one height,
a grid whose columns were set by code, a menu a script hid... are right at 1440 and wrong everywhere else.

So the page is opened again at a few other widths (a phone, a tablet, a small laptop). For every element that is in
the same place of the page at both widths, the inline style the page ended up with is compared with the one at the
capture width. Where they differ, the clone gets a CSS rule for that range of widths, written with !important so it
beats the inline style. Sizes a script derived from its container (a slide that is a third of its row, or all of it)
are written as a percentage of the parent, so they keep working at every width of the range, not only at the width
that was probed.

The same phone-sized page is used to find the hamburger button: it is clicked, what changed is recorded (classes,
inline style, aria-expanded) and the clone's runtime repeats exactly that when the visitor taps the button.

The elements are marked with data-vai-p="<n>" while this runs; the capture keeps the mark only on the ones a rule or
a button refers to (see keep_marks_js).
"""
import asyncio
import json
import re
import time
from typing import List, Optional

from loguru import logger

# widths probed besides the capture width, and the user agents/viewport shapes they get
PROBE_WIDTHS = [320, 375, 600, 768, 1024]
PHONE_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

# only what shapes the layout: colours, scroll-driven transforms and the like are left out on purpose
LAYOUT_PROPS = [
    "width", "height", "min-width", "max-width", "min-height", "max-height", "flex-basis", "flex-grow", "flex-shrink",
    "margin-left", "margin-right", "margin-top", "margin-bottom", "padding-left", "padding-right", "padding-top", "padding-bottom",
    "left", "right", "display", "grid-template-columns", "grid-template-rows", "gap", "column-gap", "row-gap", "order",
    "font-size", "line-height", "visibility", "float",
]
# lengths a script derives from its container: written as % of the parent when they are a real share of it
RATIO_PROPS = {"width", "min-width", "max-width", "flex-basis", "left", "right", "margin-left", "margin-right", "padding-left", "padding-right"}

_WALK = r"""
(skipClass) => {
  const SKIP = new Set(['SCRIPT','STYLE','LINK','META','NOSCRIPT','TEMPLATE','BASE','TITLE','HEAD']);
  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const clone = new RegExp(skipClass, 'i');
  const rows = []; let n = 0;
  const walk = (el, path) => {
    const counts = {};
    for (const c of el.children) {
      if (SKIP.has(c.tagName) || c.namespaceURI !== HTML_NS || clone.test(typeof c.className === 'string' ? c.className : '')) continue;
      const t = c.tagName.toLowerCase(); counts[t] = (counts[t] || 0) + 1;
      const p = path + '/' + t + counts[t];
      if (++n > 9000) return;
      rows.push([c, p]);
      walk(c, p);
    }
  };
  walk(document.body, '');
  return rows;
}
"""

TAG_JS = r"""
(args) => {
  const [skipClass, props] = args;
  const rows = (""" + _WALK + r""")(skipClass);
  const out = [];
  let id = 0;
  for (const [el, path] of rows) {
    const pid = ++id;
    el.setAttribute('data-vai-p', String(pid));
    const st = {};
    for (const k of props) { const v = el.style.getPropertyValue(k); if (v) st[k] = v; }
    out.push([pid, path, st]);
  }
  window.__vaiPCount = id;
  return out;
}
"""

DIFF_JS = r"""
(args) => {
  const [base, skipClass, props, ratioProps] = args;
  const byPath = new Map(base.map(r => [r[1], r]));
  const rows = (""" + _WALK + r""")(skipClass);
  let found = 0;
  const diffs = [];
  const contentWidth = (el) => {
    const p = el.parentElement; if (!p) return 0;
    const cs = getComputedStyle(p);
    return Math.max(0, p.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0));
  };
  for (const [el, path] of rows) {
    const b = byPath.get(path);
    if (!b) continue;
    found++;
    const st = {};
    for (const k of props) { const v = el.style.getPropertyValue(k); if (v) st[k] = v; }
    const set = {}, rm = {};
    for (const k of props) {
      if ((st[k] || '') === ((b[2] || {})[k] || '')) continue;
      if (st[k]) set[k] = st[k]; else rm[k] = getComputedStyle(el).getPropertyValue(k);
    }
    if (!Object.keys(set).length && !Object.keys(rm).length) continue;
    diffs.push({ p: b[0], set, rm, pw: contentWidth(el) });
  }
  return { rows: rows.length, found, base: base.length, diffs };
}
"""

# ───── interactions: what clicking things (a FAQ question, a menu button, a tab) does to the page ─────
# The page is opened again, its elements get the same numbers as the capture page, and every clickable-looking element
# is pressed with a REAL mouse click (pointer events, not just a "click" event: modern component libraries listen to
# those). What the click changed (attributes, nodes added, nodes removed) is written onto the element, and the clone's
# runtime repeats exactly that when the visitor presses it, and undoes it on the second press.

MARK_JS = r"""
(args) => {
  const [base, skipClass] = args;
  const byPath = new Map(base.map(r => [r[1], r[0]]));
  const rows = (""" + _WALK + r""")(skipClass);
  let found = 0;
  for (const [el, path] of rows) { const pid = byPath.get(path); if (pid) { el.setAttribute('data-vai-p', String(pid)); found++; } }
  document.body.setAttribute('data-vai-p', 'body'); document.documentElement.setAttribute('data-vai-p', 'html');
  window.__vaiRecs = [];
  window.__vaiAdded = [];
  window.__vaiMO = new MutationObserver(rs => { for (const r of rs) window.__vaiRecs.push(r); });
  window.__vaiMO.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
  return { rows: rows.length, found, base: base.length };
}
"""

LIST_JS = r"""
(skip) => {
  const skipSet = new Set(skip.map(String));
  const DENY = /comprar|compre|carrinho|checkout|finalizar|assinar|assinatura|pagar|pagamento|enviar|submit|cadastr|login|entrar|sign ?(in|up)|baixar|download|compartilhar|share|excluir|deletar|remover|cancelar|logout|sair|whatsapp|agendar|reservar|ligar|\bbuy\b|order|subscribe|get started|comece|come[cç]ar|quero|garantir|contratar|solicitar|or[cç]amento|fale com|falar com|add to cart|adicionar/i;
  const out = [];
  const pointer = e => getComputedStyle(e).cursor === 'pointer';
  for (const e of document.body.querySelectorAll('[data-vai-p]')) {
    const pid = e.getAttribute('data-vai-p');
    if (skipSet.has(pid) || !pointer(e)) continue;
    const parent = e.parentElement;
    if (parent && parent !== document.body && parent.hasAttribute('data-vai-p') && pointer(parent)) continue;      // the topmost element of a clickable region
    const tag = e.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'SUMMARY', 'VIDEO', 'AUDIO', 'IFRAME', 'CANVAS', 'IMG', 'LABEL'].includes(tag)) continue;
    if (tag === 'A') { const h = (e.getAttribute('href') || '').trim(); if (h && !h.startsWith('#') && !/^javascript:/i.test(h)) continue; }
    if (e.closest('a[href]:not([href^="#"]):not([href^="javascript"])')) continue;
    if (e.closest('form') && (tag === 'BUTTON' || e.getAttribute('type') === 'submit')) continue;
    if (e.closest('details')) continue;
    let pinned = false;
    for (let n = e, d = 0; n && n !== document.body && d < 10; n = n.parentElement, d++) { if (getComputedStyle(n).position === 'fixed') { pinned = true; break; } }
    if (pinned) continue;
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    if (r.width < 14 || r.height < 12 || r.width > 1500 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const text = (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
    if (DENY.test(text.slice(0, 60))) continue;
    out.push({ pid, text: text.slice(0, 50), top: Math.round(r.top + scrollY) });
  }
  return out.slice(0, 45);
}
"""

PREP_JS = r"""
async (pid) => {
  const el = document.querySelector('[data-vai-p="' + pid + '"]');
  if (!el) return null;
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  await new Promise(r => setTimeout(r, 220));
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) return null;
  window.__vaiRecs = [];
  return { x: r.left + Math.min(r.width / 2, 200), y: r.top + r.height / 2 };
}
"""

COLLECT_JS = r"""
(noisy) => {
  const noisySet = new Set(noisy.map(String));
  const recs = window.__vaiRecs.splice(0);
  window.__vaiMO.takeRecords();
  const pidOf = n => (n && n.nodeType === 1 && n.getAttribute) ? n.getAttribute('data-vai-p') : null;
  const attrs = new Map(), added = [], ops = [];
  for (const r of recs) {
    if (r.type === 'attributes') {
      const n = r.attributeName;
      if (/^data-vai-/.test(n)) continue;
      const p = pidOf(r.target);
      if (!p || noisySet.has(p)) continue;
      const k = p + '|' + n;
      if (!attrs.has(k)) attrs.set(k, { p, n, o: r.oldValue });
    } else if (r.type === 'childList') {
      for (const a of r.addedNodes) if (a.nodeType === 1 && a.isConnected && !pidOf(a) && !noisySet.has(pidOf(r.target) || '')) added.push([r.target, a]);
      for (const d of r.removedNodes) if (d.nodeType === 1 && pidOf(d) && !d.isConnected && !noisySet.has(pidOf(d))) ops.push({ k: '-', p: pidOf(d) });
    } else if (r.type === 'characterData') {
      const par = r.target.parentElement, p = pidOf(par);
      if (p && !noisySet.has(p) && par.children.length === 0) ops.push({ k: 't', p, v: par.textContent, o: r.oldValue });
    }
  }
  const absolutize = (u) => { try { return /^(data:|#|javascript:)/i.test(u) ? u : new URL(u, document.baseURI).href; } catch (e) { return u; } };
  const clean = node => {
    const c = node.cloneNode(true);
    c.querySelectorAll('script, noscript').forEach(n => n.remove());
    for (const el of [c, ...c.querySelectorAll('*')]) {
      for (const a of [...el.attributes]) {
        const nm = a.name.toLowerCase();
        if (nm.startsWith('on') || /^data-vai-/.test(nm)) { el.removeAttribute(a.name); continue; }
        if (['href', 'src', 'poster', 'data-src', 'action', 'xlink:href'].includes(nm)) { if (/^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name); else el.setAttribute(a.name, absolutize(a.value)); }
        if (nm === 'srcset') el.setAttribute('srcset', a.value.split(/,\s+/).map(x => { const t = x.trim().split(/\s+/); return [absolutize(t[0]), ...t.slice(1)].join(' '); }).join(', '));
        if (nm === 'style' && a.value.includes('url(')) el.setAttribute('style', a.value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => 'url("' + absolutize(u.trim()) + '")'));
      }
    }
    return c.outerHTML;
  };
  for (const a of attrs.values()) {
    const el = document.querySelector('[data-vai-p="' + a.p + '"]');
    if (!el) continue;
    const v = el.getAttribute(a.n);
    if (v === a.o) continue;
    ops.push({ k: 'a', p: a.p, n: a.n, o: a.o, v });
  }
  const kept = [];
  for (const [parent, node] of added) {
    if (!node.isConnected || added.some(([, o]) => o !== node && o.contains(node))) continue;
    let anchor = parent; while (anchor && !pidOf(anchor)) anchor = anchor.parentElement;
    const pp = pidOf(parent) || (anchor && pidOf(anchor));
    if (!pp || pidOf(parent) === null) continue;
    let nx = node.nextElementSibling; while (nx && !pidOf(nx)) nx = nx.nextElementSibling;
    ops.push({ k: '+', p: pp, b: nx ? pidOf(nx) : null, h: clean(node) });
    kept.push(node);
  }
  window.__vaiAdded = kept;
  return ops;
}
"""

# is the page back to what it was before the click? (the element's own second press undid the first)
RESTORED_JS = r"""
(args) => {
  const [ops, closeOps] = args;
  const closed = new Set((closeOps || []).filter(c => c.k === 'a').map(c => c.p + '|' + c.n));
  const why = [];
  for (const o of ops) {
    if (o.k === 'a') {
      const el = document.querySelector('[data-vai-p="' + o.p + '"]');
      if (!el) { why.push('gone:' + o.p); continue; }
      // back to what it was, or the page itself wrote the closing value (a style the open state wrote, set to another value)
      if ((el.getAttribute(o.n) || '') !== (o.o || '') && !closed.has(o.p + '|' + o.n)) why.push('attr:' + o.p + '.' + o.n);
    }
    if (o.k === '-') { if (!document.querySelector('[data-vai-p="' + o.p + '"]')) why.push('removed-stays:' + o.p); }
  }
  if ((window.__vaiAdded || []).some(n => n.isConnected)) why.push('added-stays');
  if ((closeOps || []).some(c => c.k === '+')) why.push('close-adds');
  return why;
}
"""

# Only what happened NEAR the pressed element belongs to it: a page keeps restyling other parts on its own while the
# mouse moves and the scroll settles. The lowest ancestor of the element that holds most of the changes is the area; the
# rest is dropped (changes to <body>/<html>, like a menu locking the scroll, always stay).
NEAR_JS = r"""
(args) => {
  const [ops, pid] = args;
  const trig = document.querySelector('[data-vai-p="' + pid + '"]');
  if (!trig) return ops;
  const special = o => o.p === 'body' || o.p === 'html';
  const rel = ops.filter(o => !special(o));
  const at = o => document.querySelector('[data-vai-p="' + o.p + '"]');
  const chain = [];
  for (let n = trig, d = 0; n && n !== document.body && d < 12; n = n.parentElement, d++) chain.push(n);
  let area = null;
  for (const A of chain) {
    const inside = rel.filter(o => { const t = at(o); return t && A.contains(t); }).length;
    if (rel.length && inside >= Math.max(1, 0.7 * rel.length)) { area = A; break; }
  }
  if (!area) return ops;
  return ops.filter(o => special(o) || (at(o) && area.contains(at(o))));
}
"""

NOISE_JS = r"""
() => { const recs = window.__vaiRecs.splice(0); window.__vaiMO.takeRecords(); const s = new Set(); for (const r of recs) { const t = r.target.nodeType === 1 ? r.target : r.target.parentElement; const p = t && t.getAttribute && t.getAttribute('data-vai-p'); if (p) s.add(p); } return [...s]; }
"""

SKIP_JS = r"""
() => { const s = new Set(); document.querySelectorAll('[data-vai-toggle-btn],[data-vai-toggle-panel]').forEach(e => { s.add(e.getAttribute('data-vai-p')); e.querySelectorAll('[data-vai-p]').forEach(n => s.add(n.getAttribute('data-vai-p'))); }); return [...s].filter(Boolean); }
"""


def keep_marks_js(used: List[int]) -> str:
    return "(used) => { const keep = new Set(used.map(String)); document.querySelectorAll('[data-vai-p]').forEach(n => { if (!keep.has(n.getAttribute('data-vai-p'))) n.removeAttribute('data-vai-p'); }); }"


_CLONE_CLASS = r"(^|\s)(cloned|slick-cloned|swiper-slide-duplicate|owl-item\s+cloned|flickity-cloned|splide__slide--clone)(\s|$)"


def _breakpoints(page_css: str) -> List[int]:
    """The widths at which the page's own CSS changes layout, as inclusive upper bounds of a range."""
    out = set()
    for kind, val in re.findall(r"\(\s*(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px", page_css or ""):
        v = int(float(val))
        if 280 <= v <= 1800:
            out.add(v if kind == "max" else v - 1)
    return sorted(out)


def _snap(boundary: int, bps: List[int]) -> int:
    near = [b for b in bps if abs(b - boundary) <= 140]
    return min(near, key=lambda b: abs(b - boundary)) if near else boundary


def _boundary(w1: int, w2: int, bps: List[int]) -> int:
    """Last width (inclusive) that still looks like the probe at w1 rather than the one at w2: a breakpoint of the page's own CSS
    lying between the two probes when there is one (that is where the layout really changes), else the middle."""
    inside = [b for b in bps if w1 <= b < w2]
    if inside:
        return min(inside, key=lambda b: abs(b - (w1 + w2) / 2))
    return (w1 + w2) // 2


def _fmt_len(prop: str, value: str, pw: float, ratio_ok: bool, fit: Optional[tuple] = None) -> str:
    """px value -> % of the parent when it is a real share of the container (a slide, a column), else untouched.
    `fit` = (a, b): the script's size followed `a * container + b` between two probes (columns that share a row with a gap
    are not a plain percentage: calc(50% - 8px)), which holds at every width in between instead of only at the probed one."""
    m = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)px\s*", value or "")
    if m and ratio_ok and prop in RATIO_PROPS and pw >= 120:
        px = float(m.group(1))
        if abs(px) >= 0.08 * pw and abs(px) <= 12 * pw:
            if fit and prop in ("width", "min-width", "max-width", "flex-basis"):
                a, b = fit
                if abs(b) < 0.6:
                    return f"{round(a * 100, 3)}%"
                return f"calc({round(a * 100, 3)}% {'+' if b >= 0 else '-'} {abs(round(b, 2))}px)"
            return f"{round(px / pw * 100, 3)}%"
    return value


def _num_px(v: str) -> Optional[float]:
    m = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)px\s*", v or "")
    return float(m.group(1)) if m else None


def _fit(index: List[dict], i: int, p, prop: str) -> Optional[tuple]:
    """Fits size = a * container + b through the probe i and the neighbouring probe where the same element has the same kind
    of share (columns of a row): exact between the two, where a plain percentage of one of them drifts by the gap."""
    me = index[i].get((p, prop))
    if not me:
        return None
    best = None
    for j in (i - 1, i + 1):
        if 0 <= j < len(index):
            o = index[j].get((p, prop))
            if o and abs(o[0] - me[0]) >= 40:
                gap = abs(me[1] / me[0] - o[1] / o[0])
                if gap <= 0.04 and (best is None or gap < best[0]):
                    best = (gap, o)
    if not best:
        return None
    o = best[1]
    a = (o[1] - me[1]) / (o[0] - me[0])
    b = me[1] - a * me[0]
    if 0.15 <= a <= 1.02 and abs(b) <= 120:
        return a, b
    return None


def build_rules(base_width: int, probes: List[dict], page_css: str) -> str:
    """CSS text for the probed ranges. `probes` = [{width, diffs}], ascending by width."""
    if not probes:
        return ""
    widths = [p["width"] for p in probes] + [base_width]
    bps = _breakpoints(page_css)
    # range of probe i: from the boundary with the previous probe to the boundary with the next one
    bounds = []
    for i in range(len(probes)):
        hi = _boundary(widths[i], widths[i + 1], bps)
        lo = 0 if i == 0 else bounds[i - 1][1] + 1
        bounds.append((lo, hi))
    blocks = []
    total = 0
    index: List[dict] = []
    for probe in probes:
        m: dict = {}
        for d in probe["diffs"]:
            for prop, val in list(d["set"].items()) + list(d["rm"].items()):
                px = _num_px(val)
                if px is not None and prop in RATIO_PROPS and d["pw"] >= 120:
                    m[(d["p"], prop)] = (d["pw"], px)
        index.append(m)
    for pi, (probe, (lo, hi)) in enumerate(zip(probes, bounds)):
        rules = []
        for d in probe["diffs"]:
            decl = []
            for prop, val in d["set"].items():
                decl.append(f"{prop}:{_fmt_len(prop, val, d['pw'], True, _fit(index, pi, d['p'], prop))} !important")
            for prop, val in d["rm"].items():
                if val and val not in ("normal",):
                    decl.append(f"{prop}:{_fmt_len(prop, val, d['pw'], True, _fit(index, pi, d['p'], prop))} !important")
            if decl:
                rules.append(f'[data-vai-p="{d["p"]}"]{{{";".join(decl)}}}')
                total += 1
        if rules:
            cond = f"(max-width:{hi}px)" if lo == 0 else f"(min-width:{lo}px) and (max-width:{hi}px)"
            blocks.append(f"@media {cond}{{\n" + "\n".join(rules) + "\n}")
    if not blocks:
        return ""
    return "/* vai: what the page's scripts did at other widths */\n" + "\n".join(blocks)


async def _open(scraper, url: str, width: int):
    height = 812 if width < 600 else (1024 if width < 1000 else 800)
    phone = width <= 500
    ctx = await scraper.browser.new_context(
        viewport={"width": width, "height": height}, user_agent=PHONE_UA if phone else DESKTOP_UA,
        is_mobile=phone, has_touch=phone, locale=scraper.LOCALE, timezone_id=scraper.TIMEZONE,
    )
    await ctx.route("**/*", lambda route: route.abort() if route.request.resource_type in ("media", "websocket") else route.continue_())
    page = await ctx.new_page()
    try:
        await page.goto(url, wait_until="load", timeout=40000)
    except Exception:
        pass
    try:
        await page.wait_for_load_state("networkidle", timeout=3500)
    except Exception:
        pass
    try:
        await scraper._scroll_page(page)
    except Exception:
        pass
    return ctx, page


async def mark_base(page) -> Optional[list]:
    """Numbers every element of the capture page (data-vai-p) and returns [pid, path, layout inline style]."""
    try:
        return await page.evaluate(TAG_JS, [_CLONE_CLASS, LAYOUT_PROPS])
    except Exception as e:
        logger.info(f"[probe] could not mark the page: {e!r}")
        return None


async def _probe_one(scraper, url: str, width: int, base: list) -> dict:
    out = {"width": width, "diffs": [], "ok": False}
    ctx = None
    try:
        ctx, page = await asyncio.wait_for(_open(scraper, url, width), 90)
        res = await asyncio.wait_for(page.evaluate(DIFF_JS, [base, _CLONE_CLASS, LAYOUT_PROPS, sorted(RATIO_PROPS)]), 40)
        found_ratio = res["found"] / max(1, min(res["rows"], res["base"]))
        out["match"] = round(found_ratio, 3)
        if found_ratio >= 0.8:
            out["diffs"] = res["diffs"][:700]
            out["ok"] = True
        else:
            logger.info(f"[probe] {width}px: the page is built differently here ({found_ratio:.0%} of its elements line up): skipped")
    except Exception as e:
        logger.info(f"[probe] {width}px failed: {e!r}")
    finally:
        if ctx:
            try:
                await ctx.close()
            except Exception:
                pass
    return out


async def _remark(page, base: list):
    await page.reload(wait_until="load", timeout=40000)
    try:
        await page.wait_for_load_state("networkidle", timeout=3000)
    except Exception:
        pass
    await page.wait_for_timeout(700)
    return await page.evaluate(MARK_JS, [base, _CLONE_CLASS])


async def _harvest(scraper, url: str, width: int, base: list, skip: list, budget: float = 70.0) -> list:
    """Presses every clickable-looking element (a real mouse click) on a copy of the page and records what each press
    changed. Returns [{p, ops, rev, text}]."""
    results: list = []
    ctx = None
    t0 = time.monotonic()
    try:
        ctx, page = await asyncio.wait_for(_open(scraper, url, width), 90)
        nav = {"n": 0}
        page.on("framenavigated", lambda fr: nav.__setitem__("n", nav["n"] + 1) if fr == page.main_frame else None)
        page.on("popup", lambda pp: asyncio.ensure_future(pp.close()))
        info = await page.evaluate(MARK_JS, [base, _CLONE_CLASS])
        if info["found"] / max(1, min(info["rows"], info["base"])) < 0.8:
            logger.info(f"[probe] clicks at {width}px skipped: the page is built differently here")
            return []
        await page.evaluate("() => { window.__vaiRecs = [] }")
        await page.wait_for_timeout(900)
        noisy = await page.evaluate(NOISE_JS)
        cands = await page.evaluate(LIST_JS, skip)
        reloads = 0
        for c in cands:
            if time.monotonic() - t0 > budget:
                break
            nav0 = nav["n"]
            pos = await page.evaluate(PREP_JS, c["pid"])
            if not pos:
                logger.info(f"[probe] could not bring {c['pid']} {c['text'][:30]!r} into view")
                continue
            await page.mouse.click(pos["x"], pos["y"])
            await page.wait_for_timeout(850)
            try:
                alive = await page.evaluate("() => !!window.__vaiMO")           # still the same document (a router that only changes the address does not count)
                ops = await page.evaluate(COLLECT_JS, noisy) if alive else []
                if ops:
                    ops = await page.evaluate(NEAR_JS, [ops, c["pid"]])
            except Exception:
                alive, ops = False, []
            if not alive:
                logger.info(f"[probe] pressing {c['pid']} {c['text'][:30]!r} left the page: skipped")
                if reloads < 6:
                    reloads += 1
                    try:
                        await _remark(page, base)
                    except Exception:
                        break
                continue
            if not ops:
                logger.info(f"[probe] pressed {c['pid']} {c['text'][:30]!r}: nothing changed")
                continue
            await page.evaluate("() => { window.__vaiAdded1 = window.__vaiAdded }")
            too_big = len(ops) > 400 or any(len(o.get("h", "")) > 40000 for o in ops)
            restored = False
            close_ops: list = []
            pos2 = await page.evaluate(PREP_JS, c["pid"])
            if pos2:
                await page.mouse.click(pos2["x"], pos2["y"])
                await page.wait_for_timeout(850)
                close_ops = await page.evaluate(COLLECT_JS, noisy)
                if close_ops:
                    close_ops = await page.evaluate(NEAR_JS, [close_ops, c["pid"]])
                why = await page.evaluate(RESTORED_JS.replace("__vaiAdded", "__vaiAdded1"), [ops, close_ops])
                # pressing it again did something (closed an item, switched back): it is a toggle. The clone undoes the first
                # press exactly (it remembers every value it overwrote), so what the page wrote on the way back does not matter.
                restored = (not why) or bool(close_ops)
            logger.info(f"[probe] pressed {c['pid']} {c['text'][:30]!r}: {len(ops)} change(s), undone by a second press: {bool(restored)}")
            if not too_big:
                item = {"p": c["pid"], "ops": ops, "rev": bool(restored), "text": c["text"]}
                results.append(item)
            if not restored and reloads < 6:
                reloads += 1
                await _remark(page, base)
                noisy = noisy                                              # the same elements keep moving by themselves
    except Exception as e:
        logger.info(f"[probe] clicks at {width}px stopped: {e!r}")
    finally:
        if ctx:
            try:
                await ctx.close()
            except Exception:
                pass
    logger.info(f"[probe] clicks at {width}px: {len(results)} element(s) change the page when pressed")
    return results


async def probe(scraper, url: str, page, base_width: int, page_css: str, desktop: bool) -> dict:
    """Runs the probes for the capture page. Returns {css, interactions, used}."""
    base = await mark_base(page)
    if not base:
        return {"css": "", "interactions": {}, "used": []}
    try:
        skip = await page.evaluate(SKIP_JS)
    except Exception:
        skip = []
    widths = PROBE_WIDTHS if desktop else []
    click_widths = [base_width] + ([375] if desktop else [])
    style_jobs = [_probe_one(scraper, url, w, base) for w in widths]
    click_jobs = [_harvest(scraper, url, w, base, skip) for w in click_widths]
    outs = await asyncio.gather(*style_jobs, *click_jobs)
    results, clicks = outs[:len(style_jobs)], outs[len(style_jobs):]
    css = ""
    if desktop:
        usable = [r for r in results if r["ok"] and r["diffs"]]
        css = build_rules(base_width, sorted(usable, key=lambda r: r["width"]), page_css)
    # what pressing each element does: on the wide page (d) and on the phone-sized one (m)
    interactions: dict = {}
    for key, found in zip(["d", "m"], clicks):
        for it in found:
            interactions.setdefault(str(it["p"]), {})[key] = {"ops": it["ops"], "rev": it["rev"]}
    if not desktop:
        for v in interactions.values():
            v["m"] = v.pop("d", None) or v.get("m")
    used = set()
    for r in results:
        if r["ok"]:
            used.update(d["p"] for d in r["diffs"])
    for pid, v in interactions.items():
        if pid.isdigit():
            used.add(int(pid))
        for side in v.values():
            for o in (side or {}).get("ops", []) + (side or {}).get("close", []):
                for k in ("p", "b"):
                    val = o.get(k)
                    if isinstance(val, str) and val.isdigit():
                        used.add(int(val))
    logger.info(f"[probe] {len(base)} elements, widths {widths}: {css.count('data-vai-p')} rule(s), {len(interactions)} interactive element(s)")
    return {"css": css, "interactions": interactions, "used": sorted(used)}


async def attach_interactions(page, interactions: dict) -> None:
    """Writes what pressing each element does onto it (data-vai-mx), for the runtime to repeat."""
    if not interactions:
        return
    await page.evaluate(
        """(items) => { for (const [pid, cfg] of Object.entries(items)) { const el = document.querySelector('[data-vai-p="' + pid + '"]'); if (!el) continue; const txt = JSON.stringify(cfg); if (txt.length < 160000) el.setAttribute('data-vai-mx', txt); } }""",
        interactions,
    )
