from playwright.async_api import async_playwright, Browser, Page, Response
from loguru import logger
from services import layout_probe
from typing import Optional, List
import asyncio
import re
import time
import base64
from urllib.parse import urljoin, urlparse, urlunparse

from config import settings
from services.html_utils import iter_css_urls
from services.video_rules import VTURB_PLAYER_RE, fetch_vturb

# File extensions that are never "another page to clone" — following these
# would download binaries/stylesheets/etc. as if they were navigable pages.
_NON_PAGE_EXTENSIONS = (
    ".pdf", ".zip", ".rar", ".7z", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".bmp",
    ".mp4", ".webm", ".mov", ".avi", ".mp3", ".wav", ".ogg",
    ".css", ".js", ".json", ".xml", ".woff", ".woff2", ".ttf", ".eot",
)


def normalize_url(url: str) -> str:
    """
    Canonical form used for dedup/visited-tracking: strips the fragment
    (#section-anchor is the same page, not a different one), strips a
    trailing slash (except the bare root), lowercases the host. Query
    strings are kept — ?page=2 is treated as a distinct page on purpose,
    since it often genuinely is.
    """
    parsed = urlparse(url)
    path = parsed.path.rstrip("/") or "/"
    return urlunparse((parsed.scheme, parsed.netloc.lower(), path, "", parsed.query, ""))


def is_same_site(url: str, base_url: str) -> bool:
    """Same-domain check tolerant of a bare www. prefix difference —
    site.com and www.site.com are the same site for crawling purposes."""
    def _host(u: str) -> str:
        return urlparse(u).netloc.lower().removeprefix("www.")
    return _host(url) == _host(base_url)


def looks_like_page(url: str) -> bool:
    path = urlparse(url).path.lower()
    return not path.endswith(_NON_PAGE_EXTENSIONS)


def resolve_css_urls(css_text: str, base_url: str) -> str:
    """Rewrites relative url(...) references in a CSS blob to absolute,
    resolved against base_url — the stylesheet's own URL, or the page's URL
    for inline <style> tags. Uses iter_css_urls (see html_utils) rather than
    a plain regex so a data: URI's own embedded `url(#id)` (an inline SVG
    filter/gradient referencing itself — the standard way to build a noise
    or grid texture) is treated as opaque content of the outer url(), never
    rewritten as if it were its own separate, relative reference."""
    out = []
    pos = 0
    for start, end, target in iter_css_urls(css_text):
        out.append(css_text[pos:start])
        if target.startswith(("data:", "http://", "https://")):
            out.append(css_text[start:end])
        else:
            out.append(f'url("{urljoin(base_url, target)}")')
        pos = end
    out.append(css_text[pos:])
    return "".join(out)


_TAG_PLAYERS_JS = """
() => {
  const hosts = [...document.querySelectorAll('*')].filter(n => n.tagName.includes('-') && ((n.shadowRoot && n.shadowRoot.querySelector('video')) || /player|vturb|video/i.test(n.tagName)));
  const big = hosts.filter(h => { const r = h.getBoundingClientRect(); return r.width >= 120 && r.height >= 60 && !hosts.some(o => o !== h && o.contains(h)); });
  big.forEach((h, i) => h.setAttribute('data-vai-host', String(i)));
  return big.length;
}
"""


async def shoot_players(page) -> list:
    """A picture of every custom-element video player (VTurb-style) exactly as a
    visitor sees it before pressing play. The player draws its cover - the
    blurred thumbnail AND the big "click to listen" badge on top - inside a
    closed shadow root that markup can't reach, so a screenshot is the only
    way to keep it faithful. Returned as base64 JPEGs, indexed like the
    data-vai-host attribute the helper leaves on each host."""
    import base64 as _b64
    shots: list = []
    try:
        n = await page.evaluate(_TAG_PLAYERS_JS)
        for i in range(n):
            try:
                data = await page.locator(f'[data-vai-host="{i}"]').first.screenshot(type="jpeg", quality=84, timeout=8000)
                shots.append(_b64.b64encode(data).decode())
            except Exception as e:
                logger.info(f"player shot {i} failed: {e!r}")
                shots.append("")
    except Exception as e:
        logger.info(f"player shots skipped: {e!r}")
    return shots


_TAG_VIDEOS_JS = r"""
() => {
  let n = 0;
  document.querySelectorAll('video').forEach(v => {
    if (v.getAttribute('poster') || v.closest('[data-vai-player]')) return;
    const r = v.getBoundingClientRect(), cs = getComputedStyle(v);
    if (r.width < 120 || r.height < 60 || cs.display === 'none' || cs.visibility === 'hidden') return;
    if (v.muted && v.loop && v.autoplay && !v.controls) return;       // a decorative loop, not "the video"
    v.setAttribute('data-vai-vid', String(n++));
  });
  return n;
}
"""


async def shoot_videos(page) -> list:
    """The picture a plain <video> shows before play (its first frame). The clone's player has no frame of
    its own to show until the visitor presses play, so it gets this picture as its cover. Base64 JPEGs,
    indexed like the data-vai-vid attribute left on each video."""
    import base64 as _b64
    shots: list = []
    try:
        n = await page.evaluate(_TAG_VIDEOS_JS)
        for i in range(n):
            try:
                await page.locator(f'[data-vai-vid="{i}"]').first.scroll_into_view_if_needed(timeout=2000)
                # the cover is the FIRST frame, not wherever the video happens to be
                await page.evaluate(
                    """(i) => new Promise(res => { const v = document.querySelector('[data-vai-vid="' + i + '"]'); if (!v) return res();
                      try { v.pause(); } catch (e) {}
                      if (!v.currentTime) return setTimeout(res, 120);
                      const done = () => setTimeout(res, 120); v.addEventListener('seeked', done, { once: true }); setTimeout(res, 900);
                      try { v.currentTime = 0; } catch (e) { res(); } })""", i)
                data = await page.locator(f'[data-vai-vid="{i}"]').first.screenshot(type="jpeg", quality=80, timeout=6000)
                shots.append(_b64.b64encode(data).decode())
            except Exception as e:
                logger.info(f"video frame {i} failed: {e!r}")
                shots.append("")
    except Exception as e:
        logger.info(f"video frames skipped: {e!r}")
    return shots


# Things that change as the page is SCROLLED: a bar that slides in after the first screen, a header that shrinks,
# a "back to top" button. The page's own script is gone in the clone, so the change is recorded here (at which
# scroll position, to which class/style) and replayed by the runtime; the capture keeps the state at the TOP.
SCROLL_PROBE_JS = r"""
async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pos = e => { try { return getComputedStyle(e).position; } catch (x) { return ''; } };
  const pinned = e => { const p = pos(e); return p === 'fixed' || p === 'sticky'; };
  // pinned things, header-like things, and what is inside them (a header's inner pill that gets its background)
  const cand = [...document.querySelectorAll('body *')].filter(e => {
    if (pinned(e) || e.matches('header, nav, [class*="header" i], [class*="navbar" i], [class*="sticky" i], [class*="topbar" i], [class*="back-to-top" i], [class*="floating" i]')) return true;
    let up = e.parentElement;
    for (let d = 0; up && d < 4; d++, up = up.parentElement) if (pinned(up)) return true;
    return false;
  }).slice(0, 140);
  const state = e => [e.getAttribute('class') || '', e.getAttribute('style') || ''];
  window.scrollTo(0, 0);
  await sleep(300);
  const top = cand.map(state);
  await sleep(400);
  // whatever changes by itself while we stand still is not about scrolling
  const drifting = new Set();
  cand.forEach((e, i) => { const c = state(e); if (c[0] !== top[i][0] || c[1] !== top[i][1]) drifting.add(i); });
  const found = new Map();
  const maxY = Math.min(document.documentElement.scrollHeight - innerHeight, 2600);
  for (let y = 80; y <= maxY && found.size < 24; y += 80) {
    window.scrollTo(0, y);
    await sleep(110);
    cand.forEach((e, i) => {
      if (found.has(i) || drifting.has(i)) return;
      const c = state(e);
      if (c[0] !== top[i][0] || c[1] !== top[i][1]) found.set(i, { at: y, c: c[0], s: c[1] });
    });
  }
  // a change that keeps changing as you keep scrolling (a reading-progress bar) is not a switch: leave it at the top
  const continuous = new Set();
  for (const [i, v] of found) {
    for (const extra of [400, 900]) {
      const y = Math.min(document.documentElement.scrollHeight - innerHeight, v.at + extra);
      if (y <= v.at) continue;
      window.scrollTo(0, y);
      await sleep(140);
      const c = state(cand[i]);
      if (c[0] !== v.c || c[1] !== v.s) { continuous.add(i); break; }
    }
  }
  window.scrollTo(0, 0);
  await sleep(300);
  let n = 0;
  found.forEach((v, i) => {
    if (continuous.has(i)) return;
    const e = cand[i];
    // does it come back when the visitor scrolls up again? (otherwise it is a one-way change)
    const back = state(e);
    if (back[0] !== top[i][0] || back[1] !== top[i][1]) return;
    e.setAttribute('data-vai-scroll', JSON.stringify({ at: v.at, tc: top[i][0], ts: top[i][1], c: v.c, s: v.s }));
    n++;
  });
  return n;
}
"""


def reveal_note(r: dict) -> str:
    """The sentence the project page shows for something the probe tied to a moment (of the video or of the clock)."""
    what = f"“{r.get('text')}”" if r.get("text") else f"Um elemento ({r.get('tag')})"
    if r.get("kind") == "pitch":
        mm, ss = divmod(int(r.get("at") or 0), 60)
        return f"{what} só aparece aos {mm}:{ss:02d} do vídeo: no clone ele aparece no mesmo ponto."
    return f"{what} aparece {int(r.get('at') or 0)} segundos depois de abrir a página: o clone espera o mesmo tempo."


# What the page keeps hidden until a video reaches a moment (a "buy" button at minute 3 of a VSL), found WITHOUT watching the video: the media element
# is told the video is at second F (its currentTime answers F and it fires "timeupdate"), F grows in steps, and what shows up is written down with the
# F at which it did. What shows up with the plain passing of time (a timer) is told apart by comparing F with the real time that went by.
MEDIA_TIME_PROBE_JS = r"""
async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => {
    try {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
      return el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true;
    } catch (e) { return false; }
  };
  const big = el => { const r = el.getBoundingClientRect(); return r.width >= 200 && r.height >= 100 && vis(el); };
  const cands = [...document.querySelectorAll('*')].filter(el => (el.tagName === 'VIDEO' || (el.tagName.includes('-') && 'currentTime' in el)) && big(el));
  if (!cands.length) return { found: 0, reveals: [] };
  const base = new WeakSet();
  document.body.querySelectorAll('*').forEach(e => { if (vis(e)) base.add(e); });
  const touched = new Set();
  const mo = new MutationObserver(ms => { for (const m of ms) { if (m.type === 'childList') m.addedNodes.forEach(n => n.nodeType === 1 && touched.add(n)); else if (m.target.nodeType === 1) touched.add(m.target); } });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  let dur = 0;
  for (const c of cands) { const d = Number(c.duration); if (isFinite(d) && d > dur) dur = d; }
  const limit = Math.min(dur > 10 ? dur - 2 : 900, 7200);
  const steps = [];
  for (let t = 1; t <= limit; t += (t < 30 ? 1 : t < 300 ? 2 : t < 900 ? 5 : t < 3600 ? 15 : 60)) steps.push(t);
  const fake = F => {
    for (const c of cands) {
      try { Object.defineProperty(c, 'currentTime', { configurable: true, get: () => F, set: () => {} }); } catch (e) {}
      try { if (typeof c.getCurrentTime === 'function') Object.defineProperty(c, 'getCurrentTime', { configurable: true, value: () => F }); } catch (e) {}
      try { c.dispatchEvent(new Event('timeupdate')); } catch (e) {}
    }
  };
  const seen = new Map();
  let prev = 0;
  for (const F of steps) {
    fake(F);
    await sleep(50);
    if (touched.size) {
      const now = performance.now() / 1000;
      for (const n of touched) {
        if (!n.isConnected) continue;
        for (const e of [n, ...n.querySelectorAll('*')]) {
          if (base.has(e) || seen.has(e) || !vis(e)) continue;
          seen.set(e, { F, step: F - prev, now });
        }
      }
      touched.clear();
    }
    prev = F;
  }
  mo.disconnect();
  for (const c of cands) { try { delete c.currentTime; } catch (e) {} try { delete c.getCurrentTime; } catch (e) {} }
  // the outermost thing that appeared, with something to see
  const out = [];
  for (const [e, info] of seen) {
    let anc = e.parentElement, nested = false;
    while (anc) { if (seen.has(anc)) { nested = true; break; } anc = anc.parentElement; }
    if (nested) continue;
    if (cands.some(c => c === e || c.contains(e) || e.contains(c))) continue;
    const r = e.getBoundingClientRect();
    if (r.width * r.height >= 0.45 * innerWidth * innerHeight) continue;
    const text = (e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ');
    if (!text && !e.querySelector('img, svg, button, a[href], input, video')) continue;
    // everything that showed up is first taken as tied to the video; the caller asks an untouched copy of the page which of these a plain timer shows
    out.push({ el: e, at: Math.round(info.F - Math.floor(info.step / 2)), kind: 'pitch', text: text.slice(0, 60), tag: e.tagName.toLowerCase(), seen: Math.round(info.now) });
  }
  for (const o of out) {
    if (o.kind === 'pitch') o.el.setAttribute('data-vai-pitch-at', String(Math.max(1, o.at)));
    else if (o.at >= 2 && !o.el.hasAttribute('data-vai-delay') && !o.el.closest('[data-vai-delay]')) o.el.setAttribute('data-vai-delay', String(Math.max(1, o.at - 1)));
    delete o.el;
  }
  return { found: cands.length, duration: dur, reveals: out };
}
"""


# Was a thing found by the media-time probe really tied to the video, or did the plain passing of time show it (the probe runs faster than the clock,
# so a timer of 12 seconds looks like "second 90 of the video")? Asked on a second copy of the page that nobody touches: what shows up there by itself is a timer.
CLOCK_WATCH_JS = r"""
async ({ items, limit }) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const vis = el => { try { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05; } catch (e) { return false; } };
  const found = items.map(() => null);
  while (performance.now() / 1000 < limit) {
    items.forEach((it, i) => {
      if (found[i] !== null) return;
      const e = [...document.querySelectorAll(it.tag)].find(x => norm(x.innerText || x.textContent).startsWith(it.text) && vis(x));
      if (e) found[i] = Math.round(performance.now() / 1000);
    });
    if (found.every(x => x !== null)) break;
    await sleep(250);
  }
  return found;
}
"""

TAG_DELAY_JS = r"""
({ tag, text, at }) => {
  const norm = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const vis = el => { try { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden'; } catch (e) { return false; } };
  const e = [...document.querySelectorAll(tag)].find(x => norm(x.innerText || x.textContent).startsWith(text) && vis(x));
  if (!e || e.hasAttribute('data-vai-delay')) return false;
  e.removeAttribute('data-vai-pitch-at');
  e.setAttribute('data-vai-delay', String(Math.max(1, at - 1)));
  return true;
}
"""

RETAG_AS_DELAY_JS = r"""
({ tag, text, at }) => {
  const norm = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const e = [...document.querySelectorAll(tag)].find(x => norm(x.innerText || x.textContent).startsWith(text) && x.hasAttribute('data-vai-pitch-at'));
  if (!e) return false;
  e.removeAttribute('data-vai-pitch-at');
  e.setAttribute('data-vai-delay', String(Math.max(1, at - 1)));
  return true;
}
"""


# Layers that cover the page and show up AFTER it loaded (a newsletter popup at 5s): when did each appear?
# Started right after the page opens; the capture turns the answer into data-vai-delay.
MODAL_WATCH_JS = r"""
(() => {
  if (window.__vaiWatch) return;
  window.__vaiWatch = true;
  const t0 = performance.now();
  const isModal = el => {
    try {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width >= innerWidth * 0.5 && r.height >= innerHeight * 0.5;
    } catch (e) { return false; }
  };
  const mark = el => {
    if (el.nodeType === 1 && !el.hasAttribute('data-vai-at') && isModal(el)) el.setAttribute('data-vai-at', ((performance.now() - t0) / 1000).toFixed(1));
  };
  document.querySelectorAll('body *').forEach(el => { if (isModal(el)) el.setAttribute('data-vai-at', '0'); });
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'childList') m.addedNodes.forEach(n => { if (n.nodeType === 1) { mark(n); n.querySelectorAll && n.querySelectorAll('*').forEach(mark); } });
      else if (m.type === 'attributes') mark(m.target);
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
})();
"""



# What a page is made of, for telling whether the phone gets a different page than the desktop does.
SIGNATURE_JS = r"""
() => {
  const text = (document.body.innerText || '').toLowerCase();
  const words = [...new Set(text.match(/[a-zà-ÿ0-9]{3,}/g) || [])];
  const q = s => document.body.querySelectorAll(s).length;
  // Sites that build a different page for phones (Wix, Framer, many apps) change WHICH elements exist, not just how
  // they are laid out: the set of class names tells a re-flowed page (nearly identical) from a rebuilt one.
  const cls = new Set(); let n = 0;
  document.body.querySelectorAll('*').forEach(e => { n++; if (e.classList) e.classList.forEach(c => cls.add(c)); });
  return {
    words: words.slice(0, 1500), classes: [...cls].slice(0, 6000), n,
    counts: { a: q('a[href]'), button: q('button,[role=button]'), img: q('img'), h2: q('h1,h2,h3'), section: q('section'), li: q('li'), p: q('p'), input: q('input,select,textarea'), svg: q('svg'), div: q('div') },
    textLen: text.length,
  };
}
"""


def compare_signatures(a: dict, b: dict) -> dict:
    wa, wb = set(a.get("words") or []), set(b.get("words") or [])
    jac = len(wa & wb) / max(1, len(wa | wb))
    worst = 1.0
    for k in ("a", "button", "img", "h2", "section", "li", "p", "input"):
        x, y = (a.get("counts") or {}).get(k, 0), (b.get("counts") or {}).get(k, 0)
        if max(x, y) >= 6:
            worst = min(worst, min(x, y) / max(x, y))
    ca, cb = set(a.get("classes") or []), set(b.get("classes") or [])
    cjac = len(ca & cb) / max(1, len(ca | cb))
    na, nb = a.get("n") or 0, b.get("n") or 0
    # a phone answered with a bot-check / error page (a fraction of the elements) is not a "different page": ignore it
    sane = min(na, nb) >= 20 and 0.35 <= nb / max(1, na) <= 2.9
    rebuilt = len(ca | cb) >= 40 and cjac < 0.95
    return {"jaccard": round(jac, 3), "count_ratio": round(worst, 3), "class_jaccard": round(cjac, 3),
            "needed": bool(sane and (jac < 0.88 or worst < 0.72 or rebuilt))}


# <use href="/sprite.svg#arrow"> icons: browsers refuse to draw a symbol from another origin, and the clone lives on ours.
# Fetch each sprite once while the page is still on its own origin, keep the symbols that are used, point the icons at them.
SPRITE_PREP_JS = r"""
async () => {
  const attrOf = u => (u.hasAttribute('href') ? 'href' : 'xlink:href');
  const uses = [...document.querySelectorAll('use')].filter(u => { const h = u.getAttribute(attrOf(u)) || ''; return h && !h.startsWith('#') && h.includes('#'); });
  if (!uses.length) return 0;
  window.__vaiSprites = window.__vaiSprites || {};
  const files = new Map();
  const load = url => { if (!files.has(url)) files.set(url, fetch(url, { credentials: 'omit' }).then(r => r.ok ? r.text() : '').then(t => t ? new DOMParser().parseFromString(t, 'image/svg+xml') : null).catch(() => null)); return files.get(url); };
  const hash = str => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  let n = 0;
  for (const u of uses.slice(0, 600)) {
    try {
      const attr = attrOf(u);
      const abs = new URL(u.getAttribute(attr), document.baseURI);
      const id = decodeURIComponent(abs.hash.slice(1));
      abs.hash = '';
      if (!id) continue;
      const doc = await load(abs.href);
      if (!doc) continue;
      const sym = [...doc.querySelectorAll('[id]')].find(e => e.getAttribute('id') === id);
      if (!sym) continue;
      const key = 'vai-sp-' + hash(abs.href + '#' + id);
      if (!window.__vaiSprites[key]) {
        const copy = sym.cloneNode(true);
        copy.setAttribute('id', key);
        let xml = new XMLSerializer().serializeToString(copy);
        // gradients/clip paths the symbol points at live next to it in the sprite
        const refs = [...new Set((xml.match(/url\(#([^)]+)\)/g) || []).map(x => x.slice(5, -1)))];
        for (const r of refs) { const d = [...doc.querySelectorAll('[id]')].find(e => e.getAttribute('id') === r); if (d && !xml.includes('id="' + r + '"')) xml += new XMLSerializer().serializeToString(d); }
        window.__vaiSprites[key] = xml.replace(/ xmlns(:xlink)?="[^"]*"/g, '');
      }
      u.setAttribute(attr, '#' + key);
      if (attr === 'xlink:href') u.setAttribute('href', '#' + key);
      n++;
    } catch (e) {}
  }
  return n;
}
"""


class _AppErrorScreen(RuntimeError):
    """The page's script is showing its own failure message (not the site's content)."""


APP_ERROR_JS = r"""
() => {
  const RE = /problema t[eé]cnico tempor[aá]rio|algo deu errado|ocorreu um erro inesperado|something went wrong|an unexpected error|temporary technical (problem|issue)|we.?re having (technical|some) (issues|difficulties|trouble)|try refreshing the page|atualize a p[aá]gina|p[aá]gina n[aã]o encontrada|page not found|this page (could|can.?t) (not )?be found|n[aã]o encontramos (a )?p[aá]gina/i;
  const hit = [...document.querySelectorAll('main *, body > * *')].filter(e => {
    if (e.children.length > 3) return false;
    const t = (e.innerText || '').trim();
    if (!t || t.length > 220 || !RE.test(t)) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return hit.length > 0;
}
"""


class SiteRefused(RuntimeError):
    """The site answered with an error page (or a bot wall): there is nothing to clone, and trying again differently will not change that."""


class PlaywrightScraper:
    """
    Stealth browser scraper — captures the REAL DOM and CSS of a page,
    element by element, instead of reconstructing it via AI from a
    screenshot. This is the only way to get "100% idêntico": an AI model
    looking at a picture of a section always guesses layout/colors/spacing;
    the browser's own rendered DOM has the exact values already.
    """

    VIEWPORT = {"width": 1440, "height": 900}
    MAX_BLOCKS = 150
    USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    )

    MOBILE_VIEWPORT = {"width": 390, "height": 844}
    MOBILE_USER_AGENT = (
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
    )
    # The people who use this product clone for Brazilian audiences: ask sites for the Brazilian version
    # (language, currency, date formats) the way a visitor from there would.
    LOCALE = "pt-BR"
    TIMEZONE = "America/Sao_Paulo"

    def __init__(self, use_proxy: bool = False, js: bool = True, mobile: bool = False, persona: Optional[dict] = None):
        # who is asking: a visitor who came from an ad (see services/personas.py), for pages that show something else to everybody else
        self.persona = persona
        if persona:
            mobile = bool(persona.get("mobile"))
        self.mobile = mobile
        if mobile:
            # a phone sees the page the site builds for phones: some sites (Wix, Framer, many apps) build a
            # different DOM per screen with scripts, which one desktop capture can never contain
            self.VIEWPORT = dict(self.MOBILE_VIEWPORT)
            self.USER_AGENT = self.MOBILE_USER_AGENT
        if persona:
            self.VIEWPORT = dict(persona["viewport"])
            self.USER_AGENT = persona["ua"]
        self.use_proxy = use_proxy and bool(settings.PROXY_URL)
        # js=False is the last resort for a page whose scripts keep it from
        # ever holding still (an endless reload loop, a crashing app): the
        # markup the server sent is still a clone.
        self.js = js
        # shortened timers are how late offers show up before the capture; a page whose app breaks under them is captured
        # again with natural timers (see scrape_url)
        self.cap_timers = True
        self.browser: Optional[Browser] = None
        self._playwright = None
        # What the browser itself downloaded (images, fonts). A server that refuses a plain HTTP
        # client (bot protection, hotlink rules, cookies) still handed these to the browser, so the
        # rehosting step uses these bytes first and only goes to the network for what is missing.
        self.asset_bodies: dict[str, tuple[bytes, str]] = {}
        self._asset_bytes = 0

    async def _keep_body(self, response):
        try:
            if response.request.resource_type not in ("image", "font") or response.status != 200:
                return
            url = response.url.split("#")[0]
            if url.startswith(("data:", "blob:")) or url in self.asset_bodies or self._asset_bytes > 160 * 1024 * 1024:
                return
            if int(response.headers.get("content-length", "0") or 0) > 8_000_000:
                return
            body = await response.body()
            if not body or len(body) > 8_000_000:
                return
            self.asset_bodies[url] = (body, (response.headers.get("content-type") or "").split(";")[0].strip())
            self._asset_bytes += len(body)
        except Exception:
            pass

    async def __aenter__(self):
        self._playwright = await async_playwright().start()
        launch_kwargs = {"headless": True}
        if self.use_proxy:
            launch_kwargs["proxy"] = {"server": settings.PROXY_URL}
        if self.persona:
            launch_kwargs["args"] = ["--disable-blink-features=AutomationControlled"]
        self.browser = await self._playwright.chromium.launch(**launch_kwargs)
        if self.persona:
            from services import personas
            personas.install(self.browser, self.persona)       # every context of this scan (the probes too) is that visitor
        return self

    async def __aexit__(self, *exc):
        if self.browser:
            await self.browser.close()
        if self._playwright:
            await self._playwright.stop()

    async def get_page(self, capped: bool = True) -> Page:
        context = await self.browser.new_context(
            viewport=self.VIEWPORT,
            user_agent=self.USER_AGENT,
            java_script_enabled=self.js,
            is_mobile=self.mobile,
            has_touch=self.mobile,
            locale=self.LOCALE,
            timezone_id=self.TIMEZONE,
        )
        # Caps setTimeout/setInterval delays so countdown/reveal timers on
        # the source page fire almost immediately, before we capture —
        # otherwise urgency banners/hidden offers that only reveal after
        # N seconds would be captured still-hidden.
        if self.cap_timers and capped:
          await context.add_init_script("""
            (() => {
                // a timer that sends the visitor ELSEWHERE (a timed redirect) is not shortened, it is not run at
                // all: the capture must be of this page, and the behaviour probe finds the redirect as a rule
                const redir = /location\\s*[.=]|navigate\\(|router\\.(push|replace)|history\\.(push|replace)State|window\\.open\\(/i;      // (an `a.href = ...` on a LINK is not a redirect: it is how a late button gets its address)
                const cap = (fn, isTimeout) => function(cb, delay, ...args) {
                    try {
                        if (isTimeout && delay >= 1500 && typeof cb === 'function' && redir.test(Function.prototype.toString.call(cb).slice(0, 600))) return 0;
                    } catch (e) {}
                    // only the LONG waits are shortened (a late offer, a countdown): a script that polls or waits a moment for its own
                    // dependencies (an animation library still loading) keeps its natural timing
                    const wait = delay || 0;
                    // a long wait is shortened so the page reaches its final state before the capture, but WHEN it would have happened is
                    // remembered: what that timer shows is marked (data-vai-when) so the clone shows it at the same moment
                    if (isTimeout && wait >= 2000 && typeof cb === 'function') {
                        const when = (performance.now() + wait) / 1000;
                        const wrapped = function (...a) {
                            window.__vaiWhen = when;
                            setTimeout(() => { if (window.__vaiWhen === when) window.__vaiWhen = null; }, 160);
                            return cb.apply(this, a);
                        };
                        return fn(wrapped, 300, ...args);
                    }
                    return fn(cb, wait >= 2000 ? 300 : wait, ...args);
                };
                window.setTimeout = cap(window.setTimeout.bind(window), true);
                window.setInterval = cap(window.setInterval.bind(window), false);
                try {
                    new MutationObserver(ms => {
                        const when = window.__vaiWhen;
                        if (!when) return;
                        const mark = n => { if (n.nodeType === 1 && !n.hasAttribute('data-vai-when')) n.setAttribute('data-vai-when', String(Math.round(when * 10) / 10)); };
                        for (const m of ms) {
                            if (m.type === 'childList') m.addedNodes.forEach(mark);
                            else if (m.type === 'attributes' && m.attributeName !== 'data-vai-when') mark(m.target);
                        }
                    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
                } catch (e) {}
            })();
          """)
        page = await context.new_page()
        page.on("response", lambda r: asyncio.ensure_future(self._keep_body(r)))
        return page

    async def _goto_resilient(self, page: Page, url: str, timeout: int = 45000):
        """`wait_until="networkidle"` never resolves on pages with continuous
        background network activity (pixels, chat widgets, polling) — load
        the page, then make a best-effort short attempt at networkidle
        that's allowed to fail without aborting the whole scrape."""
        # A site that answers with an ERROR page must not be cloned as if the error page were the site:
        # try again (a hiccup passes), and if it persists say plainly what the site said.
        last = 0
        for attempt in range(3):
            resp = await page.goto(url, wait_until="load", timeout=timeout)
            last = resp.status if resp else 0
            if last < 400 or last in (401, 407):
                break
            logger.warning(f"[scrape] {url} answered {last} (attempt {attempt + 1})")
            await page.wait_for_timeout(2500 * (attempt + 1))
        if last >= 400 and last not in (401, 407):
            if last in (403, 429, 503):
                raise SiteRefused(f"O site recusou o acesso do clonador (resposta {last}); parece ter proteção contra robôs. Tente de novo mais tarde ou use outro link.")
            if last == 404:
                raise SiteRefused("A página não existe (resposta 404). Confira o link.")
            raise SiteRefused(f"O site respondeu com erro ({last}) em vez da página. Tente de novo mais tarde.")
        try:
            await page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass

    async def _harvest_toggles(self, url: str) -> list:
        """Finds which buttons are real show/hide toggles (FAQ items, tabs,
        disclosures) and what they reveal — on a SEPARATE, throwaway page.

        The capture page itself is never clicked. Clicking is not safe on a
        live app: a quiz funnel's "start" button advances to step 2, a
        gallery filter stays on "Sede", a price selector stays on "12x" —
        and the clone then shows whatever state our clicking left behind
        instead of the page a visitor lands on. So the clicking happens
        here, on a disposable copy, and only a description of what was
        learned (which buttons toggle, and the panel markup each reveals) is
        carried back to be applied to the untouched capture page.

        Only elements that look like pure UI-state toggles are clicked: not
        inside a <form>, not type=submit, not wrapping a link, not a
        floating widget (chat bubble), not matching an action-word denylist.
        """
        page = None
        try:
            page = await self.get_page()
            await self._goto_resilient(page, url)
            await page.wait_for_timeout(1500)
            await self._scroll_page(page)
            toggles = await page.evaluate(r"""
                async () => {
                    const DENYLIST = /comprar|compre|carrinho|checkout|finalizar|assinar|assinatura|pagar|pagamento|enviar|submit|cadastr|confirmar pedido|whatsapp|login|entrar|sign in|sign up|baixar|download|compartilhar|share|excluir|deletar|remover|cancelar|logout|sair/i;
                    const MENU_TOGGLE = /burger|hamburger|menu-toggle|nav-toggle|mobile-menu|toggle-menu/i;
                    const MENU_LABEL = /\bmenu\b/i;
                    const SEL = 'button, [role="tab"], [role="button"]';
                    const originalHref = location.href;

                    const isFixedVisible = el => {
                        const cs = getComputedStyle(el);
                        if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
                        const r = el.getBoundingClientRect();
                        return r.width > 1 && r.height > 1;
                    };
                    const insideFixed = el => {
                        for (let n = el; n && n !== document.body; n = n.parentElement) {
                            if (getComputedStyle(n).position === 'fixed') return true;
                        }
                        return false;
                    };
                    // A gallery thumbnail is also just a <button>: a click can open a
                    // lightbox or popup. Whatever fixed element is NEW since before
                    // our first click is closed so it can't cover the next target.
                    document.querySelectorAll('*').forEach(el => {
                        if (isFixedVisible(el)) el.setAttribute('data-vai-baseline-fixed', '1');
                    });
                    const closeStrayOverlays = () => {
                        const area = window.innerWidth * window.innerHeight;
                        document.querySelectorAll('*').forEach(el => {
                            if (el.hasAttribute('data-vai-baseline-fixed') || el.hasAttribute('data-vai-closed')) return;
                            if (el.closest('[data-vai-closed]') || !isFixedVisible(el)) return;
                            const r = el.getBoundingClientRect();
                            if ((r.width * r.height) / area < 0.03) return;
                            el.style.setProperty('display', 'none', 'important');
                            el.setAttribute('data-vai-closed', '1');
                        });
                    };

                    const sigOf = el => [el.tagName, el.getAttribute('role') || '', (el.textContent || '').trim().slice(0, 40), (el.className || '').toString().slice(0, 80)].join('|');
                    const candidates = Array.from(document.querySelectorAll(SEL));
                    const seen = new Map(), occ = new Map();
                    for (const el of candidates) {
                        const s = sigOf(el);
                        const n = seen.get(s) || 0;
                        seen.set(s, n + 1);
                        occ.set(el, n);
                    }

                    const harvest = [];
                    const MAX_CLICKS = 40;
                    let clicked = 0;
                    for (const el of candidates) {
                        if (clicked >= MAX_CLICKS) break;
                        if (el.closest('form') || el.getAttribute('type') === 'submit') continue;
                        if (el.closest('a[href]') || insideFixed(el)) continue;
                        if (MENU_TOGGLE.test((el.className || '').toString()) || MENU_LABEL.test(el.getAttribute('aria-label') || '')) continue;
                        if (DENYLIST.test((el.textContent || '').trim())) continue;

                        const beforeHeight = document.body.scrollHeight;
                        try { el.click(); } catch (e) { continue; }
                        clicked++;
                        await new Promise(r => setTimeout(r, 60));
                        if (location.href !== originalHref) {
                            try { history.pushState(null, '', originalHref); } catch (e) {}
                        }
                        closeStrayOverlays();

                        const grew = document.body.scrollHeight > beforeHeight + 5;
                        const shrank = document.body.scrollHeight < beforeHeight - 5;
                        let proven = grew;
                        if (shrank) {
                            // it just closed something that was open — open it again
                            try { el.click(); } catch (e) {}
                            await new Promise(r => setTimeout(r, 60));
                            closeStrayOverlays();
                            proven = true;
                        }
                        if (!proven || !document.contains(el)) continue;

                        const controlsId = el.getAttribute('aria-controls');
                        let panel = controlsId ? document.getElementById(controlsId) : null;
                        let relation = 'aria';
                        if (!panel) {
                            if (el.nextElementSibling) { panel = el.nextElementSibling; relation = 'next'; }
                            else if (el.parentElement) { panel = el.parentElement.lastElementChild; relation = 'last'; }
                        }
                        if (!panel || panel === el || panel.contains(el) || el.contains(panel) || panel.matches(SEL)) continue;
                        harvest.push({
                            sig: sigOf(el),
                            occ: occ.get(el),
                            relation,
                            controlsId: controlsId || null,
                            panelHtml: panel.outerHTML.slice(0, 60000),
                            panelDisplay: getComputedStyle(panel).display,
                        });
                    }
                    return harvest;
                }
            """)
            logger.info(f"Harvested {len(toggles or [])} real toggle(s) on a throwaway page")
            return toggles or []
        except Exception as e:
            logger.warning(f"Toggle harvest failed (non-fatal, clone is captured without click-to-open panels): {e}")
            return []
        finally:
            if page:
                try:
                    await page.context.close()
                except Exception:
                    pass

    async def _apply_toggles(self, page: Page, toggles: list):
        """Re-creates, on the untouched capture page, the show/hide pairs
        learned by _harvest_toggles: tags each real toggle button + its
        panel (data-vai-toggle-*, which vai-runtime.js turns into a working
        click), puts back panels the framework only mounts on click (hidden
        until clicked), and makes CSS-collapsed panels openable but closed
        by default — the default state a visitor actually sees."""
        if not toggles:
            return
        result = await page.evaluate(r"""
            (toggles) => {
                const SEL = 'button, [role="tab"], [role="button"]';
                const sigOf = el => [el.tagName, el.getAttribute('role') || '', (el.textContent || '').trim().slice(0, 40), (el.className || '').toString().slice(0, 80)].join('|');
                const seen = new Map(), bySig = new Map();
                for (const el of document.querySelectorAll(SEL)) {
                    const s = sigOf(el);
                    const n = seen.get(s) || 0;
                    seen.set(s, n + 1);
                    bySig.set(s + '#' + n, el);
                }
                const clipped = el => {
                    const cs = getComputedStyle(el);
                    const r = el.getBoundingClientRect();
                    if (r.height < 2 && el.scrollHeight > 4) return true;
                    if (cs.overflow !== 'hidden' && cs.overflowY !== 'hidden') return false;
                    const maxH = parseFloat(cs.maxHeight);
                    const rows = cs.gridTemplateRows;
                    return (!isNaN(maxH) && isFinite(maxH) && maxH < el.scrollHeight - 2) || (/^\d/.test(rows) && parseFloat(rows) < el.scrollHeight - 2);
                };
                let idx = 0, injected = 0;
                for (const t of toggles) {
                    const btn = bySig.get(t.sig + '#' + t.occ);
                    if (!btn) continue;
                    const openDisplay = t.panelDisplay && t.panelDisplay !== 'none' ? t.panelDisplay : 'block';
                    let panel = t.controlsId ? document.getElementById(t.controlsId) : null;
                    if (!panel) panel = t.relation === 'next' ? btn.nextElementSibling : (btn.parentElement ? btn.parentElement.lastElementChild : null);
                    if (panel && (panel === btn || panel.contains(btn) || btn.contains(panel) || panel.matches(SEL))) panel = null;

                    if (!panel) {
                        // only mounted by the framework on click — put it back, closed
                        const wrap = document.createElement('div');
                        wrap.innerHTML = t.panelHtml;
                        panel = wrap.firstElementChild;
                        if (!panel) continue;
                        window.__vaiSanitize(panel);
                        panel.style.setProperty('display', 'none', 'important');
                        panel.setAttribute('data-vai-open-display', openDisplay);
                        btn.insertAdjacentElement('afterend', panel);
                        injected++;
                    } else if (getComputedStyle(panel).display === 'none') {
                        panel.setAttribute('data-vai-open-display', openDisplay);
                    } else if (clipped(panel)) {
                        // collapsed by CSS (max-height:0 / grid rows 0fr): make it
                        // openable, and closed until clicked
                        panel.style.setProperty('max-height', 'none', 'important');
                        panel.style.setProperty('grid-template-rows', '1fr', 'important');
                        panel.style.setProperty('overflow', 'visible', 'important');
                        panel.style.setProperty('display', 'none', 'important');
                        panel.setAttribute('data-vai-open-display', openDisplay);
                    }
                    btn.setAttribute('data-vai-toggle-btn', String(idx));
                    panel.setAttribute('data-vai-toggle-panel', String(idx));
                    idx++;
                }
                return { applied: idx, injected };
            }
        """, toggles)
        logger.info(f"Applied {result.get('applied')} toggle pair(s) to the capture page ({result.get('injected')} panel(s) put back)")

    async def _probe_media_time(self, page: Page) -> list:
        """Elements the page keeps hidden until a video reaches a moment (see MEDIA_TIME_PROBE_JS): tagged for the clone, and listed for the notes."""
        try:
            res = await asyncio.wait_for(page.evaluate(MEDIA_TIME_PROBE_JS), 60)
        except Exception as e:
            logger.info(f"[scrape] media-time probe skipped: {e!r}")
            return []
        reveals = (res or {}).get("reveals") or []
        # tied to the video, or just to the clock? (asked on a second, untouched copy of the page)
        timed = [r for r in reveals if r.get("kind") == "pitch" and r.get("text")]
        if timed:
            try:
                p2 = await self.get_page(capped=False)             # a copy whose timers keep their real length
                try:
                    await p2.goto(page.url, wait_until="domcontentloaded", timeout=30000)
                    limit = min(45, max(r.get("seen", 0) for r in timed) + 4)
                    found = await asyncio.wait_for(p2.evaluate(CLOCK_WATCH_JS, {"items": [{"tag": r["tag"], "text": r["text"]} for r in timed], "limit": limit}), limit + 15)
                finally:
                    await p2.context.close()
                for r, tau in zip(timed, found):
                    if tau is not None:
                        r["kind"], r["at"] = "delay", int(tau)
                        await page.evaluate(RETAG_AS_DELAY_JS, {"tag": r["tag"], "text": r["text"], "at": int(tau)})
            except Exception as e:
                logger.info(f"[scrape] clock check skipped: {e!r}")
        if reveals:
            logger.info(f"[scrape] media-time probe: {[(r['kind'], r['at'], r['text'][:30]) for r in reveals]}")
        return reveals

    async def _tell_timers_from_video(self, page: Page) -> int:
        """Things that came up while the walker watched a screen are tied to the VIDEO's clock when the video was playing then; but a timer of 12 seconds
        looks the same. A second, untouched copy of the page (no video pressed) shows which of them appear by themselves: those are delays."""
        try:
            app = await page.evaluate("() => (window.__vai && window.__vai.appearances) ? window.__vai.appearances(1.5) : []")
        except Exception:
            return 0
        items = [{"tag": str(a.get("tag") or "").lower(), "text": (a.get("text") or "").strip().replace("\n", " ")[:60], "t": float(a.get("t") or 0)} for a in (app or []) if a.get("text") and a.get("tag")]
        items = [i for i in items if i["t"] >= 2][:6]
        if not items:
            return 0
        n = 0
        try:
            p2 = await self.get_page(capped=False)             # a copy whose timers keep their real length
            try:
                await p2.goto(page.url, wait_until="domcontentloaded", timeout=30000)
                limit = min(45, max(i["t"] for i in items) + 4)
                found = await asyncio.wait_for(p2.evaluate(CLOCK_WATCH_JS, {"items": [{"tag": i["tag"], "text": i["text"]} for i in items], "limit": limit}), limit + 15)
            finally:
                await p2.context.close()
            for it, tau in zip(items, found):
                if tau is not None and await page.evaluate(TAG_DELAY_JS, {"tag": it["tag"], "text": it["text"], "at": int(tau)}):
                    n += 1
        except Exception as e:
            logger.info(f"[scrape] timer/video check skipped: {e!r}")
        return n

    async def _reveal_hidden(self, page: Page):
        """Un-hides content that the page's own JS hid INLINE (a timer-gated
        offer, a reveal animation that never fired) so a clone doesn't ship
        permanently-hidden content.

        Deliberately narrow. This used to force EVERY display:none /
        visibility:hidden / opacity:0 element visible — including things
        that are hidden by design and by the page's own stylesheet
        (mobile-only elements at desktop width, modals, dropdown menus,
        tooltips, tab panels): that is exactly what put a full-screen
        photo lightbox on top of a cloned hero. Visibility decided by the
        stylesheet or by a class is the original design speaking, and the
        captured stylesheet reproduces it natively at every width — only
        the INLINE styles a script wrote (style="display:none" /
        "opacity:0") are state, not design.
        """
        await page.evaluate(r"""
            () => {
                const MENU_TOGGLE = /burger|hamburger|menu-toggle|nav-toggle|mobile-menu|toggle-menu/i;
                const MENU_LABEL = /\bmenu\b/i;
                const OVERLAY_ROLES = /^(dialog|alertdialog|menu|menubar|tooltip|listbox|tablist|tab)$/;
                const isMenuToggle = el => MENU_TOGGLE.test((el.className || '').toString()) || MENU_LABEL.test(el.getAttribute('aria-label') || '');

                const isProtected = el => {
                    // an inline icon sprite (<svg style="display:none"><defs>/<symbol>...) is hidden BY DESIGN: shown, it is a blank 300x150 box
                    if (String(el.tagName).toLowerCase() === 'svg' && !el.querySelector(':scope > *:not(defs):not(symbol):not(style):not(title):not(desc)')) return true;
                    if (['TEMPLATE', 'NOSCRIPT', 'STYLE', 'SCRIPT', 'DATALIST'].includes(el.tagName)) return true;
                    if (el.tagName === 'DIALOG' || el.hasAttribute('popover') || el.getAttribute('aria-modal') === 'true') return true;
                    if (OVERLAY_ROLES.test(el.getAttribute('role') || '')) return true;
                    if (el.hasAttribute('data-aos') || el.hasAttribute('data-vai-closed') || el.hasAttribute('data-vai-toggle-panel')) return true;
                    if (isMenuToggle(el)) return true;
                    for (let n = el; n && n !== document.body; n = n.parentElement) {
                        if (n.hasAttribute('data-vai-closed')) return true;
                        if (['NAV', 'DIALOG'].includes(n.tagName) && n !== el) return true;
                        if (getComputedStyle(n).position === 'fixed') return true;
                    }
                    return false;
                };

                const hiddenInline = Array.from(document.querySelectorAll('[style]')).filter(el => {
                    const s = el.style;
                    return (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') && !isProtected(el);
                });

                // A crossfade carousel stacks EVERY slide at the same spot
                // and hides all but the active one — revealing them all
                // would pile every slide on top of each other. Only the
                // first of any cluster of same-parent, same-box siblings
                // is let through.
                const skip = new Set();
                const withBox = hiddenInline.map(el => ({ el, rect: el.getBoundingClientRect(), parent: el.parentElement }));
                for (let i = 0; i < withBox.length; i++) {
                    if (skip.has(withBox[i].el)) continue;
                    const a = withBox[i].rect;
                    if (a.width <= 0 || a.height <= 0) continue;
                    for (let j = i + 1; j < withBox.length; j++) {
                        if (skip.has(withBox[j].el) || withBox[i].parent !== withBox[j].parent) continue;
                        const b = withBox[j].rect;
                        if (Math.abs(a.left - b.left) < 4 && Math.abs(a.top - b.top) < 4 &&
                            Math.abs(a.width - b.width) < 4 && Math.abs(a.height - b.height) < 4) skip.add(withBox[j].el);
                    }
                }

                // Revealing is for a late offer, a reveal animation that never fired. Some sites keep whole
                // ALTERNATE pages hidden inline (one-page sites switching panels by the address hash, wizard
                // steps): showing those would stack the entire site on top of itself. An element whose reveal
                // makes the page much taller than a section would is put back.
                const pageH = () => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
                let budget = Math.max(1500, pageH() * 0.5);
                let measured = 0;
                for (const el of hiddenInline) {
                    if (skip.has(el)) continue;
                    const s = el.style;
                    const before = el.getAttribute('style');
                    // past the first 120 only the section-sized ones are still measured (a page full of small fade-ins
                    // must not let a whole hidden panel in unchecked: measuring each one costs a layout pass)
                    const measure = measured < 120 || (measured < 600 && el.childElementCount > 2 && (el.textContent || '').length > 400);
                    const h0 = measure ? pageH() : 0;
                    if (s.display === 'none') s.removeProperty('display');
                    if (s.visibility === 'hidden') s.removeProperty('visibility');
                    if (s.opacity === '0') {
                        s.removeProperty('opacity');
                        // the usual reveal-animation pair: opacity:0 + an offset transform
                        if (/translate|scale/.test(s.transform || '')) s.removeProperty('transform');
                    }
                    if (measure) {
                        measured++;
                        const grew = pageH() - h0;
                        if (grew > 1800 || grew > budget) { el.setAttribute('style', before || ''); continue; }
                        budget -= Math.max(0, grew);
                    }
                }

                // Collapsed accordion panels (max-height:0 / grid-rows:0fr +
                // overflow:hidden) opened by a class toggle whose script is
                // about to be stripped: force them open, they would otherwise
                // be permanently unreadable.
                document.querySelectorAll('*').forEach(el => {
                    const cs = getComputedStyle(el);
                    if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') {
                        const maxH = parseFloat(cs.maxHeight);
                        const rows = cs.gridTemplateRows;
                        const clippedByMaxHeight = !isNaN(maxH) && isFinite(maxH) && maxH < el.scrollHeight - 2;
                        const clippedByGridRows = /^\d/.test(rows) && parseFloat(rows) < el.scrollHeight - 2;
                        if ((clippedByMaxHeight || clippedByGridRows) && !isProtected(el)) {
                            el.style.setProperty('max-height', 'none', 'important');
                            el.style.setProperty('grid-template-rows', '1fr', 'important');
                            el.style.setProperty('overflow', 'visible', 'important');
                        }
                    }
                });
            }
        """)

    async def _scroll_page(self, page: Page):
        await page.evaluate("""
            async () => {
                await new Promise((resolve) => {
                    let total = 0;
                    const step = 300;
                    const timer = setInterval(() => {
                        window.scrollBy(0, step);
                        total += step;
                        if (total >= document.body.scrollHeight) {
                            clearInterval(timer);
                            window.scrollTo(0, 0);
                            resolve();
                        }
                    }, 100);
                });
            }
        """)
        await page.wait_for_timeout(800)

    async def capture_page_css(self, page: Page, sniffed_stylesheets: Optional[List[Response]] = None) -> str:
        """
        The page's REAL stylesheet — every stylesheet in the order the
        browser applies them (document.styleSheets) — so :hover/:focus,
        ::before/::after, @media breakpoints (the original responsive
        design), @keyframes, @font-face and CSS variables all survive.

        Source of each sheet, best first:
        1. The authored text itself (a <style> tag's text, or the network
           response of a <link>). NOT the CSSOM's cssText: for a rule whose
           shorthand uses var() (`background: linear-gradient(..) var(--x)`
           next to `background-clip:text`) Chrome serializes every longhand
           as an EMPTY value ("background-image: ;"), silently destroying
           gradient text and any similar rule.
        2. The CSSOM, only for sheets with no text to read: rules a CSS-in-JS
           runtime (styled-components, Emotion) inserted with insertRule(),
           and constructed/adopted stylesheets.
        Cross-origin <link> sheets are fetched through Playwright's request
        context, which isn't subject to CORS.
        """
        sheets = await page.evaluate(r"""
            () => [...document.styleSheets, ...(document.adoptedStyleSheets || [])].map((sheet, i) => {
                const owner = sheet.ownerNode;
                return {
                    i,
                    disabled: !!sheet.disabled,
                    href: sheet.href || null,
                    base: sheet.href || document.baseURI,
                    media: (sheet.media && sheet.media.mediaText) || '',
                    tag: owner ? owner.tagName : '',
                    text: owner && owner.tagName === 'STYLE' ? (owner.textContent || '') : '',
                };
            })
        """)

        async def cssom_text(index: int) -> str:
            return await page.evaluate(r"""
                (index) => {
                    const sheet = [...document.styleSheets, ...(document.adoptedStyleSheets || [])][index];
                    const serialize = (rules, depth) => {
                        let css = '';
                        for (const r of rules) {
                            if (r.type === 3 /* @import */) {
                                let inner = null;
                                try { inner = r.styleSheet && r.styleSheet.cssRules; } catch (e) {}
                                if (inner && depth < 4) {
                                    const media = (r.media && r.media.mediaText) || '';
                                    const body = serialize(inner, depth + 1);
                                    css += media && media !== 'all' ? '@media ' + media + '{' + body + '}\n' : body;
                                } else { css += r.cssText + '\n'; }
                            } else { css += r.cssText + '\n'; }
                        }
                        return css;
                    };
                    try { return serialize(sheet.cssRules, 0); } catch (e) { return ''; }
                }
            """, index)

        sniffed_by_url = {response.url: response for response in (sniffed_stylesheets or [])}
        # A real @import parser: the URL may be url("…"), url('…'), url(…)
        # or a bare string, and may itself contain ";" (every Google Fonts
        # URL does — "wght@400;500;600"). Stopping at the first ";" left the
        # tail of the URL as junk in the stylesheet, and the browser's error
        # recovery then threw away the rule that followed it — which was the
        # :root block holding the page's theme variables.
        import_re = re.compile(
            r"""@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|"([^"]*)"|'([^']*)')\s*([^;{]*);""",
            re.I,
        )

        imports: List[str] = []
        parts: List[str] = []
        seen_css = set()
        for sheet in sheets:
            if sheet.get("disabled"):
                continue
            href = sheet.get("href") or ""
            # Google Fonts <link>s are re-attached as real <link> tags
            # (capture_font_links), not inlined here.
            if "fonts.googleapis.com" in href:
                continue

            css = (sheet.get("text") or "").strip()
            if not css and sheet.get("tag") == "LINK" and href:
                try:
                    if href in sniffed_by_url:
                        css = await sniffed_by_url[href].text()
                    else:
                        resp = await page.context.request.get(href, timeout=15000)
                        css = await resp.text()
                except Exception as e:
                    logger.warning(f"Could not read stylesheet {href}: {e}")
            css = (css or "").strip()
            if not css:
                css = (await cssom_text(sheet["i"])).strip()
            if not css or css in seen_css:
                continue
            seen_css.add(css)

            base = sheet.get("base") or page.url
            # @import is only valid at the very top of a stylesheet; once
            # sheets are concatenated an import in the middle would be
            # silently ignored, so hoist them all to the front.
            def _hoist(m):
                target = next((g for g in m.groups()[:5] if g), "")
                tail = (m.group(6) or "").strip()
                if target:
                    imports.append(f'@import url("{urljoin(base, target)}"){(" " + tail) if tail else ""};')
                return ""
            css = import_re.sub(_hoist, css)

            css = resolve_css_urls(css, base)
            media = (sheet.get("media") or "").strip()
            if media and media != "all":
                css = f"@media {media}{{\n{css}\n}}"
            parts.append(css)
        return "\n".join(imports + parts).strip()

    async def capture_font_links(self, page: Page) -> List[str]:
        """Google Fonts <link> tags — the common case, safe to link
        directly rather than rehost."""
        return await page.evaluate("""
            () => Array.from(document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]'))
                .map(l => l.href)
        """)

    # Class tokens that mean "a modal/menu is open right now" on <html>/<body>
    # or a wrapper — carrying them into the clone would freeze scrolling.
    _SCROLL_LOCK_RE = r"^(modal-open|no-scroll|noscroll|overflow-hidden|scroll-lock|scroll-locked|is-locked|lock-scroll|menu-open|nav-open|body-fixed|has-modal|popup-open)$"

    _CAPTURE_SETUP_JS = r"""
        () => {
            const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'BASE', 'TITLE', 'HEAD']);
            const LANDMARKS = new Set(['SECTION', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'ARTICLE', 'FORM']);
            const SCROLL_LOCK = new RegExp(window.__vaiScrollLockSource || '^$');
            const absUrl = u => { try { return new URL(u, document.baseURI).href; } catch (e) { return u; } };

            // Cookie-consent widgets (Cookiebot, OneTrust, CookieYes, Complianz,
            // Usercentrics, Didomi, iubenda...) are third-party overlays driven
            // entirely by their own scripts. Captured without that script they
            // are inert at best and — losing their injected positioning rules —
            // can overflow the page at worst. They are not the site's design.
            const CONSENT_RE = /(cookiebot|cybot|onetrust|ot-sdk|cookie-?(law|notice|banner|consent|bar|policy|popup)|cookieconsent|cmplz|usercentrics|didomi|iubenda|osano|termly|trustarc|truste-|cc-window|cky-|cookieyes|gdpr-?(banner|cookie|consent))/i;
            // A cookie dialog that carries no telling class name (Airbnb's): found by what it SAYS and what it offers.
            const isConsentByText = el => {
                try {
                    const cs = getComputedStyle(el);
                    const role = el.getAttribute('role') || '';
                    if (!['fixed', 'sticky', 'absolute'].includes(cs.position) && !/dialog/.test(role) && el.getAttribute('aria-modal') !== 'true') return false;
                    const t = (el.innerText || '').trim();
                    if (t.length < 25 || t.length > 1400 || !/(usamos|utilizamos|usa|utiliza|we use|uses|using).{0,100}cookie|cookies?.{0,80}(experi[eê]ncia|experience|navega[cç]|browsing|consent|aceit|accept|pol[ií]tic|policy|privacidade|privacy)|pol[ií]tica de cookies|cookie (policy|settings|preferences)|consentimento de cookies/i.test(t)) return false;
                    return [...el.querySelectorAll('button, a, [role="button"]')].some(b => /aceit|accept|rejeit|reject|recus|decline|permitir|allow|gerenciar|manage|prefer|necess[aá]rio|only necessary|entendi|concordo|agree|got it/i.test(b.innerText || ''));
                } catch (e) { return false; }
            };
            // the little "Cookie preferences" tab pinned to a screen edge, which only opens the original's consent panel
            const COOKIE_TAB = /^\s*(your\s+)?(cookie|cookies|privacy)\s*(preferences|settings|choices|prefer[eê]ncias|configura[cç][õo]es)\s*$|^\s*(prefer[eê]ncias de cookies|gerenciar cookies|manage cookies|cookie settings)\s*$/i;
            const isConsentWidget = el => {
                if (isConsentByText(el)) return true;
                if (el.children.length < 4 && (el.textContent || '').length <= 40 && COOKIE_TAB.test(el.textContent || '')) {
                    for (let n = el; n && n !== document.body; n = n.parentElement) {
                        const p = getComputedStyle(n).position;
                        if (p === 'fixed' || p === 'sticky') return true;
                    }
                }
                const sig = (el.id || '') + ' ' + ((el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '');
                if (!CONSENT_RE.test(sig)) return false;
                const pos = getComputedStyle(el).position;
                return pos === 'fixed' || pos === 'sticky' || pos === 'absolute';
            };

            // url(...) inside an inline style="" attribute is relative to the
            // ORIGINAL site; once hosted on our domain it would resolve against
            // ours and 404.
            window.__vaiAbsolutizeStyle = function (styleStr) {
                return styleStr.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
                    const t = u.trim();
                    if (/^(data:|blob:|#|https?:)/i.test(t)) return m;
                    return 'url("' + absUrl(t) + '")';
                });
            };

            // Everything that could execute is stripped; everything relative
            // becomes absolute. Original inline style="" attributes are KEPT
            // (they are often real state/design set by the page's own JS) —
            // we no longer overwrite them with a desktop-width snapshot of
            // computed styles, which is what froze layouts at one viewport
            // and defeated the original @media rules.
            window.__vaiSanitize = function (root) {
                root.querySelectorAll('script, noscript').forEach(n => n.remove());
                // the numbering used while probing other screen sizes stays only where a rule or a menu button refers to it
                if (window.__vaiPUsed) {
                    [root, ...root.querySelectorAll('[data-vai-p]')].forEach(n => {
                        if (n.hasAttribute && n.hasAttribute('data-vai-p') && !window.__vaiPUsed.has(n.getAttribute('data-vai-p'))) n.removeAttribute('data-vai-p');
                    });
                }
                const nodes = [root, ...root.querySelectorAll('*')];
                for (const node of nodes) {
                    for (const attr of [...node.attributes]) {
                        const name = attr.name.toLowerCase();
                        if (name.startsWith('on')) { node.removeAttribute(attr.name); continue; }
                        if (['href', 'src', 'action', 'xlink:href', 'formaction'].includes(name) &&
                            attr.value.trim().toLowerCase().startsWith('javascript:')) {
                            node.removeAttribute(attr.name);
                        }
                    }
                    const st = node.getAttribute('style');
                    if (st && st.includes('url(')) node.setAttribute('style', window.__vaiAbsolutizeStyle(st));
                }
                // a.href (not getAttribute) is the browser-RESOLVED absolute URL.
                root.querySelectorAll('a[href]').forEach(a => {
                    if (a.href) a.setAttribute('href', a.href);
                });
                // <picture> art direction: a <source media="..."> shows a DIFFERENT picture (a portrait crop for phones,
                // a tighter one for tablets). Keeping only what the capture window chose would show the desktop picture
                // on every screen, so those sources stay (with absolute URLs, and rehosted with the page's pictures).
                // Format alternatives (<source type="image/webp"> with no media) add nothing and are dropped.
                const absSrcset = v => String(v || '').split(/,\s+/).map(c => {
                    const t = c.trim().split(/\s+/);
                    if (!t[0]) return '';
                    return [t[0].startsWith('data:') ? t[0] : absUrl(t[0]), ...t.slice(1)].join(' ');
                }).filter(Boolean).join(', ');
                root.querySelectorAll('picture').forEach(pic => {
                    const img = pic.querySelector('img');
                    let kept = 0;
                    pic.querySelectorAll('source').forEach(srcEl => {
                        const media = (srcEl.getAttribute('media') || '').trim();
                        const ss = srcEl.getAttribute('srcset') || srcEl.getAttribute('data-srcset') || '';
                        if (!media || !ss) { srcEl.remove(); return; }
                        srcEl.setAttribute('srcset', absSrcset(ss));
                        srcEl.removeAttribute('data-srcset');
                        srcEl.removeAttribute('sizes');
                        kept++;
                    });
                    if (img) {
                        if (kept) {
                            // the default picture (when no source matches) is the <img>'s own src, not the one a source made current
                            const own = img.getAttribute('src') || img.getAttribute('data-src') || '';
                            const dflt = own && !own.startsWith('data:') ? absUrl(own) : own;
                            if (dflt) img.setAttribute('src', dflt);
                            else if (img.currentSrc) img.setAttribute('src', img.currentSrc);
                            img.setAttribute('data-vai-art', '1');
                        } else if (!(img.currentSrc || img.src)) {
                            const first = pic.querySelector('source[srcset]');
                            const cand = first && first.getAttribute('srcset').split(',')[0].trim().split(/\s+/)[0];
                            if (cand) img.setAttribute('src', absUrl(cand));
                        }
                    }
                });
                root.querySelectorAll('img').forEach(img => {
                    if (img.getAttribute('data-vai-art')) { img.removeAttribute('data-vai-art'); img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.removeAttribute('loading'); return; }
                    const real = img.currentSrc || img.src;
                    if (real) img.setAttribute('src', real);
                    img.removeAttribute('srcset');
                    img.removeAttribute('sizes');
                    img.removeAttribute('loading');
                });
                root.querySelectorAll('video[src], source[src], audio[src], iframe[src], embed[src], track[src]').forEach(el => {
                    const real = el.src;
                    if (real) el.setAttribute('src', real);
                });
                root.querySelectorAll('video[poster]').forEach(v => { if (v.getAttribute('poster')) v.setAttribute('poster', v.poster); });
                root.querySelectorAll('object[data]').forEach(o => { if (o.data) o.setAttribute('data', o.data); });
                root.querySelectorAll('use[href], image[href]').forEach(el => {
                    const h = el.getAttribute('href');
                    if (h && !h.startsWith('#') && !/^(data:|https?:)/i.test(h)) el.setAttribute('href', absUrl(h));
                });
                // Lightbox/modal DOM our own clicks opened and then closed:
                // without its script it can never open again, only add junk.
                // widgets that only work on the original's domain and tracking frames nobody sees: they would just
                // show an error badge or ping other people's servers from the clone
                const JUNK = /recaptcha|hcaptcha|challenges\.cloudflare|turnstile|doubleclick\.net|googletagmanager\.com\/ns|facebook\.com\/tr|connect\.facebook\.net|google-analytics|analytics\.|px\.ads|bat\.bing|snapchat\.com\/p|tiktok\.com\/i18n/;
                // when the block itself is the junk frame / the floating player, the whole block is dropped (see __vaiCaptureOne)
                if (root.tagName === 'IFRAME' && JUNK.test((root.getAttribute('src') || root.getAttribute('data-src') || '').toLowerCase())) { root.setAttribute('data-vai-drop', '1'); return; }
                root.querySelectorAll('iframe').forEach(f => {
                    const u = (f.getAttribute('src') || f.getAttribute('data-src') || '').toLowerCase();
                    if (JUNK.test(u)) f.remove();
                });
                // helper frames nobody sees (a marketing form's cross-domain bridge, a 1x1 sync pixel, an ad parked
                // thousands of pixels off the page): a player or map frame is never one of these
                const HELPER = /mkto|xdframe|usersync|user_sync|cookiesync|\/sync\b|pixel|beacon|tracker|tracking|adservice|adsystem|\bads?\./;
                const EMBED = /youtube|vimeo|wistia|vturb|converteai|panda|player|maps|calendly|typeform|tally\.so|hubspot|jotform/;
                root.querySelectorAll('iframe').forEach(f => {
                    const u = ((f.getAttribute('src') || f.getAttribute('data-src') || '') + ' ' + (f.name || '') + ' ' + (f.id || '')).toLowerCase();
                    if (EMBED.test(u)) return;
                    const cs = getComputedStyle(f), r = f.getBoundingClientRect();
                    const parked = (cs.position === 'absolute' || cs.position === 'fixed') && (parseFloat(cs.top) <= -1000 || parseFloat(cs.left) <= -1000);
                    const tiny = cs.display !== 'none' && (r.width <= 2 || r.height <= 2);
                    if (HELPER.test(u) || parked || tiny) f.remove();
                });
                root.querySelectorAll('.grecaptcha-badge, [class*="g-recaptcha"], .h-captcha, .cf-turnstile').forEach(n => n.remove());
                // frames pinned over the page that are not a video or a map: a consent iframe, a marketing pop-up, a chat window.
                // They belong to the original's scripts and domain, so in a clone they would only cover the page.
                if (root.tagName === 'IFRAME') {
                    const ru = ((root.getAttribute('src') || root.getAttribute('data-src') || '') + ' ' + (root.name || '') + ' ' + (root.id || '')).toLowerCase();
                    if (!EMBED.test(ru) && getComputedStyle(root).position === 'fixed') { root.setAttribute('data-vai-drop', '1'); return; }
                }
                root.querySelectorAll('iframe').forEach(f => {
                    const fu = ((f.getAttribute('src') || f.getAttribute('data-src') || '') + ' ' + (f.name || '') + ' ' + (f.id || '')).toLowerCase();
                    if (EMBED.test(fu)) return;
                    let pinned = null;
                    for (let n = f; n && n !== root.parentElement; n = n.parentElement) {
                        if (getComputedStyle(n).position === 'fixed') { pinned = n; break; }
                    }
                    if (!pinned) return;
                    if (pinned === root) { root.setAttribute('data-vai-drop', '1'); return; }
                    f.remove();
                    if (!(pinned.innerText || '').trim() && !pinned.querySelector('img, video, svg, canvas, input, button, a[href]')) pinned.remove();
                });
                if (root.hasAttribute('data-vai-drop')) return;
                // a small player that floats over the page (a "mini player" that follows the visitor, a sticky video widget)
                // is a widget of the original's script, not content: in a clone it would sit on top of the page forever
                root.querySelectorAll('video, iframe').forEach(m => {
                    let fixed = null;
                    for (let n = m; n && n !== root.parentElement; n = n.parentElement) {
                        if (getComputedStyle(n).position === 'fixed') { fixed = n; break; }
                    }
                    if (!fixed) return;
                    const r = fixed.getBoundingClientRect();
                    const asVideo = m.tagName === 'VIDEO' || /youtube|vimeo|wistia|vturb|converteai|panda|player/i.test(m.getAttribute('src') || '');
                    if (asVideo && r.width < 520 && r.height < 360 && fixed !== document.body) { if (fixed === root) root.setAttribute('data-vai-drop', '1'); else fixed.remove(); }
                });
                root.querySelectorAll('[data-vai-closed]').forEach(n => n.remove());
                // a <dialog> that was open when the page was read (a "visit your local store" popup, a newsletter box) was
                // opened by the page's script; serialized with its open attribute it would sit in the clone for good
                root.querySelectorAll('dialog[open]').forEach(d => d.removeAttribute('open'));
                if (root.tagName === 'DIALOG') root.removeAttribute('open');
                if (isConsentByText(root)) { root.setAttribute('data-vai-drop', '1'); return; }
                // a big app (one block of 1.7 MB) has far more than 6000 nodes and the banner is often near its end: look at the
                // elements that NAME themselves as a dialog / cookie box wherever they are, then at the first and last nodes
                const named = root.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog, [data-testid*="cookie" i], [data-testid*="consent" i], [id*="cookie" i], [id*="consent" i], [class*="cookie" i], [aria-label*="cookie" i]');
                named.forEach(n => { if (n.isConnected && isConsentWidget(n)) n.remove(); });
                const everyNode = root.querySelectorAll('*');
                everyNode.forEach((n, k) => { if ((k < 6000 || k >= everyNode.length - 1500) && n.isConnected && isConsentWidget(n)) n.remove(); });
                root.querySelectorAll('[data-vai-baseline-fixed]').forEach(n => n.removeAttribute('data-vai-baseline-fixed'));
            };

            // A <canvas> (JS-driven starfield, particle effect, WebGL
            // background...) has no visual content in its outerHTML — the
            // pixels only exist in its backing bitmap. Bake the CURRENT frame
            // in as a static <img> (freezing the animation, not restoring it).
            window.__vaiFreezeCanvases = function (root) {
                const canvases = [...root.querySelectorAll('canvas')];
                for (const canvas of canvases) {
                    try {
                        const dataUrl = canvas.toDataURL('image/png');
                        const img = document.createElement('img');
                        img.src = dataUrl;
                        img.className = canvas.className;
                        const existingStyle = canvas.getAttribute('style');
                        if (existingStyle) img.setAttribute('style', existingStyle);
                        canvas.replaceWith(img);
                    } catch (e) {
                        // Tainted canvas (cross-origin pixels, no CORS) — nothing recoverable.
                    }
                }
            };

            const attrsOf = (el, kind) => {
                const out = {};
                for (const a of el.attributes) {
                    const n = a.name;
                    if (n.startsWith('on') || n.startsWith('data-vai')) continue;
                    let v = a.value;
                    if (n === 'class') {
                        v = v.split(/\s+/).filter(t => t && !SCROLL_LOCK.test(t)).join(' ');
                        if (!v) continue;
                    }
                    if (n === 'style') {
                        // scroll-lock inline styles from an open modal/menu
                        if (kind === 'root') {
                            v = v.split(';').filter(d => d.trim() && !/^\s*(overflow|position|padding-right|touch-action)/i.test(d)).join(';');
                            if (!v) continue;
                        }
                        v = window.__vaiAbsolutizeStyle(v);
                    }
                    out[n] = v;
                }
                return out;
            };

            const significantKids = node => [...node.children].filter(c => {
                if (SKIP_TAGS.has(c.tagName)) return false;
                if (c.hasAttribute('data-vai-closed')) return false;
                if (isConsentWidget(c)) return false;
                const cs = getComputedStyle(c);
                if (cs.display === 'none') return false;
                const r = c.getBoundingClientRect();
                // zero-size live-region helpers (framework route announcers etc.)
                if (c.tagName === 'NEXT-ROUTE-ANNOUNCER' || c.id === '__next-route-announcer__') return false;
                if (r.width * r.height <= 4 && !(c.textContent || '').trim() && !c.querySelector('img, video, svg, canvas, iframe, input, button')) return false;
                return true;
            });
            const outOfFlow = c => { const p = getComputedStyle(c).position; return p === 'fixed' || p === 'absolute'; };

            // The wrapper chain + the element whose children are the page's
            // blocks. Starts at <body> and keeps descending while there is a
            // single in-flow child that is merely a wrapper (#__next, <main>,
            // .page-wrapper...). Everything it passes through becomes the
            // shell, re-created around the blocks wherever the clone renders.
            window.__vaiPlanCapture = function () {
                document.querySelectorAll('[data-vai-idx]').forEach(e => e.removeAttribute('data-vai-idx'));
                let node = document.body;
                const chain = [];
                const outerExtras = [];
                for (let depth = 0; depth < 8; depth++) {
                    const kids = significantKids(node);
                    const flow = kids.filter(c => !outOfFlow(c));
                    if (flow.length !== 1) break;
                    const only = flow[0];
                    if (LANDMARKS.has(only.tagName) && only.tagName !== 'ARTICLE') break;
                    const innerFlow = significantKids(only).filter(c => !outOfFlow(c));
                    if (innerFlow.length === 0) break;
                    const hasBig = innerFlow.some(c => LANDMARKS.has(c.tagName) || c.getBoundingClientRect().height >= 100);
                    if (innerFlow.length < 2 && !hasBig) break;
                    kids.filter(c => c !== only).forEach(c => outerExtras.push(c));
                    chain.push(only);
                    node = only;
                }
                const blockEls = [...significantKids(node), ...outerExtras];
                window.__vaiBlockEls = blockEls;
                blockEls.forEach((el, i) => el.setAttribute('data-vai-idx', String(i)));

                const viewport = document.querySelector('meta[name="viewport"]');
                const shell = {
                    html: attrsOf(document.documentElement, 'root'),
                    body: attrsOf(document.body, 'root'),
                    wrappers: chain.map(el => ({ tag: el.tagName.toLowerCase(), attrs: attrsOf(el, 'wrapper') })),
                    viewport: viewport ? viewport.getAttribute('content') : null,
                    title: document.title || null,
                };
                return { shell, count: blockEls.length };
            };

            window.__vaiBlockBox = function (idx) {
                const el = document.querySelector('[data-vai-idx="' + idx + '"]');
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { top: r.top + window.scrollY, height: r.height };
            };

            window.__vaiCaptureOne = function (idx) {
                const el = document.querySelector('[data-vai-idx="' + idx + '"]');
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                const images = Array.from(el.querySelectorAll('img')).slice(0, 80).map(img => ({
                    src: img.currentSrc || img.src || '',
                    alt: img.alt || '',
                })).filter(i => i.src && !i.src.startsWith('data:'));
                const links = Array.from(el.querySelectorAll('a[href]')).slice(0, 40).map(a => ({
                    href: a.href || '',
                    text: (a.textContent || '').trim().slice(0, 80),
                })).filter(l => l.href && !l.href.startsWith('javascript:'));
                const tag = el.tagName;
                const className = (el.className || '').toString().substring(0, 100);

                // A custom-element video player (VTurb/Panda-style) keeps its
                // <video> in a shadow root, which outerHTML never serializes —
                // only an empty placeholder survives. Put the real stream
                // inside the player element itself, sized to the box the
                // player occupied, so the video sits exactly where it did.
                let embedded = 0;
                const pv = window.__vaiPlayerVideo;
                if (pv && pv.url) {
                    const hosts = [el, ...el.querySelectorAll('*')].filter(n => n.tagName.includes('-') && ((n.shadowRoot && n.shadowRoot.querySelector('video')) || /player|vturb|video/i.test(n.tagName)));
                    for (const host of hosts) {
                        if (hosts.some(o => o !== host && o.contains(host))) continue;
                        const r = host.getBoundingClientRect();
                        if (r.width < 120 || r.height < 60) continue;
                        const aspect = (r.height / r.width * 100).toFixed(3);
                        // the cover image the original player shows before play
                        const thumb = host.querySelector('img');
                        const poster = (thumb && (thumb.currentSrc || thumb.src)) || pv.poster || '';
                        // our own smart player (public/vai-player.js) mounts on this marker
                        const shotIdx = host.getAttribute('data-vai-host');
                        const hasShot = shotIdx !== null && window.__vaiShots && window.__vaiShots[+shotIdx];
                        const rules = pv.rules || {};
                        const pcfg = hasShot
                            ? Object.assign({ src: pv.url, bar: 'smart', cover: 'shot' }, rules, { poster: '__VAI_SHOT_' + shotIdx + '__', start: 'click' })
                            : Object.assign({ src: pv.url, bar: 'smart', start: 'preview' }, rules, { poster: poster || undefined, preview: pv.preview || undefined });
                        host.innerHTML =
                            '<div data-vai-player="' + JSON.stringify(pcfg).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"' +
                            ' style="position:relative;width:100%;padding-top:' + aspect + '%;background:#000;border-radius:inherit;overflow:hidden"></div>';
                        host.style.setProperty('display', 'block');
                        embedded++;
                    }
                }

                // what changes on scroll is kept in its state at the TOP of the page; the runtime replays the change
                for (const sc of [el, ...el.querySelectorAll('[data-vai-scroll]')]) {
                    if (!sc.hasAttribute || !sc.hasAttribute('data-vai-scroll')) continue;
                    try {
                        const d = JSON.parse(sc.getAttribute('data-vai-scroll'));
                        if (d.tc) sc.setAttribute('class', d.tc); else sc.removeAttribute('class');
                        if (d.ts) sc.setAttribute('style', d.ts); else sc.removeAttribute('style');
                    } catch (e) { sc.removeAttribute('data-vai-scroll'); }
                }
                // open shadow roots (web components) as declarative shadow DOM, so their content survives outerHTML
                  // An open shadow root is invisible to outerHTML: its content is written out as a declarative shadow
                  // root (<template shadowrootmode>), which the browser turns back into a real shadow root on parse.
                  function serializeShadow(host, depth) {
                    const sr = host.shadowRoot;
                    if (!sr || (depth || 0) > 4) return { html: '', imgs: [] };
                    const box = document.createElement('div');
                    for (const c of sr.childNodes) box.appendChild(c.cloneNode(true));
                    const imgs = [];
                    box.querySelectorAll('script, noscript').forEach(n => n.remove());
                    box.querySelectorAll('*').forEach(n => { for (const a of Array.from(n.attributes)) if (/^on/i.test(a.name)) n.removeAttribute(a.name); });
                    box.querySelectorAll('img').forEach(i => { if (i.src && !i.src.startsWith('data:')) { i.setAttribute('src', i.src); imgs.push({ src: i.src, alt: i.alt || '' }); } });
                    let css = '';
                    try { for (const sh of sr.adoptedStyleSheets || []) for (const r of sh.cssRules) css += r.cssText + '\n'; } catch (e) { /* cross-origin sheet */ }
                    const live = [...sr.querySelectorAll('*')], copy = [...box.querySelectorAll('*')];
                    live.forEach((n, i) => {
                      if (n.shadowRoot && copy[i]) {
                        const inner = serializeShadow(n, (depth || 0) + 1);
                        if (inner.html) { copy[i].insertAdjacentHTML('afterbegin', '<template shadowrootmode="open">' + inner.html + '</template>'); inner.imgs.forEach(x => imgs.push(x)); }
                      }
                    });
                    return { html: (css ? '<style>' + css + '</style>' : '') + box.innerHTML, imgs };
                  }
                for (const sh of [el, ...el.querySelectorAll('*')]) {
                    if (!sh.shadowRoot || sh.shadowRoot.querySelector('video') || sh.shadowRoot.querySelector('iframe[src]') || sh.hasAttribute('data-vai-vhost') || sh.hasAttribute('data-vai-shadow') || (sh.tagName.includes('-') && /player|vturb|video/i.test(sh.tagName))) continue;
                    const ser = serializeShadow(sh, 0);
                    if (ser.html) { sh.insertAdjacentHTML('afterbegin', '<template shadowrootmode="open">' + ser.html + '</template>'); sh.setAttribute('data-vai-shadow', '1'); ser.imgs.forEach(x => images.push(x)); }
                }
                // layers that cover the page (age gate, newsletter popup): marked, so the clone can close them
                for (const mm of [el, ...el.querySelectorAll('*')]) {
                    const mcs = getComputedStyle(mm);
                    if (mcs.position !== 'fixed' || mcs.display === 'none' || mcs.visibility === 'hidden') continue;
                    const mr = mm.getBoundingClientRect();
                    if (mr.width < innerWidth * 0.5 || mr.height < innerHeight * 0.5) continue;
                    const z = parseInt(mcs.zIndex, 10) || 0;
                    const hint = /modal|popup|pop-up|overlay|gate|lightbox|dialog|backdrop|splash|interstitial/i.test((mm.id || '') + ' ' + (typeof mm.className === 'string' ? mm.className : ''));
                    const smallLayer = (mm.innerText || '').length <= (document.body.innerText || '').length * 0.6;
                    if (smallLayer && (z >= 50 || hint || mm.getAttribute('role') === 'dialog' || mm.getAttribute('aria-modal') === 'true' || mm.tagName === 'DIALOG')) {
                        mm.setAttribute('data-vai-modal', '1');
                        // it was not there when the page opened: it comes up at the same moment in the clone
                        const at = parseFloat(mm.getAttribute('data-vai-at') || '0');
                        if (at >= 1.5 && !mm.hasAttribute('data-vai-delay')) mm.setAttribute('data-vai-delay', String(Math.round(at - 0.2)));
                    }
                }
                el.querySelectorAll('[data-vai-at]').forEach(n => n.removeAttribute('data-vai-at'));
                el.removeAttribute('data-vai-at');
                // what one of the page's long timers showed (see the timer cap): it comes up at the same moment in the clone
                {
                    const whenEls = [...(el.hasAttribute && el.hasAttribute('data-vai-when') ? [el] : []), ...el.querySelectorAll('[data-vai-when]')];
                    for (const w of whenEls) {
                        const at = parseFloat(w.getAttribute('data-vai-when'));
                        if (!(at >= 2.5) || w.hasAttribute('data-vai-delay') || w.hasAttribute('data-vai-pitch-at') || w.closest('[data-vai-delay], [data-vai-pitch-at]')) continue;
                        if (w.parentElement && w.parentElement.closest('[data-vai-when]')) continue;       // the outermost one carries it
                        const wr = w.getBoundingClientRect(), wcs = getComputedStyle(w);
                        if (wcs.display === 'none' || wcs.visibility === 'hidden' || wr.width < 2 || wr.height < 2) continue;
                        if (wr.width * wr.height >= 0.45 * innerWidth * innerHeight || wcs.position === 'fixed') continue;     // a loading screen going away, a popup (handled apart)
                        const wt = (w.innerText || '').trim();
                        if (!wt && !w.querySelector('img, svg, button, a[href], input, video')) continue;
                        w.setAttribute('data-vai-delay', String(Math.max(1, Math.round(at - 0.5))));
                    }
                    el.querySelectorAll('[data-vai-when]').forEach(n => n.removeAttribute('data-vai-when'));
                    el.removeAttribute('data-vai-when');
                }

                // custom video players (<youtube-video>, <lite-youtube>, any web component with a frame or a <video> in its shadow root): their
                // content is invisible to outerHTML, so the address and the size are written on the host itself, and the "click to play" layer
                // the page puts over a video (it only works with the page's own script) is marked so the clone's player replaces it
                const VHOST = /^(youtube-video|vimeo-video|lite-youtube|lite-vimeo|wistia-player|wistia-video|mux-player|mux-video|hls-video|dash-video|dailymotion-video|jwplayer-video|videojs-video|vidstack-player|media-player|media-controller|panda-player|bunny-player)$/i;
                const vhostOf = e => {
                    if (!e.tagName || !e.tagName.includes('-')) return null;
                    let embed = '', vsrc = '';
                    const sr = e.shadowRoot;
                    if (sr) {
                        const f = sr.querySelector('iframe[src]'); if (f) embed = f.src || '';
                        const v = sr.querySelector('video'); const s = v ? (v.currentSrc || v.src || '') : '';
                        if (s && !s.startsWith('blob:')) vsrc = s;
                    }
                    if (!VHOST.test(e.tagName) && !embed && !vsrc) return null;
                    const w = e.offsetWidth || e.getBoundingClientRect().width, h = e.offsetHeight || e.getBoundingClientRect().height;
                    if (w < 20 || h < 20) return null;
                    return { embed, vsrc, w: Math.round(w), h: Math.round(h) };
                };
                const markCovers = (host) => {
                    const hr = host.getBoundingClientRect();
                    if (hr.width < 100 || hr.height < 60) return;
                    let p = host.parentElement;
                    for (let up = 0; up < 3 && p; up++, p = p.parentElement) {
                        for (const o of p.querySelectorAll(':scope > *, :scope > * > *')) {
                            if (o === host || o.contains(host) || host.contains(o) || o.hasAttribute('data-vai-cover')) continue;
                            const cs = getComputedStyle(o);
                            if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
                            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
                            const r = o.getBoundingClientRect();
                            const ix = Math.max(0, Math.min(r.right, hr.right) - Math.max(r.left, hr.left)), iy = Math.max(0, Math.min(r.bottom, hr.bottom) - Math.max(r.top, hr.top));
                            // the layer lies over the video: it covers (nearly) all of it, or sits inside it and takes most of its box (a player scaled up
                            // to crop its edges is bigger than the box it sits in, so its layer is a little smaller than it)
                            const cov = ix * iy, hostA = hr.width * hr.height, layerA = Math.max(1, r.width * r.height);
                            if (!(cov >= 0.8 * hostA || (cov >= 0.8 * layerA && cov >= 0.5 * hostA))) continue;
                            const txt = (o.innerText || '').trim();
                            if (txt.length > 3 && !/assist|play|ouvir|clique|toque|reproduz|iniciar|come[cç]ar/i.test(txt)) continue;      // a caption or an offer over the video stays
                            if (cs.cursor !== 'pointer' && !o.querySelector('svg, [class*="play" i]') && !o.getAttribute('onclick')) continue;
                            o.setAttribute('data-vai-cover', '1');
                        }
                    }
                };
                for (const hv of [el, ...el.querySelectorAll('*')]) {
                    const info = vhostOf(hv);
                    if (!info) continue;
                    hv.setAttribute('data-vai-vhost', '1');
                    hv.setAttribute('data-vai-box', info.w + ',' + info.h);
                    if (info.embed) hv.setAttribute('data-vai-embed', info.embed);
                    if (info.vsrc) hv.setAttribute('data-vai-vsrc', info.vsrc);
                    try { if (hv.checkVisibility && !hv.checkVisibility({ opacityProperty: true, visibilityProperty: true })) hv.setAttribute('data-vai-hidden', '1'); } catch (e) {}
                    markCovers(hv);
                }
                // the box each video occupies, so the clone's own player takes its place at the same size
                for (const vm of [el, ...el.querySelectorAll('video, iframe, [data-video-player][data-video-id]')]) {
                    const thumbPlayer = vm.hasAttribute && vm.hasAttribute('data-video-player') && vm.hasAttribute('data-video-id');
                    if (vm.tagName !== 'VIDEO' && vm.tagName !== 'IFRAME' && !thumbPlayer) continue;
                    const vr = vm.getBoundingClientRect();
                    try { if (vm.checkVisibility && !vm.checkVisibility({ opacityProperty: true, visibilityProperty: true })) vm.setAttribute('data-vai-hidden', '1'); } catch (e) {}
                    const vw = vm.tagName === 'VIDEO' && vm.videoWidth > 0 ? vm.videoWidth : 0, vh = vw ? vm.videoHeight : 0;
                    if (vw && vh && vr.width > 20) vm.setAttribute('data-vai-box', Math.round(vr.width) + ',' + Math.round(vr.width * vh / vw));
                    else if (vr.width > 20 && vr.height > 20) vm.setAttribute('data-vai-box', Math.round(vr.width) + ',' + Math.round(vr.height));
                    // the "click to play" layer laid over a real video or a video frame (not a decorative background clip)
                    if ((vm.tagName === 'VIDEO' && !(vm.loop && vm.muted && vm.autoplay && !vm.controls)) || (vm.tagName === 'IFRAME' && /youtube|vimeo|wistia|panda|vturb|converteai|vidalytics|mediadelivery|videodelivery|cloudflarestream|player/i.test(vm.getAttribute('src') || ''))) {
                        try { markCovers(vm); } catch (e) {}
                    }
                    if (vm.tagName === 'VIDEO') {
                        if (vm.autoplay) vm.setAttribute('autoplay', '');
                        if (vm.loop) vm.setAttribute('loop', '');
                        if (vm.muted) vm.setAttribute('muted', '');
                        if (vm.controls) vm.setAttribute('controls', '');
                    }
                }

                let domHtml = '';
                try {
                    if (el.hasAttribute('data-vai-closed')) return null;
                    window.__vaiFreezeCanvases(el);
                    window.__vaiSanitize(el);
                    if (el.hasAttribute('data-vai-drop')) return null;
                    el.removeAttribute('data-vai-idx');
                    // icons drawn with <use href="sprite.svg#icon"> only work from a file of the SAME origin: the symbols they
                    // use travel inside the block instead (see SPRITE_PREP_JS)
                    const spUsed = new Set();
                    el.querySelectorAll('use').forEach(u => { const h = u.getAttribute('href') || u.getAttribute('xlink:href') || ''; if (h.startsWith('#vai-sp-')) spUsed.add(h.slice(1)); });
                    if (spUsed.size) {
                        const syms = [...spUsed].map(k => (window.__vaiSprites || {})[k]).filter(Boolean).join('');
                        if (syms) el.insertAdjacentHTML('beforeend', '<svg aria-hidden="true" focusable="false" data-vai-sprite="1" style="position:absolute;width:0;height:0;overflow:hidden">' + syms + '</svg>');
                    }
                    domHtml = el.outerHTML;
                } catch (e) {
                    domHtml = '';
                }
                return { tag, className, rect: { height: rect.height, width: rect.width }, images, links, domHtml, embedded };
            };
        }
    """

    async def _snapshot_shell(self, page: Page) -> Optional[dict]:
        """html/body/wrapper attributes exactly as they are right after load,
        before we click anything — interactions can leave modal-state classes
        (menu-open, overflow-hidden...) on <body> that must not leak into the
        clone."""
        try:
            await page.evaluate("(src) => { window.__vaiScrollLockSource = src }", self._SCROLL_LOCK_RE)
            await page.evaluate(self._CAPTURE_SETUP_JS)
            plan = await page.evaluate("() => window.__vaiPlanCapture()")
            return plan["shell"]
        except Exception as e:
            logger.warning(f"Shell snapshot failed (non-fatal): {e}")
            return None

    async def _capture_page(self, page: Page, shell_snapshot: Optional[dict] = None, video: Optional[dict] = None, on_progress=None) -> dict:
        """
        Captures the page the way the browser actually built it: the wrapper
        chain around the content (<html>/<body> attributes, #__next, <main>…)
        plus EVERY child of the content root as one block, each as its real
        outerHTML with its real classes and inline styles untouched. The
        responsive behaviour comes from the captured stylesheet's own @media
        rules, applied to that same markup — the clone re-lays itself out at
        each width exactly like the original, instead of replaying a single
        desktop snapshot.

        Captures EACH block right after scrolling through it (not the whole
        page at once, back at the top): scroll-reveal / IntersectionObserver
        libraries (AOS, ScrollReveal, framer-motion, hand-rolled) only mark an
        element "revealed" while it's in view, and many un-reveal it again on
        the way out.
        """
        await page.evaluate("(src) => { window.__vaiScrollLockSource = src }", self._SCROLL_LOCK_RE)
        await page.evaluate(self._CAPTURE_SETUP_JS)
        try:
            inlined = await asyncio.wait_for(page.evaluate(SPRITE_PREP_JS), 25)
            if inlined:
                logger.info(f"[scrape] {inlined} sprite icon(s) brought inside the page")
        except Exception as e:
            logger.info(f"[scrape] sprite icons skipped: {e!r}")
        await page.evaluate("(v) => { window.__vaiPlayerVideo = v }", video if video and video.get("url") else None)
        shots = await shoot_players(page) if video and video.get("url") else []
        video_shots = await shoot_videos(page)
        await page.evaluate("(s) => { window.__vaiShots = s }", shots)
        plan = await page.evaluate("() => window.__vaiPlanCapture()")
        count = plan["count"]
        shell = plan["shell"]
        # Prefer the pristine pre-interaction html/body attributes: clicking
        # through accordions/lightboxes can leave modal-state classes behind.
        if shell_snapshot:
            shell["html"] = shell_snapshot.get("html", shell["html"])
            shell["body"] = shell_snapshot.get("body", shell["body"])
            if len(shell_snapshot.get("wrappers", [])) == len(shell["wrappers"]):
                shell["wrappers"] = shell_snapshot["wrappers"]

        results = []
        players_filled = 0
        vh = self.VIEWPORT["height"]
        for i in range(min(count, self.MAX_BLOCKS)):
            if on_progress and i % 2 == 0:
                await on_progress(0.6 + 0.4 * i / max(count, 1), f"📐 Capturando seção {i + 1} de {count}...")
            try:
                box = await page.evaluate("(idx) => window.__vaiBlockBox(idx)", i)
                if box:
                    y = max(0, int(box["top"]) - 100)
                    end = int(box["top"] + box["height"])
                    steps = 0
                    while y < end and steps < 40:
                        await page.evaluate(f"window.scrollTo(0, {y})")
                        await page.wait_for_timeout(110)
                        y += int(vh * 0.8)
                        steps += 1
                    await page.evaluate(f"window.scrollTo(0, {max(0, int(box['top']))})")
                await page.wait_for_timeout(250)
                data = await page.evaluate("(idx) => window.__vaiCaptureOne(idx)", i)
            except Exception as e:
                logger.warning(f"Failed to capture block {i}: {e}")
                continue
            if not data or not (data.get("domHtml") or "").strip():
                continue
            players_filled += data.get("embedded", 0) or 0
            results.append({
                "name": f"block_{i+1}_{data['tag'].lower()}",
                "class_hint": data["className"],
                "images": data.get("images", []),
                "links": data.get("links", []),
                "dom_html": data.get("domHtml", ""),
            })

        return {"shell": shell, "sections": results, "players_filled": players_filled, "host_shots": shots, "video_shots": video_shots, "blocks_total": count}

    async def discover_internal_links(self, page: Page, base_url: str) -> List[str]:
        """
        Every same-site, page-like link found ANYWHERE on the page (not
        just inside a captured section — nav/footer links matter most here
        and are usually outside the section boundaries used for content
        capture). Deliberately does NOT filter by "looks like a funnel
        step" the way the old single-purpose funnel crawler did — this is
        a general site crawler now, following whatever the site actually
        links to. External domains, mailto:/tel:/javascript:, and
        same-page #anchors are excluded at the source (no point queuing
        something that's never going to be same-site anyway).
        """
        raw_links = await page.evaluate("""
            (base) => {
                const baseUrl = new URL(base);
                const out = [];
                for (const a of document.querySelectorAll('a[href]')) {
                    const raw = a.getAttribute('href') || '';
                    if (!raw || raw.startsWith('#')) continue;
                    let href;
                    try { href = new URL(raw, base); } catch { continue; }
                    if (href.protocol.startsWith('javascript') || href.protocol === 'mailto:' || href.protocol === 'tel:') continue;
                    out.push(href.href);
                }
                return out;
            }
        """, base_url)

        seen = set()
        result = []
        for link in raw_links:
            if not is_same_site(link, base_url) or not looks_like_page(link):
                continue
            norm = normalize_url(link)
            if norm in seen:
                continue
            seen.add(norm)
            result.append(link)
        return result

    async def _static_capture(self, page: Page, url: str, capture_thumbnail: bool) -> dict:
        """The last resort (scripts off): the page exactly as the server sent
        it, as one block, with its stylesheet. No interactivity - but a page
        whose scripts never let it settle still ends up cloned."""
        html = await page.content()
        base = page.url or url
        m = re.search(r"<body([^>]*)>(.*)</body>", html, re.S | re.I)
        body_attrs, body = (m.group(1), m.group(2)) if m else ("", html)
        body = re.sub(r"<script\b.*?</script>|<noscript\b.*?</noscript>", "", body, flags=re.S | re.I)

        def absolutize(match):
            attr, quote, value = match.group(1), match.group(2), match.group(3)
            if re.match(r"(https?:|data:|#|mailto:|tel:|javascript:|//)", value.strip(), re.I):
                if value.strip().startswith("//"):
                    value = "https:" + value.strip()
                return f"{attr}={quote}{value}{quote}"
            return f"{attr}={quote}{urljoin(base, value.strip())}{quote}"

        body = re.sub(r"\b(src|href|poster|data-src)=([\"'])([^\"']*)\2", absolutize, body, flags=re.I)
        images = [{"src": u, "alt": ""} for u in dict.fromkeys(re.findall(r'<img[^>]+src="(https?://[^"]+)"', body))][:60]
        links = [{"href": h, "text": ""} for h in dict.fromkeys(re.findall(r'<a[^>]+href="(https?://[^"]+)"', body))][:40]
        try:
            page_css = await self.capture_page_css(page, [])
        except Exception:
            page_css = ""
        thumb = None
        if capture_thumbnail:
            try:
                thumb = base64.b64encode(await page.screenshot(timeout=15000)).decode()
            except Exception:
                thumb = None
        title = await page.title()
        return {
            "full_screenshot_b64": thumb,
            "sections": [{"name": "block_1_body", "class_hint": "static", "images": images, "links": links, "dom_html": f'<div{body_attrs}>{body}</div>'}],
            "font_links": [],
            "page_css": page_css,
            "shell": {"html": {"lang": "pt-BR"}, "body": {}, "wrappers": [], "viewport": "width=device-width, initial-scale=1", "title": title, "fontLinks": []},
            "video": None,
            "video_embedded": False,
            "internal_links": [],
        }

    async def _mobile_signature(self, url: str) -> Optional[dict]:
        """Opens the page the way a phone does and reads its signature."""
        ctx = await self.browser.new_context(
            viewport=self.MOBILE_VIEWPORT, user_agent=self.MOBILE_USER_AGENT, is_mobile=True, has_touch=True,
            locale=self.LOCALE, timezone_id=self.TIMEZONE, java_script_enabled=self.js,
        )
        try:
            # only the page's structure matters here: no pictures, videos or fonts (they cost most of the load)
            await ctx.route("**/*", lambda route: route.abort() if route.request.resource_type in ("image", "media", "font") else route.continue_())
            pg = await ctx.new_page()
            await pg.goto(url, wait_until="load", timeout=40000)
            try:
                await pg.wait_for_load_state("networkidle", timeout=4000)
            except Exception:
                pass
            await self._scroll_page(pg)
            return await pg.evaluate(SIGNATURE_JS)
        except Exception as e:
            logger.info(f"[mobile] probe skipped: {e!r}")
            return None
        finally:
            await ctx.close()

    async def _funnel_candidate(self, page: Page) -> bool:
        """Funnels are short screens; a long page is a landing page (clicking
        around it would only leave the site). Only a cheap size test here —
        this page runs with capped timers, which can keep a funnel app from
        rendering its controls. The walker, on a page with real timers,
        makes the actual call."""
        try:
            return await page.evaluate("(vh) => document.documentElement.scrollHeight <= vh * 3.2", self.VIEWPORT["height"])
        except Exception:
            return False

    async def scrape_url(self, url: str, capture_thumbnail: bool = True, on_progress=None, try_funnel: bool = False, funnel_prefix: str = "") -> dict:
        """One capture; if the page's own app shows its error screen ("something went wrong") under the shortened
        timers, once more with the page's natural timing — a clone of an error screen is worthless."""
        try:
            return await self._scrape_url_once(url, capture_thumbnail, on_progress, try_funnel, funnel_prefix)
        except _AppErrorScreen:
            logger.info(f"[scrape] {url} showed its error screen under shortened timers: capturing again with natural timers")
            self.cap_timers = False
            try:
                return await self._scrape_url_once(url, capture_thumbnail, on_progress, try_funnel, funnel_prefix)
            finally:
                self.cap_timers = True

    async def _scrape_url_once(self, url: str, capture_thumbnail: bool = True, on_progress=None, try_funnel: bool = False, funnel_prefix: str = "") -> dict:
        """Loads a page and returns everything needed to clone it: real
        per-section DOM+images+links, the page's own real stylesheet, its
        Google Fonts links, and every same-site link found on it (for the
        orchestrator's crawl queue)."""
        logger.info(f"Scraping URL: {url}")
        async def progress(frac: float, step: str):
            if on_progress:
                try:
                    await on_progress(frac, step)
                except Exception:
                    pass

        page = await self.get_page()

        sniffed_stylesheets: List[Response] = []
        # VSL/embedded-video players (VTurb/Panda-style) almost always stream
        # through a MediaSource/blob URL, so <video>.src is just "blob:..."
        # — useless as a link. The real .mp4/.m3u8 the browser is actually
        # fetching only shows up on the network.
        sniffed_videos: List[dict] = []

        def _on_response(response):
            try:
                url_l = response.url.lower().split("?")[0]
                ctype = (response.headers or {}).get("content-type", "").lower()
                if url_l.endswith(".css") or "text/css" in ctype:
                    sniffed_stylesheets.append(response)
                elif url_l.endswith(".m3u8") or "mpegurl" in ctype:
                    sniffed_videos.append({"url": response.url, "kind": "hls"})
                elif url_l.endswith(".mp4") or ctype.startswith("video/"):
                    sniffed_videos.append({"url": response.url, "kind": "mp4"})
                elif VTURB_PLAYER_RE.search(response.url):
                    sniffed_videos.append({"url": response.url, "kind": "vturb"})
            except Exception:
                pass

        page.on("response", _on_response)

        try:
            await self._goto_resilient(page, url)
            try:
                await page.evaluate(MODAL_WATCH_JS)
            except Exception:
                pass
            # A page that sends its visitor elsewhere after a few seconds (a timed redirect) must not carry
            # the capture away with it: capturing takes longer than the timer. Early redirects (the first
            # seconds) are part of how the page opens and are followed; later ones are refused here, and found
            # again as a "time" rule by the behaviour probe, which clones the destination as its own page.
            t_open = time.monotonic()
            late_navs: List[str] = []

            def _strip(u: str) -> str:
                return u.split("#")[0].rstrip("/")

            async def _no_late_nav(route, request):
                try:
                    if (request.resource_type == "document" and request.frame == page.main_frame
                            and time.monotonic() - t_open > 3.5 and _strip(request.url) != _strip(page.url)):
                        late_navs.append(request.url)
                        await route.abort()
                        return
                except Exception:
                    pass
                try:
                    await route.continue_()
                except Exception:
                    pass
            try:
                await page.route("**/*", _no_late_nav)
            except Exception:
                pass
            await page.wait_for_timeout(1500)
            await progress(0.15, "👀 Lendo a estrutura da página...")
            if not self.js:
                return await self._static_capture(page, url, capture_thumbnail)

            await self._scroll_page(page)
            if self.cap_timers:
                try:
                    if await page.evaluate(APP_ERROR_JS):
                        raise _AppErrorScreen()
                except _AppErrorScreen:
                    raise
                except Exception:
                    pass
            sig_here = None
            if not self.mobile:
                try:
                    sig_here = await page.evaluate(SIGNATURE_JS)
                except Exception:
                    sig_here = None
            try:
                found = await page.evaluate(SCROLL_PROBE_JS)
                if found:
                    logger.info(f"[scrape] {found} element(s) change as the page is scrolled")
            except Exception as e:
                logger.info(f"[scrape] scroll probe skipped: {e!r}")

            # A short page with something to press may be one step of a funnel
            # (quiz / VSL / lead capture living in a single URL). Walk it; if
            # it turns out to be a single page, carry on with the normal capture.
            if try_funnel and await self._funnel_candidate(page):
                from services.funnel_walker import FunnelWalker
                await progress(0.1, "🧭 Parece um funil de várias etapas, percorrendo as etapas...")
                funnel = None
                try:
                    funnel = await FunnelWalker(self, url, on_progress=progress, slug_prefix=funnel_prefix).run()
                except Exception as e:
                    # exploring the funnel is a bonus: whatever goes wrong in it,
                    # the page still gets cloned the plain way below
                    logger.exception(f"Funnel walk failed, falling back to the plain capture: {e}")
                if funnel:
                    logger.info(f"Funnel detected: {len(funnel['steps'])} steps, exit={funnel.get('exit_url')}")
                    return {"funnel": funnel, "full_screenshot_b64": funnel.get("full_screenshot_b64")}
                await progress(0.15, "👀 Lendo a estrutura da página...")

            shell_snapshot = await self._snapshot_shell(page)
            await progress(0.3, "🧩 Analisando abas, acordeões e botões...")
            toggles = await self._harvest_toggles(url)
            await self._apply_toggles(page, toggles)
            await self._reveal_hidden(page)
            media_reveals = await self._probe_media_time(page) if self.js else []

            # Real content first — blocks, CSS, video. A heavy/very tall
            # real-world page (huge product pages, lots of media) can make
            # the vanity thumbnail below time out; that must never cost us
            # the actual capture, which is the whole point of the clone.
            video = await self._detect_video(page, sniffed_videos)
            await progress(0.6, "📐 Capturando seções, estilos e responsivo...")
            # what the page's own scripts do at other screen sizes (and what its menu button does) is read BEFORE the
            # capture, which rewrites the live page
            page_css = await self.capture_page_css(page, sniffed_stylesheets)
            probe_out = {"css": "", "interactions": {}, "used": []}
            if self.js:
                try:
                    await progress(0.62, "📱 Testando a página em outros tamanhos de tela...")
                    probe_out = await asyncio.wait_for(
                        layout_probe.probe(self, page.url, page, self.VIEWPORT["width"], page_css, desktop=not self.mobile), 330)
                    await layout_probe.attach_interactions(page, probe_out["interactions"])
                    await page.evaluate("(u) => { window.__vaiPUsed = new Set(u.map(String)) }", probe_out["used"])
                except Exception as e:
                    logger.info(f"[probe] skipped: {e!r}")
            captured = await self._capture_page(page, shell_snapshot, video, on_progress=progress)
            sections = captured["sections"]
            shell = captured["shell"]
            font_links = await self.capture_font_links(page)
            if probe_out.get("css"):
                page_css = page_css + "\n" + probe_out["css"]
            internal_links = await self.discover_internal_links(page, url)

            # Thumbnail: viewport-only (not full_page) — dramatically
            # cheaper on a tall page, and non-fatal if it still times out.
            # Only needed once per project (the home page), not for every
            # crawled page — skip it entirely there to keep a multi-page
            # crawl from paying this cost N times.
            full_screenshot_b64 = None
            if capture_thumbnail:
                try:
                    full_screenshot_bytes = await page.screenshot(timeout=15000)
                    full_screenshot_b64 = base64.b64encode(full_screenshot_bytes).decode()
                except Exception as e:
                    logger.warning(f"Thumbnail screenshot failed (non-fatal): {e}")

            logger.info(f"Scrape complete: {len(sections)} sections found, video={bool(video)}, {len(internal_links)} internal links")

            mobile_variant = None
            if sig_here:
                sig_m = await self._mobile_signature(url)
                if sig_m:
                    mobile_variant = compare_signatures(sig_here, sig_m)
                    logger.info(f"[mobile] {url}: {mobile_variant}")

            return {
                "mobile_variant": mobile_variant,
                "full_screenshot_b64": full_screenshot_b64,
                "sections": sections,
                "font_links": font_links,
                "page_css": page_css,
                "shell": {**shell, "fontLinks": font_links[:8]},
                "video": video,
                "video_embedded": captured.get("players_filled", 0) > 0,
                "media_reveals": media_reveals,
                "host_shots": captured.get("host_shots") or [],
                "video_shots": captured.get("video_shots") or [],
                "blocks_total": captured.get("blocks_total") or 0,
                "internal_links": internal_links,
            }
        finally:
            await page.close()

    async def _detect_video(self, page: Page, sniffed_videos: Optional[List[dict]] = None) -> Optional[dict]:
        """The video of the screen plus the RULES its player had (start on click or
        on its own, may it be paused, which controls, when the offer shows)."""
        video = await self._detect_video_raw(page, sniffed_videos)
        if not video:
            return video
        cache = self.__dict__.setdefault("_vturb_cache", {})
        info = None
        # the player that loaded last belongs to the screen being read
        for s in reversed(sniffed_videos or []):
            if s.get("kind") != "vturb":
                continue
            if s["url"] not in cache:
                cache[s["url"]] = await fetch_vturb(s["url"])
            info = cache[s["url"]]
            if info:
                break
        if info:
            video["rules"] = info["cfg"]
            video["vturb"] = info["vturb"]
            if not video.get("poster") and info["vturb"].get("poster"):
                video["poster"] = info["vturb"]["poster"]
        else:
            video["rules"] = {}
        return video

    async def _detect_video_raw(self, page: Page, sniffed_videos: Optional[List[dict]] = None) -> Optional[dict]:
        """
        Real video capture, not a placeholder: checks the DOM for a plain
        <video src> or a known video-embed <iframe> (YouTube/Vimeo/Wistia/
        VTurb/Panda-style players) first. If the DOM video's src is a
        useless blob: URL (VTurb/Panda MediaSource players), falls back to
        whatever real .mp4/.m3u8 the network sniffer caught instead.
        """
        probe = await page.evaluate("""
            () => {
                const isBig = el => {
                    const r = el.getBoundingClientRect();
                    const cs = getComputedStyle(el);
                    return r.width >= 240 && r.height >= 120 && cs.display !== 'none' && cs.visibility !== 'hidden';
                };
                // Evidence that a player is actually ON this page (not just a
                // media file the app happened to preload for a later step): a
                // big visible custom element wrapping a <video> in its shadow
                // DOM (VTurb/Panda-style), a big visible *player*-named box, or
                // a big visible iframe.
                let hint = false;
                let customHost = false;
                for (const el of document.querySelectorAll('*')) {
                    if (el.tagName.includes('-') && ((el.shadowRoot && el.shadowRoot.querySelector('video')) || /player|vturb|video/i.test(el.tagName)) && isBig(el)) { hint = true; customHost = true; break; }
                }
                if (!hint) {
                    hint = [...document.querySelectorAll('[id*="player" i],[class*="player" i],[id*="vturb" i],[class*="vturb" i],[id*="smartplayer" i],iframe')].some(isBig);
                }
                // a big visible <video> whose source is a MediaSource blob (hls.js / dash.js on a bare element) is a player too
                if (!hint) {
                    hint = [...document.querySelectorAll('video')].some(v => isBig(v) && (!(v.currentSrc || v.src) || String(v.currentSrc || v.src).startsWith('blob:')));
                }

                let video = null;
                const v = document.querySelector('video');
                if (v && (v.currentSrc || v.src)) {
                    video = { type: 'native', url: v.currentSrc || v.src, poster: v.getAttribute('poster') ? v.poster : null, duration: v.duration || null };
                } else {
                    const EMBED_HOSTS = ['youtube.com', 'youtube-nocookie.com', 'vimeo.com', 'wistia.com', 'wistia.net', 'fast.wistia.net'];
                    for (const f of Array.from(document.querySelectorAll('iframe[src]'))) {
                        try {
                            const host = new URL(f.src).hostname;
                            if (EMBED_HOSTS.some(h => host.includes(h))) { video = { type: 'iframe', url: f.src, poster: null, duration: null }; break; }
                        } catch {}
                    }
                }
                return { video, hint, customHost };
            }
        """)
        dom_video = probe["video"]
        player_hint = probe["hint"]
        # A custom-element player (VTurb/Panda-style) often keeps a short
        # preview clip (1.mp4) in the page for its cover animation — the real
        # video is the HLS stream it fetches once played.
        if probe.get("customHost") and sniffed_videos:
            hls = next((v for v in reversed(sniffed_videos) if v["kind"] == "hls"), None)
            if hls:
                # the short looping clip these players show before the click
                preview = next((v["url"] for v in reversed(sniffed_videos) if v["kind"] == "mp4"), None)
                if not preview and dom_video and dom_video.get("type") == "native" and not (dom_video.get("url") or "").startswith("blob:"):
                    preview = dom_video.get("url")
                return {"type": "native", "url": hls["url"], "poster": (dom_video or {}).get("poster"), "duration": None, "hls": True, "preview": preview}

        is_unusable = not dom_video or (dom_video.get("type") == "native" and (dom_video.get("url") or "").startswith("blob:"))
        if is_unusable and sniffed_videos and player_hint:
            hls = next((v for v in reversed(sniffed_videos) if v["kind"] == "hls"), None)
            mp4 = next((v for v in reversed(sniffed_videos) if v["kind"] == "mp4"), None)
            picked = hls or mp4
            if picked:
                poster = (dom_video or {}).get("poster")
                duration = (dom_video or {}).get("duration")
                return {"type": "native", "url": picked["url"], "poster": poster, "duration": duration, "hls": picked["kind"] == "hls"}

        return dom_video if not is_unusable else None
