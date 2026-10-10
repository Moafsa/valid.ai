"""
Finds the hidden RULES of a page: what happens when the visitor tries to leave.

Sales pages and VSLs are full of behaviour that has nothing to do with how they
look: move the mouse out through the top of the window and you are sent to a
"wait, here is a gift" page; press the back button (the page pushed fake history
entries to trap it) and the same thing happens; stay for N seconds and you are
redirected. None of that is in the HTML, so a clone made from the markup alone
behaves like a different (and worse selling) page.

The probe looks at the page the way an engineer reading its scripts would, but
by experiment:

  1. DETECT: load the page with instrumented browser APIs (event listeners,
     history.pushState, timers, storage) and see which of the known traps it
     installs.
  2. TRIGGER: for every trap found, fire it in a fresh page and watch what the
     page does: a navigation inside the site (a page to clone as well), a
     navigation / window.open to another site (the exit), a native dialog.
  3. RETURN rules the clone's runtime can replay, plus the same-site pages
     they lead to (the caller clones those too and points the rule at them).

Nothing is ever sent to the original owner: non-GET requests are answered
locally and navigation to other sites is aborted and only recorded.
"""
import asyncio
import json
import re
import time
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode, urljoin

from loguru import logger

from services.funnel_walker import TRACKER_HINTS, OK_JSON, _host

PROBE_JS = r"""
(() => {
  if (window.__probe) return;
  const log = (window.__probe = { listeners: [], pushes: 0, timers: [], intervals: [], opens: [], storage: [], dialogs: [] });
  const origAdd = EventTarget.prototype.addEventListener;
  const watched = /^(mouseout|mouseleave|beforeunload|unload|pagehide|visibilitychange|popstate|blur|contextmenu|copy|keydown)$/;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (watched.test(type)) {
      const who = this === window ? 'window' : this === document ? 'document'
        : this === document.documentElement ? 'html' : this === document.body ? 'body' : 'element';
      log.listeners.push([type, who]);
    }
    return origAdd.call(this, type, fn, opts);
  };
  for (const m of ['pushState', 'replaceState']) {
    const o = history[m];
    history[m] = function () { if (m === 'pushState') log.pushes++; return o.apply(this, arguments); };
  }
  const st = window.setTimeout;
  window.setTimeout = function (fn, ms, ...a) {
    if (ms >= 2500) {
      let src = '';
      try { src = typeof fn === 'function' ? Function.prototype.toString.call(fn).slice(0, 400) : String(fn).slice(0, 400); } catch (e) {}
      log.timers.push([ms, src]);
    }
    return st.call(this, fn, ms, ...a);
  };
  const op = window.open;
  window.open = function (u) { log.opens.push(String(u)); return null; };
  try {
    const si = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { log.storage.push(String(k)); return si.call(this, k, v); };
  } catch (e) {}
})();
"""

LIST_CTAS_JS = r"""
() => {
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 40 && r.height > 20 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
  const seen = {};
  const out = [];
  document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a, [onclick]').forEach(el => {
    if (!vis(el) || el.disabled) return;
    const tag = el.tagName.toLowerCase();
    const href = el.getAttribute('href');
    // an ordinary link already goes where it says
    if (tag === 'a' && href && !/^(#|javascript:)/i.test(href.trim())) return;
    if (el.closest('footer, nav')) return;
    const text = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!text) return;
    if (el.hasAttribute('aria-expanded') || /menu|burger|hamburger|close|fechar/i.test((el.className || '') + ' ' + (el.getAttribute('aria-label') || ''))) return;
    const key = tag + '|' + text;
    const nth = seen[key] = (seen[key] === undefined ? 0 : seen[key] + 1);
    out.push({ tag, text, nth, top: Math.round(el.getBoundingClientRect().top + scrollY) });
  });
  return out.slice(0, 30);
}
"""

CLICK_CTA_JS = r"""
([tag, text, nth]) => {
  let n = 0;
  for (const el of document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a, [onclick]')) {
    if (el.tagName.toLowerCase() !== tag) continue;
    const t = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (t !== text) continue;
    if (n++ === nth) { el.scrollIntoView({ block: 'center' }); el.click(); return true; }
  }
  return false;
}
"""


# Ways of making a page react that nothing in its code gives away: tried one by one
# in a clean page, and kept only when the page really went somewhere.
VIDEO_PAUSE_JS = r"""
async () => {
  const vids = [...document.querySelectorAll('video')];
  document.querySelectorAll('*').forEach(h => { if (h.shadowRoot) vids.push(...h.shadowRoot.querySelectorAll('video')); });
  const custom = (el, type) => { try { el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail: {} })); } catch (e) {} };
  const plain = (el, type) => { try { el.dispatchEvent(new Event(type, { bubbles: true, composed: true })); } catch (e) {} };
  const sp = window.smartplayer && window.smartplayer.instances ? window.smartplayer.instances : [];
  // play first (a pause only means something once it was playing), then pause, by every road there is
  for (const i of sp) { try { i.play && i.play(); } catch (e) {} }
  // (a video the browser cannot decode, or one fed by a stream that never starts, leaves play() waiting for ever: it is given a moment, not the whole probe)
  for (const v of vids) { try { v.muted = true; await Promise.race([v.play().catch(() => {}), new Promise(r => setTimeout(r, 1200))]); } catch (e) {} plain(v, 'play'); plain(v, 'playing'); }
  document.querySelectorAll('vturb-player, vturb-smartplayer, [class*="player" i], [id*="player" i]').forEach(el => custom(el, 'video:play'));
  await new Promise(r => setTimeout(r, 900));
  for (const i of sp) { try { i.pause && i.pause(); } catch (e) {} }
  for (const v of vids) { try { v.pause(); } catch (e) {} plain(v, 'pause'); }
  document.querySelectorAll('vturb-player, vturb-smartplayer, [class*="player" i], [id*="player" i]').forEach(el => custom(el, 'video:pause'));
  return vids.length + sp.length;
}
"""

VIDEO_END_JS = r"""
async () => {
  const vids = [...document.querySelectorAll('video')];
  document.querySelectorAll('*').forEach(h => { if (h.shadowRoot) vids.push(...h.shadowRoot.querySelectorAll('video')); });
  const sp = window.smartplayer && window.smartplayer.instances ? window.smartplayer.instances : [];
  for (const v of vids) {
    try { if (isFinite(v.duration) && v.duration > 1) v.currentTime = v.duration - 0.2; } catch (e) {}
    try { v.dispatchEvent(new Event('ended', { bubbles: true, composed: true })); } catch (e) {}
  }
  document.querySelectorAll('vturb-player, vturb-smartplayer, [class*="player" i], [id*="player" i]').forEach(el => {
    try { el.dispatchEvent(new CustomEvent('video:ended', { bubbles: true, composed: true, detail: {} })); } catch (e) {}
  });
  for (const i of sp) { try { i.emit && i.emit('ended'); } catch (e) {} }
  return vids.length + sp.length;
}
"""

HIDDEN_JS = r"""
() => {
  try { Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); } catch (e) {}
  try { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); } catch (e) {}
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('pagehide'));
}
"""

SCROLL_UP_JS = r"""
async () => {
  window.scrollTo(0, Math.min(1400, document.documentElement.scrollHeight));
  await new Promise(r => setTimeout(r, 400));
  const steps = 6;
  for (let i = 1; i <= steps; i++) { window.scrollTo(0, Math.max(0, 1400 - i * 250)); window.dispatchEvent(new Event('scroll')); await new Promise(r => setTimeout(r, 25)); }
  window.scrollTo(0, 0);
}
"""

HAS_VIDEO_JS = r"""
() => !!(document.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"], vturb-smartplayer, vturb-player, [id^="vid_"], [id^="vid-"]')
  || [...document.querySelectorAll('*')].some(n => n.shadowRoot && n.shadowRoot.querySelector('video')))
"""

EXTRA_TRIGGERS = {
    "control": "() => 0",     # nothing is done: whatever the page does on its own meanwhile is not a rule
    "video-pause": VIDEO_PAUSE_JS,
    "video-end": VIDEO_END_JS,
    "hidden": HIDDEN_JS,
    "scroll-up": SCROLL_UP_JS,
}

# A timer whose callback goes somewhere else.
_REDIRECTISH = re.compile(r"location|\.href|assign\(|replace\(|window\.open|navigate", re.I)
_TRACKING_PARAMS = {"fbp", "fbc", "fbclid", "gclid", "_ga", "_gl", "msclkid", "ttclid", "src", "sck", "xcod"}


def _clean(url: str, keep_query: bool) -> str:
    parts = urlsplit(url)
    if not keep_query:
        return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    q = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k.lower() not in _TRACKING_PARAMS and not k.lower().startswith("utm_")]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(q), ""))


class BehaviorProbe:
    def __init__(self, scraper, url: str):
        self.scraper = scraper
        self.url = url
        self.origin_host = _host(url)
        self.base_path = urlsplit(url).path
        # every experiment opens its own clean page; they are independent, so they run side by
        # side, but never more than this many at once (Chromium is heavy)
        self._slots = asyncio.Semaphore(4)

    async def _ctx(self, mobile: bool):
        context = await self.scraper.browser.new_context(
            viewport={"width": 390, "height": 844} if mobile else self.scraper.VIEWPORT,
            user_agent=self.scraper.USER_AGENT,
            is_mobile=mobile, has_touch=mobile,
            locale="pt-BR", timezone_id="America/Sao_Paulo",
        )
        await context.add_init_script(PROBE_JS)
        outs: list[str] = []

        async def route(r, req):
            try:
                url, rt, method = req.url, req.resource_type, req.method.upper()
                is_main = rt == "document" and req.frame is not None and req.frame.parent_frame is None
                if is_main and _host(url) != self.origin_host:
                    outs.append(url)
                    await r.abort()
                    return
                if method not in ("GET", "HEAD", "OPTIONS") and rt in ("xhr", "fetch", "ping", "other", "document"):
                    await r.fulfill(status=200, content_type="application/json", body=OK_JSON)
                    return
                if rt in ("image", "xhr", "fetch", "ping") and any(h in url.lower() for h in TRACKER_HINTS):
                    await r.fulfill(status=204 if rt in ("image", "ping") else 200, content_type="application/json", body="{}" if rt in ("xhr", "fetch") else "")
                    return
                await r.continue_()
            except Exception:
                try:
                    await r.continue_()
                except Exception:
                    pass

        await context.route("**/*", route)
        return context, outs

    async def _fresh(self, mobile: bool):
        await self._slots.acquire()
        try:
            context, outs = await self._ctx(mobile)
        except BaseException:
            self._slots.release()
            raise
        close, state = context.close, {"released": False}

        async def _close(*a, **k):
            try:
                return await close(*a, **k)
            finally:
                if not state["released"]:
                    state["released"] = True
                    self._slots.release()
        context.close = _close
        page = await context.new_page()
        navs: list[str] = []
        dialogs: list[str] = []
        page.on("framenavigated", lambda f: navs.append(f.url) if f == page.main_frame else None)

        async def on_dialog(d):
            dialogs.append(f"{d.type}: {d.message[:80]}")
            try:
                await d.dismiss()
            except Exception:
                pass
        page.on("dialog", lambda d: asyncio.ensure_future(on_dialog(d)))
        popups: list[str] = []
        context.on("page", lambda p: popups.append(p.url) if p != page else None)
        try:
            await page.goto(self.url, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_timeout(3500)
        except Exception as e:
            logger.info(f"[probe] load failed: {e!r}")
        return context, page, navs, outs, dialogs, popups

    @staticmethod
    def _outcome(navs, outs, dialogs, popups, start_url, base_path):
        """What the page did, as ('page', url) | ('external', url) | None."""
        same = [u for u in navs if urlsplit(u).path.rstrip("/") != urlsplit(start_url).path.rstrip("/") and not u.startswith("chrome-error")]
        if same:
            return ("page", same[-1])
        if outs:
            return ("external", outs[-1])
        ext = [u for u in popups if u and u != "about:blank"]
        if ext:
            return ("external", ext[-1])
        return None

    async def run(self) -> dict:
        rules: list[dict] = []
        pages: list[str] = []
        notes: list[str] = []

        # 1. DETECT, on desktop and on a phone (different traps get installed). The two are
        # independent pages: they run side by side.
        found: dict[str, dict] = {}
        empty = {"listeners": [], "pushes": 0, "timers": [], "opens": [], "storage": []}

        async def detect(mobile: bool):
            context, page, navs, outs, dialogs, popups = await self._fresh(mobile)
            has_video = False
            try:
                try:
                    await page.mouse.move(200, 300)
                    await page.evaluate("window.scrollTo(0, 400)")
                    await page.wait_for_timeout(2500)
                except Exception:
                    pass
                probe = await page.evaluate("window.__probe || " + json.dumps(empty))
                if not mobile:
                    try:
                        has_video = bool(await page.evaluate(HAS_VIDEO_JS))
                    except Exception:
                        pass
            except Exception:
                probe = empty
            finally:
                await context.close()
            return mobile, probe, has_video

        detected = await asyncio.gather(detect(False), detect(True), return_exceptions=True)
        has_video = False
        for res in detected:
            if isinstance(res, Exception):
                continue
            mobile, probe, hv = res
            has_video = has_video or hv
            who = {(t, w) for t, w in probe["listeners"]}
            if any(t in ("mouseleave", "mouseout") and w in ("document", "window", "html", "body") for t, w in who) and not mobile:
                found["exit-intent"] = {"mobile": False}
            if probe["pushes"] >= 1 and ("popstate", "window") in who:
                found["back"] = {"mobile": mobile}
            for ms, src in probe["timers"]:
                if _REDIRECTISH.search(src or ""):
                    found.setdefault("time", {"mobile": mobile, "after": ms})

        logger.info(f"[probe] traps installed by {self.url}: {sorted(found)}")

        # 2. TRIGGER each, in a clean page (side by side)
        async def trigger_one(trigger: str, meta: dict):
            context, page, navs, outs, dialogs, popups = await self._fresh(bool(meta.get("mobile")))
            try:
                if trigger == "exit-intent":
                    await page.mouse.move(640, 300)
                    await page.mouse.move(640, 2, steps=5)
                    await page.mouse.move(640, -8, steps=3)
                elif trigger == "back":
                    try:
                        await page.go_back(timeout=5000)
                    except Exception:
                        pass
                elif trigger == "time":
                    await page.wait_for_timeout(min(int(meta["after"]) + 2500, 48000))
                await page.wait_for_timeout(3500)
                outcome = self._outcome(navs, outs, dialogs, popups, self.url, self.base_path)
            except Exception as e:
                logger.info(f"[probe] trigger {trigger} errored: {e!r}")
                outcome = None
            finally:
                await context.close()
            return trigger, meta, outcome

        # 3. TRY the reactions the code does not announce (pause the video, finish it, switch tab,
        # scroll back up fast on a phone): each in a clean page. A rule exists only if the page went
        # somewhere, and not when it was just the page's own timer firing meanwhile. Runs at the same
        # time as the triggers above.
        timer_soon = [m["after"] for t, m in found.items() if t == "time" and m["after"] < 14000]
        extras_task = None if timer_soon else asyncio.ensure_future(self._extras(rules, pages, notes, found, has_video))
        results = await asyncio.gather(*(trigger_one(t, m) for t, m in found.items()), return_exceptions=True)
        for res in results:
            if isinstance(res, Exception):
                continue
            trigger, meta, outcome = res
            if not outcome:
                continue
            kind, dest = outcome
            rule = {"id": trigger, "trigger": trigger, "once": True}
            if trigger == "time":
                rule["after"] = round(meta["after"] / 1000)
            if kind == "page":
                rule["goto_url"] = _clean(dest, keep_query=False)
                pages.append(rule["goto_url"])
            else:
                rule["goto"] = _clean(dest, keep_query=True)
            rules.append(rule)
            label = {
                "exit-intent": "o visitante leva o mouse pra fora da janela por cima (quer fechar ou trocar de aba)",
                "back": "o visitante aperta o botão voltar",
                "time": f"passam {rule.get('after')} segundos na página",
            }[trigger]
            where = urlsplit(self.url).path or "/"
            notes.append(f"Regra de saída em {where}: quando {label}, a página manda ele para {rule.get('goto_url') or rule.get('goto')}.")
        if extras_task:
            try:
                await extras_task
            except Exception as e:
                logger.info(f"[probe] extras failed: {e!r}")
        return {"rules": rules, "pages": list(dict.fromkeys(pages)), "notes": notes}

    async def _extras(self, rules: list, pages: list, notes: list, found: dict, has_video: bool = False):
        wanted = [("hidden", False)]
        if has_video:
            wanted += [("video-pause", False), ("video-end", False)]
        wanted.append(("scroll-up", True))
        label = {
            "video-pause": "o visitante pausa o vídeo",
            "video-end": "o vídeo termina",
            "hidden": "o visitante troca de aba ou minimiza a janela",
            "scroll-up": "o visitante sobe a página rápido no celular (sinal de que vai sair)",
        }

        async def one(trigger: str, mobile: bool):
            context, page, navs, outs, dialogs, popups = await self._fresh(mobile)
            try:
                base = len(navs)
                try:
                    await page.evaluate(EXTRA_TRIGGERS[trigger])
                except Exception as e:
                    logger.info(f"[probe] extra {trigger} raised: {e!r}")
                if trigger == "video-pause":
                    # by the interface too: press the player twice (play, then pause)
                    try:
                        box = await page.evaluate("""() => { const el = document.querySelector('vturb-smartplayer, vturb-player, video, [id^="vid_"], [id^="vid-"], [class*="player" i]'); if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 40 ? [r.x + r.width / 2, r.y + r.height / 2] : null }""")
                        if box:
                            await page.mouse.click(box[0], box[1])
                            await page.wait_for_timeout(1200)
                            await page.mouse.click(box[0], box[1])
                    except Exception:
                        pass
                await page.wait_for_timeout(3500)
                outcome = self._outcome(navs[base:] if base else navs, outs, dialogs, popups, self.url, self.base_path)
            finally:
                await context.close()
            return trigger, outcome

        results = await asyncio.gather(*(one(t, m) for t, m in wanted), return_exceptions=True)
        results = [r for r in results if not isinstance(r, Exception)]
        # a page that moves on by itself (an app redirecting to its first route a few seconds after
        # loading) would also move in a run where nothing is done: that is not a reaction to anything
        # we did. The control run only matters when something seemed to react, so it is only made then.
        control = None
        if any(o for t, o in results):
            try:
                _, control = await one("control", False)
            except Exception:
                control = None
        for trigger, outcome in results:
            if trigger == "control" or not outcome:
                continue
            if control and urlsplit(control[1]).path.rstrip("/") == urlsplit(outcome[1]).path.rstrip("/"):
                continue
            kind, dest = outcome
            rule = {"id": trigger, "trigger": trigger, "once": True}
            if kind == "page":
                rule["goto_url"] = _clean(dest, keep_query=False)
                pages.append(rule["goto_url"])
            else:
                rule["goto"] = _clean(dest, keep_query=True)
            rules.append(rule)
            where = urlsplit(self.url).path or "/"
            notes.append(f"Regra escondida em {where}: quando {label[trigger]}, a página manda ele para {rule.get('goto_url') or rule.get('goto')}.")

    async def ctas(self, limit: int = 10) -> list:
        """Buttons whose destination is decided by the page's scripts (no href
        to read): click each in a clean page and see where it leads."""
        context, page, navs, outs, dialogs, popups = await self._fresh(False)
        try:
            await page.wait_for_timeout(2000)
            cands = await page.evaluate(LIST_CTAS_JS)
        except Exception:
            cands = []
        finally:
            await context.close()
        cands = [c for c in cands if re.search(r"compr|quero|garant|acess|come[cç]|continu|pr[oó]xim|avan[cç]|agendar|baixar|download|receber|aplicar|inscrev|participar|abrir|resgat|reivind|toca|clique|saber|ver |join|buy|get|start|claim|open|next|continue", c["text"], re.I)][:limit]
        results = []
        sem = asyncio.Semaphore(3)

        async def one(c):
            async with sem:
                context, page, navs, outs, dialogs, popups = await self._fresh(False)
                try:
                    await page.wait_for_timeout(1500)
                    ok = await page.evaluate(CLICK_CTA_JS, [c["tag"], c["text"], c["nth"]])
                    if not ok:
                        return
                    await page.wait_for_timeout(5500)
                    opens = []
                    try:
                        opens = await page.evaluate("(window.__probe && window.__probe.opens) || []")
                    except Exception:
                        pass
                    abs_opens = [urljoin(page.url or self.url, u) for u in opens if u]
                    ext_opens = [u for u in abs_opens if _host(u) != self.origin_host]
                    same_opens = [u for u in abs_opens if _host(u) == self.origin_host]
                    outcome = self._outcome(navs + same_opens, outs + ext_opens, dialogs, popups, self.url, self.base_path)
                    if outcome:
                        kind, dest = outcome
                        results.append({
                            "tag": c["tag"], "text": c["text"], "nth": c["nth"], "top": c["top"],
                            "kind": kind, "url": _clean(dest, keep_query=(kind == "external")),
                        })
                except Exception as e:
                    logger.info(f"[probe] cta {c['text'][:30]!r} errored: {e!r}")
                finally:
                    await context.close()

        await asyncio.gather(*(one(c) for c in cands))
        return sorted(results, key=lambda r: r["top"])

