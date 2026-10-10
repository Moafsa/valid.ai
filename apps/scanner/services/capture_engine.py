"""
The in-page half of the cloner: one JavaScript engine installed in every
document (via add_init_script) that can describe a page and serialize it
WITHOUT changing it.

Why non-destructive matters: a funnel is a single-page app whose state we
walk forward step by step. The old capture stripped scripts, rewrote
attributes and replaced nodes on the LIVE page, so after capturing step 1
the app was no longer safe to keep clicking. Everything here works on a
detached clone of each block, using the live element only to READ what a
clone can't know (resolved image URLs, computed positions, canvas pixels).
"""

SCROLL_LOCK_RE = r"^(modal-open|no-scroll|noscroll|overflow-hidden|scroll-lock|scroll-locked|is-locked|lock-scroll|menu-open|nav-open|body-fixed|has-modal|popup-open)$"

ENGINE_JS = r"""
(() => {
  if (window.__vai) return;

  // Timers of three seconds or more: when each falls due and whether it LOOKS like it carries the visitor
  // somewhere (location, navigate, router...). A screen that moves itself on does it with one of these,
  // set up when the screen arrives; the walker keeps watching until they fall due.
  try {
    const _st = window.setTimeout;
    window.__vaiLongTimers = [];
    window.setTimeout = function (fn, ms) {
      try {
        if (ms >= 2500 && ms <= 60000) {
          let src = '';
          try { src = typeof fn === 'function' ? Function.prototype.toString.call(fn).slice(0, 600) : String(fn).slice(0, 300); } catch (e) {}
          const redir = /location\s*[.=]|\.href\s*=[^=]|navigate\(|router\.(push|replace)|history\.(push|replace)State|window\.open\(/i.test(src);
          window.__vaiLongTimers.push({ due: performance.now() + ms, made: performance.now(), redir });
          if (window.__vaiLongTimers.length > 200) window.__vaiLongTimers.shift();
        }
      } catch (e) {}
      return _st.apply(this, arguments);
    };
  } catch (e) {}

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'BASE', 'TITLE', 'HEAD']);
  const LANDMARKS = new Set(['SECTION', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'ARTICLE', 'FORM']);
  const TOGGLE_SEL = 'button, [role="tab"], [role="button"]';
  const SCROLL_LOCK = new RegExp('__SCROLL_LOCK__');
  const MENU_TOGGLE = /burger|hamburger|menu-toggle|nav-toggle|mobile-menu|toggle-menu/i;
  const MENU_LABEL = /\bmenu\b/i;
  const OVERLAY_ROLES = /^(dialog|alertdialog|menu|menubar|tooltip|listbox|tablist|tab)$/;
  // Cookie-consent widgets are third-party overlays driven by their own
  // scripts; captured without them they're inert at best and can break the
  // layout at worst. They are not the site's design.
  const CONSENT_RE = /(cookiebot|cybot|onetrust|ot-sdk|cookie-?(law|notice|banner|consent|bar|policy|popup)|cookieconsent|cmplz|usercentrics|didomi|iubenda|osano|termly|trustarc|truste-|cc-window|cky-|cookieyes|gdpr-?(banner|cookie|consent))/i;

  // Entrance animations: what the ORIGINAL animates when a screen mounts (an
  // answer sliding in, a bar growing, a fade) is recorded as it happens —
  // keyframes and timing straight from the browser — and replayed by the
  // clone's runtime. Hover/focus transitions and endless loops are left out
  // (loops are plain CSS and already in the stylesheet).
  const REC = { t0: performance.now(), items: [] };
  function recordAnims(el) {
    if (!(el instanceof Element)) return;
    let anims;
    try { anims = el.getAnimations({ subtree: false }); } catch (e) { return; }
    for (const a of anims) {
      if (a.__vaiSeen) continue;
      a.__vaiSeen = true;
      const eff = a.effect;
      if (!eff || !eff.getKeyframes) continue;
      let hovered = false;
      try { hovered = el.matches(':hover, :active, :focus, :focus-within'); } catch (e) {}
      if (hovered) continue;
      const timing = eff.getTiming ? eff.getTiming() : {};
      if (timing.iterations === Infinity) continue;
      let kfs;
      try { kfs = eff.getKeyframes(); } catch (e) { continue; }
      const frames = kfs.map(k => {
        const o = {};
        for (const key in k) if (key !== 'computedOffset' && key !== 'composite') o[key] = k[key];
        delete o.width; delete o.height;   // progress bars are morphed separately
        return o;
      });
      if (!frames.some(f => Object.keys(f).some(k => k !== 'offset' && k !== 'easing'))) continue;
      REC.items.push({ el, frames, at: performance.now() - REC.t0, timing: { duration: timing.duration, delay: timing.delay || 0, easing: timing.easing, fill: timing.fill } });
    }
  }
  document.addEventListener('transitionrun', e => recordAnims(e.target), true);
  document.addEventListener('animationstart', e => recordAnims(e.target), true);

  // JS-driven motion (framer-motion, GSAP, hand-rolled rAF): invisible to the
  // Web Animations API but fully visible in computed style. For ~2.4s after a
  // screen arrives every element's opacity/transform is sampled each frame;
  // elements that moved become keyframes the clone can replay.
  const MOT = { on: false, t0: 0, recs: new Map() };
  function motionStart() {
    MOT.on = true;
    MOT.t0 = performance.now();
    MOT.recs = new Map();
    const frame = () => {
      if (!MOT.on) return;
      const t = performance.now() - MOT.t0;
      if (t > 2400 || !document.body) { MOT.on = false; return; }
      const all = document.body.getElementsByTagName('*');
      if (all.length > 2500) { MOT.on = false; return; }   // too big to sample every frame
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        const cs = getComputedStyle(el);
        const key = cs.opacity + '|' + cs.transform;
        const r = MOT.recs.get(el);
        if (!r) MOT.recs.set(el, { s: [[t, cs.opacity, cs.transform]], k: key });
        else if (r.k !== key) { r.s.push([t, cs.opacity, cs.transform]); r.k = key; }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // The "film" of a screen: every change of text, class or inline style that the
  // page makes to its own elements after the screen arrives (a loader counting
  // 10% -> 27% -> 43%, status lines that rotate, a bar that fills, check marks
  // that light up one after another). Recorded with the value each element had
  // BEFORE its first change, so the clone can start from the same picture and
  // replay the changes at the same moments.
  const TL = { on: false, t0: 0, obs: null, recs: new Map(), n: 0, arrive: undefined, epoch: 0 };
  function tlRecord(el, kind, t, oldV, newV) {
    let r = TL.recs.get(el);
    if (!r) { r = { i: {}, e: [] }; TL.recs.set(el, r); }
    if (!(kind in r.i)) r.i[kind] = oldV == null ? '' : oldV;
    if (r.e.length >= 400) return;
    r.e.push([Math.round(t), kind, newV == null ? '' : newV]);
    TL.n++;
  }
  function timelineStart() {
    if (TL.obs) { try { TL.obs.disconnect(); } catch (e) {} }
    TL.on = true; TL.t0 = performance.now(); TL.recs = new Map(); TL.n = 0; TL.arrive = undefined; TL.epoch = 0;
    if (!document.body) return;
    TL.obs = new MutationObserver(muts => {
      const t = performance.now() - TL.t0;
      if (!TL.on || t > 45000) { TL.on = false; try { TL.obs.disconnect(); } catch (e) {} return; }
      for (const m of muts) {
        // the moment the new screen's elements first appear = when the screen "arrived"
        if (TL.arrive === undefined && m.type === 'childList') {
          for (const n of m.addedNodes) if (n.nodeType === 1) { TL.arrive = t; break; }
        }
        if (TL.n > 4000) return;
        if (m.type === 'attributes') {
          const k = m.attributeName === 'class' ? 'c' : m.attributeName === 'style' ? 's' : null;
          if (k) tlRecord(m.target, k, t, m.oldValue, m.target.getAttribute(m.attributeName));
        } else if (m.type === 'characterData') {
          const el = m.target.parentElement;
          if (el && !el.children.length) {
            // `{value}%` is two text nodes: the old text of the ELEMENT is all of them, with this one as it was
            let before = '';
            el.childNodes.forEach(n => { before += n === m.target ? (m.oldValue == null ? '' : m.oldValue) : n.textContent; });
            tlRecord(el, 't', t, before, el.textContent);
          }
        } else if (m.type === 'childList') {
          const el = m.target;
          if (el.nodeType === 1 && !el.children.length && (m.addedNodes.length || m.removedNodes.length)) {
            let old = '';
            m.removedNodes.forEach(n => { if (n.nodeType === 3) old += n.textContent; });
            tlRecord(el, 't', t, old, el.textContent);
          }
        }
      }
    });
    TL.obs.observe(document.body, { attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style'], characterData: true, characterDataOldValue: true, childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', timelineStart, { once: true });
  else timelineStart();

  // the first screen: sample from the moment the page can be drawn
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', motionStart, { once: true });
  else motionStart();

  const S = { blocks: [], toggleKeys: null, keyMap: null, controls: [], controlIds: new WeakMap(), nodeList: [], base: [], countdowns: [], hists: [] };

  const absUrl = u => { try { return new URL(u, document.baseURI).href; } catch (e) { return u; } };
  const clsOf = el => String((el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '');
  const textOf = el => (el.textContent || '').trim();
  const sigOf = el => [el.tagName, el.getAttribute('role') || '', textOf(el).slice(0, 40), clsOf(el).slice(0, 80)].join('|');
  const isVisible = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  };
  const posOf = el => getComputedStyle(el).position;
  const outOfFlow = el => { const p = posOf(el); return p === 'fixed' || p === 'absolute'; };
  const isConsentWidget = el => {
    if (!CONSENT_RE.test((el.id || '') + ' ' + clsOf(el))) return false;
    const p = posOf(el);
    return p === 'fixed' || p === 'sticky' || p === 'absolute';
  };

  // url(...) in an inline style="" is relative to the ORIGINAL site; once hosted
  // on our domain it would resolve against ours and 404.
  const absStyle = styleStr => styleStr.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
    const t = u.trim();
    return /^(data:|blob:|#|https?:)/i.test(t) ? m : 'url("' + absUrl(t) + '")';
  });

  // An accordion panel closed by CSS: itself clipped to nothing, or (the very
  // common grid-rows-[0fr] pattern) zero tall with an overflow-hidden child that
  // holds the real content.
  function collapsedPanel(el) {
    const r = el.getBoundingClientRect();
    if (getComputedStyle(el).display === 'none') return (el.textContent || '').trim().length > 10;
    if (r.height >= 2) return false;
    if (el.scrollHeight > 4) return true;
    let n = 0;
    for (const d of el.querySelectorAll('*')) {
      if (++n > 40) break;
      if (d.getBoundingClientRect().height < 2 && d.scrollHeight > 4 && /hidden|clip/.test(getComputedStyle(d).overflow)) return true;
    }
    return false;
  }

  // ───────────────────────── shell + block planning ─────────────────────────
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
        if (kind === 'root') {
          // scroll-lock inline styles left by an open modal/menu
          v = v.split(';').filter(d => d.trim() && !/^\s*(overflow|position|padding-right|touch-action)/i.test(d)).join(';');
          if (!v) continue;
        }
        v = absStyle(v);
      }
      out[n] = v;
    }
    return out;
  };

  const significantKids = node => [...node.children].filter(c => {
    if (SKIP_TAGS.has(c.tagName)) return false;
    if (isConsentWidget(c)) return false;
    if (c.tagName === 'NEXT-ROUTE-ANNOUNCER' || c.id === '__next-route-announcer__') return false;
    const cs = getComputedStyle(c);
    if (cs.display === 'none') return false;
    const r = c.getBoundingClientRect();
    if (r.width * r.height <= 4 && !textOf(c) && !c.querySelector('img, video, svg, canvas, iframe, input, button')) return false;
    return true;
  });

  // Starts at <body> and keeps descending while there is a single in-flow
  // child that is merely a wrapper (#__next, <main>, .page-wrapper…). What it
  // passes through is the "shell", re-created around the blocks wherever the
  // clone renders; the children of the last wrapper are the blocks.
  // Finds the shell chain and the content blocks WITHOUT touching any state,
  // so the screen's identity can be read at any time (see signature()).
  function locate() {
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
    return { chain, blocks: [...significantKids(node), ...outerExtras] };
  }

  function plan() {
    const { chain, blocks } = locate();
    S.blocks = blocks;
    S.toggleKeys = null;
    S.keyMap = null;
    S.controls = [];
    S.controlIds = new WeakMap();
    S.nodeList = [];
    S.base = [];
    const viewport = document.querySelector('meta[name="viewport"]');
    return {
      shell: {
        html: attrsOf(document.documentElement, 'root'),
        body: attrsOf(document.body, 'root'),
        wrappers: chain.map(el => ({ tag: el.tagName.toLowerCase(), attrs: attrsOf(el, 'wrapper') })),
        viewport: viewport ? viewport.getAttribute('content') : null,
        title: document.title || null,
      },
      count: S.blocks.length,
    };
  }

  function blockBox(i) {
    const el = S.blocks[i];
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, height: r.height };
  }

  // ───────────────────────── keys used to find "the same element" ─────────────────────────
  // Document-wide signature#occurrence for every toggle-like control, so a
  // button found on a throwaway page can be found again on this one.
  function toggleKeys() {
    if (S.toggleKeys) return S.toggleKeys;
    const seen = new Map(), liveToKey = new Map(), keyToLive = new Map();
    for (const el of document.querySelectorAll(TOGGLE_SEL)) {
      const s = sigOf(el);
      const n = seen.get(s) || 0;
      seen.set(s, n + 1);
      const key = s + '#' + n;
      liveToKey.set(el, key);
      keyToLive.set(key, el);
    }
    S.toggleKeys = { liveToKey, keyToLive };
    return S.toggleKeys;
  }

  // ───────────────────────── appearance tracking ─────────────────────────
  // When did each element FIRST become visible after the step started? Tracked
  // by node identity (not by text), so a countdown whose digits change or a
  // typing effect is not mistaken for a new element. A CTA that shows up 12s
  // into a video step is exactly what this exists to catch.
  const A = { firstSeen: new Map(), seen: new Set(), digits: new Map(), firstVT: new Map() };
  function resetAppearance() { A.firstSeen = new Map(); A.seen = new Set(); A.digits = new Map(); A.firstVT = new Map(); A.fresh = true; A.byUs = false; A.arrive = performance.now(); }
  // how far a video that is playing has got: a button that shows up while it plays is waiting for
  // THAT moment of the video, not for the clock (the viewer may press play late, or never)
  function videoTime() {
    let m = 0;
    const vs = [...document.querySelectorAll('video')];
    document.querySelectorAll('*').forEach(h => { if (h.shadowRoot) vs.push(...h.shadowRoot.querySelectorAll('video')); });
    for (const v of vs) if (!v.paused && !v.ended && v.currentTime > m) m = v.currentTime;
    return m;
  }
  // press play on every video of the screen (muted, so the browser allows it)
  function playMedia() {
    let n = 0;
    const vs = [...document.querySelectorAll('video')];
    document.querySelectorAll('*').forEach(h => { if (h.shadowRoot) vs.push(...h.shadowRoot.querySelectorAll('video')); });
    // (only when the video was NOT already running on its own: an autoplay video with a timer-driven button is waiting for the clock)
    A.byUs = !vs.some(v => !v.paused && !v.ended);
    for (const v of vs) { try { v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {}); n++; } catch (e) {} }
    try { const sp = window.smartplayer && window.smartplayer.instances; if (sp) for (const i of sp) { try { i.play && i.play(); n++; } catch (e) {} } } catch (e) {}
    return n;
  }
  // A cookie banner (and its dimming layer) over the screen intercepts the clicks of the walker and
  // shows up in every recording: it is put away, as a visitor who answered it would have
  function hideConsent() {
    let n = 0;
    for (const el of document.querySelectorAll('[id], [class]')) {
      if (isConsentWidget(el) && getComputedStyle(el).display !== 'none') { el.style.setProperty('display', 'none', 'important'); n++; }
    }
    return n;
  }
  // seconds until the last timer that may be about to move this screen on falls due: the redirect-looking
  // ones, and any long timer that was set up as the screen arrived
  function pendingMove() {
    const now = performance.now(), arrive = A.arrive || 0;
    let m = 0;
    for (const t of window.__vaiLongTimers || []) {
      if (t.due <= now) continue;
      if (t.made >= arrive - 300 && t.made <= arrive + 2000 && t.due - now <= (t.redir ? 30000 : 20000)) m = Math.max(m, t.due - now);
    }
    return m / 1000;
  }
  // A screen as simple as the last twenty: short, no clock ticking on it. Only such a screen is read in a hurry.
  function looksPlain() {
    if (document.documentElement.scrollHeight > innerHeight * 1.7) return false;
    for (const el of document.body.querySelectorAll('*')) {
      if (el.children.length) continue;
      const tx = (el.textContent || '').trim();
      if (tx.length <= 8 && CLOCK_RE.test(tx)) return false;
    }
    return true;
  }
  function resetAnims() { REC.t0 = performance.now(); REC.items = []; motionStart(); timelineStart(); }
  // The walker noticed a screen that arrived BY ITSELF (no click to reset the recorders at):
  // call this with how long ago it must have arrived, so its film starts there
  function rebase(agoMs) {
    const now = performance.now(), cut = now - (agoMs || 0);
    TL.epoch = Math.max(0, cut - TL.t0);
    // entrance animations recorded since: those before the screen arrived were the previous screen's
    REC.items = REC.items.filter(it => REC.t0 + it.at >= cut).map(it => Object.assign({}, it, { at: REC.t0 + it.at - cut }));
    REC.t0 = cut;
  }
  const DIGIT_RE = /^\d{1,3}%?$/;
  const CLOCK_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
  function tick(t) {
    let n = 0;
    const vt = A.byUs ? videoTime() : 0;
    for (const el of document.body.querySelectorAll('*')) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      // numbers that change as time passes: possible countdown
      if (el.children.length === 0) {
        const tx = (el.textContent || '').trim();
        if (tx && tx.length <= 8 && (DIGIT_RE.test(tx) || CLOCK_RE.test(tx))) {
          let rec = A.digits.get(el);
          if (!rec) { rec = []; A.digits.set(el, rec); }
          if (!rec.length || rec[rec.length - 1][1] !== tx) rec.push([t, tx]);
        }
      }
      if (A.seen.has(el)) continue;
      // whatever is on screen when we START watching was there already (the first screen's clock began when the
      // page opened, which may be seconds before the first look): that is not "appearing late"
      if (isVisible(el)) { A.seen.add(el); A.firstSeen.set(el, A.fresh ? 0 : t); if (vt > 0.2) A.firstVT.set(el, vt); n++; }
    }
    A.fresh = false;
    return n;
  }
  // Countdown timers: leaves whose number drops by one about every second.
  // Grouped with their labelled siblings (min / seg) into one clock that the
  // clone re-creates, starting from the value it had when the step began.
  const UNIT_SECS = { d: 86400, h: 3600, m: 60, s: 1 };
  function unitLabel(el) {
    const cand = [el.nextElementSibling, el.previousElementSibling, el.parentElement && el.parentElement.nextElementSibling];
    for (const c of cand) {
      if (!c) continue;
      const tx = (c.textContent || '').trim().toLowerCase();
      if (!tx || tx.length > 12 || /\d/.test(tx)) continue;
      if (/^(seg|sec|s|segundos?|seconds?)\b/.test(tx)) return 's';
      if (/^(min|m|minutos?|minutes?)\b/.test(tx)) return 'm';
      if (/^(h|hr|hrs|horas?|hours?)\b/.test(tx)) return 'h';
      if (/^(d|dias?|days?)\b/.test(tx)) return 'd';
    }
    return null;
  }
  function toSecs(tx) {
    const m = CLOCK_RE.exec(tx);
    if (!m) return null;
    return m[3] !== undefined ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
  }
  function countdowns() {
    const found = [];
    for (const [el, hist] of A.digits) {
      if (hist.length < 3 || !el.isConnected) continue;
      let ok = 0;
      for (let k = 1; k < hist.length; k++) {
        const dt = hist[k][0] - hist[k - 1][0];
        const clock = CLOCK_RE.test(hist[k][1]);
        const a = clock ? toSecs(hist[k - 1][1]) : +hist[k - 1][1];
        const b = clock ? toSecs(hist[k][1]) : +hist[k][1];
        const wrapped = !clock && b === 59 && a === 0;
        if (dt > 0.5 && dt < 1.8 && ((a - b === 1) || wrapped)) ok++;
      }
      if (ok >= 2) found.push(el);
    }
    const groups = [];
    const used = new Set();
    for (const el of found) {
      if (used.has(el)) continue;
      const tx = (el.textContent || '').trim();
      if (CLOCK_RE.test(tx)) {
        const last = A.digits.get(el).slice(-1)[0];
        groups.push({ clock: tx.split(':').length, leaves: [el], total: toSecs(tx) + last[0] });
        used.add(el);
        continue;
      }
      // the seconds leaf: climb to the container holding the labelled digits
      let box = el.parentElement, leaves = [];
      for (let up = 0; up < 5 && box; up++, box = box.parentElement) {
        leaves = [...box.querySelectorAll('*')].filter(n => n.children.length === 0 && DIGIT_RE.test((n.textContent || '').trim()) && unitLabel(n));
        if (leaves.length >= 2 || (leaves.length === 1 && up >= 1)) break;
      }
      if (!leaves.length || !leaves.includes(el)) leaves = [el];
      const units = leaves.map(unitLabel);
      if (units.some(u => !u)) continue;
      leaves.forEach(l => used.add(l));
      const total = leaves.reduce((acc, l, i) => acc + (+l.textContent.trim()) * UNIT_SECS[units[i]], 0);
      const lastT = Math.max(...leaves.map(l => (A.digits.get(l) || [[0]]).slice(-1)[0][0]));
      groups.push({ leaves, units, total: total + lastT });
    }
    S.countdowns = groups;
    // other numbers that moved (a "loading… 42%" counter): replayed as recorded
    const inClock = new Set(groups.flatMap(g => g.leaves));
    S.hists = [];
    for (const [el, hist] of A.digits) {
      if (inClock.has(el) || hist.length < 3) continue;
      const vals = hist.map(h => h[1]);
      if (new Set(vals).size < 3) continue;
      const step = Math.max(1, Math.ceil(hist.length / 40));
      S.hists.push({ el, hist: hist.filter((_, i) => i % step === 0 || i === hist.length - 1).map(h => [Math.round(h[0] * 10) / 10, h[1]]) });
    }
    return groups.map(g => ({ total: Math.round(g.total), units: g.units || ['clock' + g.clock], text: g.leaves.map(l => l.textContent.trim()).join(' ') }));
  }
  function appearances(minT) {
    const out = [];
    for (const [el, t] of A.firstSeen) {
      if (t < minT) continue;
      let anc = el.parentElement, nested = false;
      while (anc) { if (A.firstSeen.has(anc) && A.firstSeen.get(anc) >= minT) { nested = true; break; } anc = anc.parentElement; }
      if (nested) continue;
      out.push({ tag: el.tagName.toLowerCase(), id: el.id || '', text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), t: Math.round(t * 10) / 10 });
    }
    return out.slice(0, 8);
  }
  // number of visible interactive things, used to decide when a step has "settled"
  function visibleCount() {
    let n = 0;
    for (const el of document.body.querySelectorAll('button, a[href], img, video, iframe, input, h1, h2, h3, p')) if (isVisible(el)) n++;
    return n;
  }
  function hasMedia() {
    return [...document.querySelectorAll('video, iframe, vturb-smartplayer, [id^="vid_"], [class*="player" i]')].some(isVisible);
  }

  // ───────────────────────── the serializer ─────────────────────────
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

  // frames nobody sees or that only work on the original's domain (captcha, tracking pixels, marketing form bridges)
  const FRAME_JUNK = /recaptcha|hcaptcha|challenges\.cloudflare|turnstile|doubleclick\.net|googletagmanager\.com\/ns|facebook\.com\/tr|connect\.facebook\.net|google-analytics|analytics\.|px\.ads|bat\.bing|snapchat\.com\/p|tiktok\.com\/i18n/;
  const FRAME_HELPER = /mkto|xdframe|usersync|user_sync|cookiesync|\/sync\b|pixel|beacon|tracker|tracking|adservice|adsystem|\bads?\./;
  const FRAME_EMBED = /youtube|vimeo|wistia|vturb|converteai|panda|player|maps|calendly|typeform|tally\.so|hubspot|jotform/;
  function isJunkFrame(f) {
    if (!f || f.tagName !== 'IFRAME') return false;
    const u = ((f.getAttribute('src') || f.getAttribute('data-src') || '') + ' ' + (f.name || '') + ' ' + (f.id || '')).toLowerCase();
    if (FRAME_EMBED.test(u)) return false;
    if (FRAME_JUNK.test(u) || FRAME_HELPER.test(u)) return true;
    // pinned over the page (consent iframe, marketing pop-up, chat window): the original's scripts own it
    for (let n = f; n && n !== document.body; n = n.parentElement) if (posOf(n) === 'fixed') return true;
    try {
      const cs = getComputedStyle(f), r = f.getBoundingClientRect();
      return ((cs.position === 'absolute' || cs.position === 'fixed') && (parseFloat(cs.top) <= -1000 || parseFloat(cs.left) <= -1000)) || (cs.display !== 'none' && (r.width <= 2 || r.height <= 2));
    } catch (e) { return false; }
  }

  function snapshot(i, opts) {
    opts = opts || {};
    const live = S.blocks[i];
    if (!live || !live.isConnected) return null;
    if (isConsentWidget(live)) return null;
    // a block that IS a captcha badge is not content
    if (live.matches && live.matches('.grecaptcha-badge, [class*="g-recaptcha"], .h-captcha, .cf-turnstile')) return null;
    if (isJunkFrame(live)) return null;

    const rect = live.getBoundingClientRect();
    const L = [live, ...live.querySelectorAll('*')];
    const clone = live.cloneNode(true);
    const C = [clone, ...clone.querySelectorAll('*')];
    if (L.length !== C.length) return null;
    const l2c = new Map();
    L.forEach((n, k) => l2c.set(n, C[k]));
    const c2l = new Map();
    C.forEach((n, k) => c2l.set(n, L[k]));

    // number every element so the walker can later describe "what changed when
    // this answer was picked" in terms the clone's markup can be addressed by
    if (opts.tagAll) {
      for (let k = 0; k < L.length; k++) {
        const n = S.nodeList.length;
        S.nodeList.push(L[k]);
        S.base.push([L[k].getAttribute('class'), L[k].getAttribute('style'), !!L[k].disabled]);
        C[k].setAttribute('data-vai-n', String(n));
      }
    }

    const images = [], links = [], removals = [];
    const pv = opts.video && opts.video.url ? opts.video : null;
    const hostsToFill = [];
    const hiddenInline = [];

    const isProtected = ln => {
      if (ln.tagName === 'DIALOG' || ln.hasAttribute('popover') || ln.getAttribute('aria-modal') === 'true') return true;
      if (OVERLAY_ROLES.test(ln.getAttribute('role') || '')) return true;
      if (ln.hasAttribute('data-aos')) return true;
      if (MENU_TOGGLE.test(clsOf(ln)) || MENU_LABEL.test(ln.getAttribute('aria-label') || '')) return true;
      for (let n = ln; n && n !== document.body; n = n.parentElement) {
        if (['NAV', 'DIALOG'].includes(n.tagName) && n !== ln) return true;
        if (posOf(n) === 'fixed') return true;
      }
      return false;
    };

    // the "click to play" layer a page puts over a video works only with the page's own script: marked, the clone's player replaces it
    const coverScan = host => {
      const hr = host.getBoundingClientRect();
      let pp = host.parentElement;
      for (let up = 0; up < 3 && pp && hr.width >= 100 && hr.height >= 60; up++, pp = pp.parentElement) {
        for (const o of pp.querySelectorAll(':scope > *, :scope > * > *')) {
          if (o === host || o.contains(host) || host.contains(o)) continue;
          const ocs = getComputedStyle(o);
          if ((ocs.position !== 'absolute' && ocs.position !== 'fixed') || ocs.display === 'none' || ocs.visibility === 'hidden') continue;
          const orr = o.getBoundingClientRect();
          const ix = Math.max(0, Math.min(orr.right, hr.right) - Math.max(orr.left, hr.left)), iy = Math.max(0, Math.min(orr.bottom, hr.bottom) - Math.max(orr.top, hr.top));
          const cov = ix * iy, hostA = hr.width * hr.height, layerA = Math.max(1, orr.width * orr.height);
          if (!(cov >= 0.8 * hostA || (cov >= 0.8 * layerA && cov >= 0.5 * hostA))) continue;
          const txt0 = (o.innerText || '').trim();
          if (txt0.length > 3) continue;       // (a button with words may be what the walker presses to go on)
          if (ocs.cursor !== 'pointer' && !o.querySelector('svg, [class*="play" i]') && !o.getAttribute('onclick')) continue;
          const oc = l2c.get(o); if (oc) oc.setAttribute('data-vai-cover', '1');
        }
      }
    };

    // 1. per-node fix-ups: clone gets what only the live node can tell us
    for (let k = 0; k < L.length; k++) {
      const ln = L[k], cn = C[k], tag = ln.tagName;
      if (tag === 'SCRIPT' || tag === 'NOSCRIPT') { removals.push(cn); continue; }
      if (k > 0 && (ln.id || ln.className) && isConsentWidget(ln)) { removals.push(cn); continue; }

      for (const a of Array.from(cn.attributes)) {
        const name = a.name.toLowerCase();
        if (name.startsWith('on')) { cn.removeAttribute(a.name); continue; }
        if (['href', 'src', 'action', 'xlink:href', 'formaction'].includes(name) && a.value.trim().toLowerCase().startsWith('javascript:')) cn.removeAttribute(a.name);
      }
      const st = cn.getAttribute('style');
      if (st && st.includes('url(')) cn.setAttribute('style', absStyle(st));

      if (ln.shadowRoot && !ln.shadowRoot.querySelector('video') && !ln.shadowRoot.querySelector('iframe[src]') && !(ln.tagName.includes('-') && /player|vturb|video/i.test(ln.tagName))) {
        const sh = serializeShadow(ln, 0);
        if (sh.html) { cn.insertAdjacentHTML('afterbegin', '<template shadowrootmode="open">' + sh.html + '</template>'); sh.imgs.forEach(x => images.push(x)); }
      }
      // a layer that covers the page (an age gate, a newsletter popup): marked, so the clone can close it again
      if (k > 0 || true) {
        const mcs = getComputedStyle(ln);
        if (mcs.position === 'fixed' && mcs.display !== 'none' && mcs.visibility !== 'hidden') {
          const mr = ln.getBoundingClientRect();
          if (mr.width >= innerWidth * 0.5 && mr.height >= innerHeight * 0.5) {
            const z = parseInt(mcs.zIndex, 10) || 0;
            const hint = /modal|popup|pop-up|overlay|gate|lightbox|dialog|backdrop|splash|interstitial/i.test((ln.id || '') + ' ' + (typeof ln.className === 'string' ? ln.className : ''));
            // (a layer that holds MOST of the page's text is the app itself, not a popup over it)
            const smallLayer = (ln.innerText || '').length <= (document.body.innerText || '').length * 0.6;
            if (smallLayer && (z >= 50 || hint || ln.getAttribute('role') === 'dialog' || ln.getAttribute('aria-modal') === 'true' || tag === 'DIALOG')) cn.setAttribute('data-vai-modal', '1');
          }
        }
      }

      // custom video players: a web component whose frame / <video> lives in its shadow root (invisible to cloneNode and outerHTML)
      if (ln.tagName.includes('-')) {
        const VHOST = /^(youtube-video|vimeo-video|lite-youtube|lite-vimeo|wistia-player|wistia-video|mux-player|mux-video|hls-video|dash-video|dailymotion-video|jwplayer-video|videojs-video|vidstack-player|media-player|media-controller|panda-player|bunny-player)$/i;
        let embed = '', vsrc = '';
        const sr = ln.shadowRoot;
        if (sr) {
          const f = sr.querySelector('iframe[src]'); if (f) embed = f.src || '';
          const v = sr.querySelector('video'); const s0 = v ? (v.currentSrc || v.src || '') : '';
          if (s0 && !s0.startsWith('blob:')) vsrc = s0;
        }
        const w0 = ln.offsetWidth || ln.getBoundingClientRect().width, h0 = ln.offsetHeight || ln.getBoundingClientRect().height;
        if ((VHOST.test(ln.tagName) || embed || vsrc) && w0 >= 20 && h0 >= 20) {
          cn.setAttribute('data-vai-vhost', '1');
          cn.setAttribute('data-vai-box', Math.round(w0) + ',' + Math.round(h0));
          if (embed) cn.setAttribute('data-vai-embed', embed);
          if (vsrc) cn.setAttribute('data-vai-vsrc', vsrc);
          try { if (ln.checkVisibility && !ln.checkVisibility({ opacityProperty: true, visibilityProperty: true })) cn.setAttribute('data-vai-hidden', '1'); } catch (e) {}
          coverScan(ln);
        }
      }

      // the box a video occupied, so the clone's own player can take its place with the same proportion
      if (tag === 'VIDEO' || tag === 'IFRAME') {
        if ((tag === 'VIDEO' && !(ln.loop && ln.muted && ln.autoplay && !ln.controls)) || (tag === 'IFRAME' && /youtube|vimeo|wistia|panda|vturb|converteai|vidalytics|mediadelivery|videodelivery|cloudflarestream|player/i.test(ln.getAttribute('src') || ''))) { try { coverScan(ln); } catch (e) {} }
        const vr = ln.getBoundingClientRect();
        try { if (ln.checkVisibility && !ln.checkVisibility({ opacityProperty: true, visibilityProperty: true })) cn.setAttribute('data-vai-hidden', '1'); } catch (e) {}
        // the video's own proportion when it is known (a poster of another shape rules the box until it loads)
        const vw = tag === 'VIDEO' && ln.videoWidth > 0 ? ln.videoWidth : 0, vh = vw ? ln.videoHeight : 0;
        if (vw && vh && vr.width > 20) cn.setAttribute('data-vai-box', Math.round(vr.width) + ',' + Math.round(vr.width * vh / vw));
        else if (vr.width > 20 && vr.height > 20) cn.setAttribute('data-vai-box', Math.round(vr.width) + ',' + Math.round(vr.height));
        if (tag === 'VIDEO') {
          // what the original element says about itself
          if (ln.autoplay) cn.setAttribute('autoplay', '');
          if (ln.loop) cn.setAttribute('loop', '');
          if (ln.muted) cn.setAttribute('muted', '');
          if (ln.controls) cn.setAttribute('controls', '');
          const cu = ln.currentSrc;
          if (cu && !cu.startsWith('blob:') && !cn.getAttribute('src')) cn.setAttribute('src', cu);
        }
      }

      if (tag === 'IMG') {
        const real = ln.currentSrc || ln.src;
        if (real) { cn.setAttribute('src', real); if (!real.startsWith('data:')) images.push({ src: real, alt: ln.alt || '' }); }
        cn.removeAttribute('srcset'); cn.removeAttribute('sizes'); cn.removeAttribute('loading');
      } else if (tag === 'A' && ln.getAttribute('href') !== null) {
        if (ln.href) { cn.setAttribute('href', ln.href); if (!ln.href.startsWith('javascript:') && links.length < 40) links.push({ href: ln.href, text: textOf(ln).slice(0, 80) }); }
      } else if (['VIDEO', 'SOURCE', 'AUDIO', 'IFRAME', 'EMBED', 'TRACK'].includes(tag) && ln.getAttribute('src')) {
        if (ln.src) cn.setAttribute('src', ln.src);
        if (tag === 'VIDEO' && ln.getAttribute('poster')) cn.setAttribute('poster', ln.poster);
      } else if (tag === 'OBJECT' && ln.data) {
        cn.setAttribute('data', ln.data);
      } else if ((tag === 'use' || tag === 'image') && ln.getAttribute('href')) {
        const h = ln.getAttribute('href');
        if (!h.startsWith('#') && !/^(data:|https?:)/i.test(h)) cn.setAttribute('href', absUrl(h));
      } else if (tag === 'CANVAS') {
        // pixels only exist in the backing bitmap — bake the current frame in as a static <img>
        try {
          const img = document.createElement('img');
          img.src = ln.toDataURL('image/png');
          img.className = cn.className;
          const s = cn.getAttribute('style');
          if (s) img.setAttribute('style', s);
          cn.replaceWith(img);
        } catch (e) { /* tainted canvas: nothing recoverable */ }
        continue;
      }

      // a custom-element video player (VTurb/Panda-style) keeps its <video> in
      // a shadow root outerHTML never serializes — fill it with the real stream
      if (pv && tag.includes('-') && ((ln.shadowRoot && ln.shadowRoot.querySelector('video')) || /player|vturb|video/i.test(tag))) {
        const r = ln.getBoundingClientRect();
        if (r.width >= 120 && r.height >= 60) hostsToFill.push({ ln, cn, r });
      }

      // inline-hidden by the page's own JS (a timer-gated offer, a reveal that never fired)
      const sty = ln.style;
      if (sty && (sty.display === 'none' || sty.visibility === 'hidden' || sty.opacity === '0') && !isProtected(ln)) hiddenInline.push({ ln, cn, r: ln.getBoundingClientRect(), parent: ln.parentElement });
    }

    // 2. players
    const filled = new Set();
    for (const h of hostsToFill) {
      if (hostsToFill.some(o => o !== h && o.ln.contains(h.ln))) continue;
      const aspect = (h.r.height / h.r.width * 100).toFixed(3);
      const thumb = h.ln.querySelector('img');
      const poster = (thumb && (thumb.currentSrc || thumb.src)) || pv.poster || '';
      // our own smart player (public/vai-player.js) mounts on this marker
      const shotIdx = h.ln.getAttribute('data-vai-host');
      const hasShot = shotIdx !== null && window.__vaiShots && window.__vaiShots[+shotIdx];
      // the rules the original player had (start on click / on open, may it be paused,
      // which controls) override the defaults; a picture of the original cover always waits for a tap
      const rules = pv.rules || {};
      const pcfg = hasShot
        ? Object.assign({ src: pv.url, bar: 'smart', cover: 'shot' }, rules, { poster: '__VAI_SHOT_' + shotIdx + '__', start: 'click' })
        : Object.assign({ src: pv.url, bar: 'smart', start: 'preview' }, rules, { poster: poster || undefined, preview: pv.preview || undefined });
      h.cn.innerHTML =
        '<div data-vai-player="' + JSON.stringify(pcfg).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"' +
        ' style="position:relative;width:100%;padding-top:' + aspect + '%;background:#000;border-radius:inherit;overflow:hidden"></div>';
      h.cn.style.setProperty('display', 'block');
      filled.add(h.cn);
    }

    // 3. inline-hidden reveal, except stacked crossfade slides (only the first of a same-box cluster)
    const skip = new Set();
    for (let a = 0; a < hiddenInline.length; a++) {
      if (skip.has(hiddenInline[a].ln)) continue;
      const ra = hiddenInline[a].r;
      if (ra.width <= 0 || ra.height <= 0) continue;
      for (let b = a + 1; b < hiddenInline.length; b++) {
        if (skip.has(hiddenInline[b].ln) || hiddenInline[a].parent !== hiddenInline[b].parent) continue;
        const rb = hiddenInline[b].r;
        if (Math.abs(ra.left - rb.left) < 4 && Math.abs(ra.top - rb.top) < 4 && Math.abs(ra.width - rb.width) < 4 && Math.abs(ra.height - rb.height) < 4) skip.add(hiddenInline[b].ln);
      }
    }
    for (const h of hiddenInline) {
      if (skip.has(h.ln)) continue;
      const s = h.cn.style;
      if (s.display === 'none') s.removeProperty('display');
      if (s.visibility === 'hidden') s.removeProperty('visibility');
      if (s.opacity === '0') {
        s.removeProperty('opacity');
        if (/translate|scale/.test(s.transform || '')) s.removeProperty('transform');
      }
    }

    // 4. toggle pairs: buttons that open/close a panel
    const handledPanels = new Set();
    let toggleN = 0;
    const tag = (btn, panel) => {
      btn.setAttribute('data-vai-toggle-btn', i + '-' + toggleN);
      panel.setAttribute('data-vai-toggle-panel', i + '-' + toggleN);
      toggleN++;
    };
    const clipped = ln => {
      const cs = getComputedStyle(ln), r = ln.getBoundingClientRect();
      if (r.height < 2 && collapsedPanel(ln)) return true;
      if (cs.overflow !== 'hidden' && cs.overflowY !== 'hidden') return false;
      const maxH = parseFloat(cs.maxHeight), rows = cs.gridTemplateRows;
      return (!isNaN(maxH) && isFinite(maxH) && maxH < ln.scrollHeight - 2) || (/^\d/.test(rows) && parseFloat(rows) < ln.scrollHeight - 2);
    };
    const panelOf = (btn, relation, controlsId) => {
      let p = controlsId ? document.getElementById(controlsId) : null;
      if (!p) p = relation === 'last' ? (btn.parentElement ? btn.parentElement.lastElementChild : null) : btn.nextElementSibling;
      if (p && (p === btn || p.contains(btn) || btn.contains(p) || p.matches(TOGGLE_SEL))) return null;
      return p;
    };
    const closeable = (cp, lp, openDisplay) => {
      cp.style.setProperty('max-height', 'none', 'important');
      cp.style.setProperty('grid-template-rows', '1fr', 'important');
      cp.style.setProperty('overflow', 'visible', 'important');
      cp.style.setProperty('display', 'none', 'important');
      cp.setAttribute('data-vai-open-display', openDisplay || 'block');
    };

    // 4a. toggles learned by clicking on a throwaway page (panels the framework only mounts on click)
    const { keyToLive } = toggleKeys();
    for (const t of (opts.toggles || [])) {
      const lb = keyToLive.get(t.sig + '#' + t.occ);
      const cb = lb && l2c.get(lb);
      if (!cb) continue;
      const openDisplay = t.panelDisplay && t.panelDisplay !== 'none' ? t.panelDisplay : 'block';
      let lp = panelOf(lb, t.relation, t.controlsId);
      let cp = lp ? l2c.get(lp) : null;
      if (!cp) {
        const wrap = document.createElement('div');
        wrap.innerHTML = t.panelHtml;
        cp = wrap.firstElementChild;
        if (!cp) continue;
        cp.querySelectorAll('script, noscript').forEach(n => n.remove());
        cp.querySelectorAll('a[href]').forEach(a => { a.setAttribute('href', absUrl(a.getAttribute('href'))); });
        cp.querySelectorAll('img[src]').forEach(im => { im.setAttribute('src', absUrl(im.getAttribute('src'))); im.removeAttribute('srcset'); });
        cp.style.setProperty('display', 'none', 'important');
        cp.setAttribute('data-vai-open-display', openDisplay);
        cb.insertAdjacentElement('afterend', cp);
      } else if (getComputedStyle(lp).display === 'none') {
        cp.setAttribute('data-vai-open-display', openDisplay);
      } else if (clipped(lp)) {
        closeable(cp, lp, openDisplay);
      }
      handledPanels.add(cp);
      tag(cb, cp);
    }

    // 4b. CSS-collapsed accordions found by looking, not clicking: a button
    //     followed by a panel clipped to nothing
    for (let k = 0; k < L.length; k++) {
      const lb = L[k], cb = C[k];
      if (!lb.matches || !lb.matches(TOGGLE_SEL) || cb.hasAttribute('data-vai-toggle-btn')) continue;
      if (MENU_TOGGLE.test(clsOf(lb)) || MENU_LABEL.test(lb.getAttribute('aria-label') || '')) continue;
      const controlsId = lb.getAttribute('aria-controls');
      for (const relation of controlsId ? ['aria'] : ['next', 'last']) {
        const lp = panelOf(lb, relation, controlsId);
        const cp = lp && l2c.get(lp);
        if (!cp || handledPanels.has(cp) || cp.hasAttribute('data-vai-toggle-panel')) continue;
        if (!clipped(lp)) continue;
        const od = getComputedStyle(lp).display;
        closeable(cp, lp, od === 'none' ? 'block' : od);
        handledPanels.add(cp);
        tag(cb, cp);
        break;
      }
    }

    // 4c. everything else collapsed by CSS (no button we can pair): open it, content must be readable
    for (let k = 0; k < L.length; k++) {
      const ln = L[k], cn = C[k];
      if (handledPanels.has(cn) || cn.hasAttribute('data-vai-toggle-panel')) continue;
      const cs = getComputedStyle(ln);
      if (cs.overflow !== 'hidden' && cs.overflowY !== 'hidden') continue;
      if (clipped(ln) && ln.scrollHeight > 4 && !isProtected(ln)) {
        cn.style.setProperty('max-height', 'none', 'important');
        cn.style.setProperty('grid-template-rows', '1fr', 'important');
        cn.style.setProperty('overflow', 'visible', 'important');
      }
    }

    // 5. picture art direction: keep the source the browser chose, drop the srcset list
    clone.querySelectorAll('picture').forEach(pic => {
      const img = pic.querySelector('img');
      if (img && !img.getAttribute('src')) {
        const first = pic.querySelector('source[srcset]');
        const cand = first && first.getAttribute('srcset').split(',')[0].trim().split(/\s+/)[0];
        if (cand) img.setAttribute('src', absUrl(cand));
      }
      pic.querySelectorAll('source').forEach(s => s.remove());
    });

    // 5b. widgets that only work on the original's domain, and frames nobody sees (same rules as the page capture)
    clone.querySelectorAll('.grecaptcha-badge, [class*="g-recaptcha"], .h-captcha, .cf-turnstile').forEach(n => n.remove());
    clone.querySelectorAll('dialog[open]').forEach(d => d.removeAttribute('open'));
    for (const [lf, cf] of l2c) if (lf && lf.tagName === 'IFRAME' && cf && isJunkFrame(lf)) cf.remove();

    // 6. timed elements: hidden until the delay the original showed them after
    let delayed = 0;
    const minDelay = typeof opts.minDelay === 'number' ? opts.minDelay : 1.6;
    const flagged = new Set();
    for (const [el, t] of A.firstSeen) if (t >= minDelay && l2c.has(el)) flagged.add(el);
    for (const el of flagged) {
      // only the outermost: its descendants appear along with it
      let anc = el.parentElement, nested = false;
      while (anc) { if (flagged.has(anc)) { nested = true; break; } anc = anc.parentElement; }
      if (nested) continue;
      // a wrapper with nothing the visitor can see on its own (no text, no media) isn't worth hiding
      const cel = l2c.get(el);
      if (cel.hasAttribute('data-vai-pitch-at') || cel.closest('[data-vai-pitch-at]') || cel.hasAttribute('data-vai-delay')) continue;      // already tied to the video's clock by the media-time probe
      const vtAt = A.firstVT.get(el);
      // the page's main content that showed up a few seconds in was waiting behind the original's loading screen;
      // the clone has no such screen, so waiting for it would only leave the visitor staring at a blank page
      if (!(vtAt > 0.2) && A.firstSeen.get(el) <= 8) {
        const rr = el.getBoundingClientRect();
        if (rr.width * rr.height >= 0.45 * innerWidth * innerHeight && getComputedStyle(el).position !== 'fixed') continue;
      }
      if (vtAt > 0.2) cel.setAttribute('data-vai-pitch-at', String(Math.max(1, Math.round(vtAt - 0.2))));   // shown at this second of the video
      else cel.setAttribute('data-vai-delay', String(Math.max(1, Math.round(A.firstSeen.get(el) - 0.2))));
      delayed++;
    }

    // 6a. the offer of a long video: buttons the page keeps hidden until the video
    // reaches its "pitch" moment (known from the player's own settings) wait for
    // that moment in the clone too
    const pitchAt = typeof opts.pitchAt === 'number' && opts.pitchAt > 5 ? Math.round(opts.pitchAt) : 0;
    if (pitchAt) {
      for (const el of L) {
        if (!l2c.has(el) || !el.matches || !el.matches('button, a[href], [role="button"]') || isVisible(el) || el.closest('footer')) continue;
        const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
        if (!t || t.length >= 60 || !CTA_TEXT.test(t) || BRAND_TEXT.test(t)) continue;
        // the outermost thing that was hidden: its wrapper should not leave a hole
        let top = el;
        while (top.parentElement && top.parentElement !== document.body && !isVisible(top.parentElement) && l2c.has(top.parentElement)) top = top.parentElement;
        const ct = l2c.get(top);
        if (ct && !ct.hasAttribute('data-vai-delay') && !ct.closest('[data-vai-pitch-at]')) ct.setAttribute('data-vai-pitch-at', String(pitchAt));
      }
    }

    // 6b. countdown clocks the walker recognised
    S.countdowns.forEach((g, gi) => {
      g.leaves.forEach((lel, li) => {
        const cel = l2c.get(lel);
        if (!cel) return;
        const unit = g.units ? g.units[li] : 'c' + g.clock;
        cel.setAttribute('data-vai-cd', gi + ':' + unit + ':' + (lel.textContent || '').trim().length);
        cel.setAttribute('data-vai-cd-total', String(Math.round(g.total)));
      });
    });

    // 6c. recorded entrance animations + number histories
    if (opts.anims) {
      const byEl = new Map();
      for (const it of REC.items) {
        if (it.at > 12000 || !l2c.has(it.el)) continue;
        if (!byEl.has(it.el)) byEl.set(it.el, []);
        byEl.get(it.el).push(it);
      }
      let n = 0;
      for (const [lel, list] of byEl) {
        const cs = getComputedStyle(lel);
        const kept = [];
        for (const it of list) {
          // an animation only belongs to the clone if it lands where the element
          // really is now: the fade-OUT of the previous screen does not
          const last = it.frames[it.frames.length - 1] || {};
          const props = Object.keys(last).filter(k => k !== 'offset' && k !== 'easing');
          const good = props.filter(k => {
            const a = String(last[k]), b = String(cs[k]);
            return a === b || (!isNaN(parseFloat(a)) && Math.abs(parseFloat(a) - parseFloat(b)) < 0.02 && a.replace(/[\d.\-]/g, '') === b.replace(/[\d.\-]/g, ''));
          });
          if (!good.length) continue;
          const frames = it.frames.map(f => { const o = {}; for (const k in f) if (k === 'offset' || k === 'easing' || good.includes(k)) o[k] = f[k]; return o; });
          kept.push({ f: frames, d: it.timing.duration, dl: Math.round(it.at + it.timing.delay), e: it.timing.easing });
        }
        if (!kept.length || n++ >= 60) continue;
        l2c.get(lel).setAttribute('data-vai-anim', JSON.stringify(kept.slice(0, 3)));
      }
      // 6c2. JS-driven entrance motion, from the sampler
      const moving = [];
      for (const [mel, rec] of MOT.recs) {
        if (rec.s.length < 2 || !l2c.has(mel) || byEl.has(mel)) continue;
        const last = rec.s[rec.s.length - 1];
        const cs2 = getComputedStyle(mel);
        let hov = false;
        try { hov = mel.matches(':hover, :active, :focus'); } catch (e) {}
        // lands where the element really is now (an exit fade does not)
        if (hov || Math.abs(parseFloat(last[1]) - parseFloat(cs2.opacity)) > 0.02 || last[2] !== cs2.transform) continue;
        const dur = last[0] - rec.s[0][0];
        if (dur < 40 || dur > 2200) continue;
        moving.push({ mel, rec, dur });
      }
      if (moving.length) {
        const firstMove = Math.min(...moving.map(m => m.rec.s[0][0]));
        const base = TL.arrive !== undefined ? Math.min(TL.arrive, firstMove) : 0;
        let nm = 0;
        for (const m of moving) {
          if (nm++ >= 60) break;
          const smp = m.rec.s, t0m = smp[0][0];
          const opVaries = new Set(smp.map(x => x[1])).size > 1, trVaries = new Set(smp.map(x => x[2])).size > 1;
          const step = Math.max(1, Math.ceil(smp.length / 12));
          const frames = smp.filter((_, i) => i % step === 0 || i === smp.length - 1).map(x => {
            const f = { offset: Math.round((x[0] - t0m) / m.dur * 1000) / 1000 };
            if (opVaries) f.opacity = x[1];
            if (trVaries) f.transform = x[2];
            return f;
          });
          if (frames.length < 2) continue;
          frames[0].offset = 0; frames[frames.length - 1].offset = 1;
          const cel = l2c.get(m.mel);
          const prev = cel.getAttribute('data-vai-anim');
          const list = prev ? JSON.parse(prev) : [];
          list.push({ f: frames, d: Math.round(m.dur), dl: Math.max(0, Math.round(t0m - base)), e: 'linear' });
          cel.setAttribute('data-vai-anim', JSON.stringify(list.slice(0, 3)));
        }
      }
      buildTimelines(l2c).forEach(x => {
        const cel = l2c.get(x.el);
        if (cel) cel.setAttribute('data-vai-tl', x.json);
      });
    }

    // 7. tag every control with its index, so the walker can say afterwards
    //    which one advanced the funnel (and which are answer options)
    let wired = 0;
    if (opts.tagControls) {
      S.controls.forEach((lel, idx) => {
        const cel = l2c.get(lel);
        if (cel) { cel.setAttribute('data-vai-ctl', String(idx)); wired++; }
      });
      // the fields of the screen, numbered like the walker numbers them (so it can say which are required)
      [...document.querySelectorAll('input, textarea, select')].forEach((lel, idx) => {
        const cel = l2c.get(lel);
        if (cel && !['hidden', 'submit', 'button'].includes((lel.type || '').toLowerCase())) cel.setAttribute('data-vai-fld', String(idx));
      });
    }

    clone.querySelectorAll('[data-vai-host]').forEach(n => n.removeAttribute('data-vai-host'));
    for (const r of removals) r.remove();
    clone.querySelectorAll('[data-vai-idx], [data-vai-baseline-fixed], [data-vai-closed]').forEach(n => {
      n.removeAttribute('data-vai-idx'); n.removeAttribute('data-vai-baseline-fixed');
      if (n.hasAttribute('data-vai-closed')) n.remove();
    });

    return {
      tag: live.tagName,
      className: clsOf(live).slice(0, 100),
      rect: { height: rect.height, width: rect.width },
      images: images.slice(0, 80),
      links,
      domHtml: clone.outerHTML,
      embedded: filled.size,
      delayed,
      wired,
    };
  }

  // ───────────────────────── funnel stepping helpers ─────────────────────────
  // What a visitor could click to move on. Registered in S.controls so the
  // walker (and snapshot's `wire`) can refer to them by index.
  const BRAND_TEXT = /central de an[uú]ncios|termos|privacidade|pol[ií]tica|cookies|lgpd|criado via|powered by/i;
  const CTA_TEXT = /come[cç]|continu|pr[oó]xim|avan[cç]|inici|start|next|quero|garantir|comprar|agendar|descobrir|resultado|enviar|finalizar|liberar|receber|acessar|participar|aplicar|responder|ver |sim\b|ok\b|vamos|bora|entrar|baixar/i;
  const RISKY_TEXT = /pagar|finalizar compra|confirmar pedido|assinar agora/i;

  // Indexes are stable within a step: asking again after the page changed
  // (an answer was picked, a button woke up) returns the same index for the
  // same element and appends any new ones, so an index taken at snapshot time
  // still points at the right element later.
  const BACK_TEXT = /^(voltar|anterior|back|previous|fechar|close|sair|cancelar|[×x✕])$/i;
  const NEXT_TEXT = /^(continuar|pr[oó]ximo|pr[oó]xima|avan[cç]ar|enviar|finalizar|come[cç]ar|confirmar|voltar|next|continue|submit)\b/i;
  const NODE_IDS = new WeakMap();
  let nodeCounter = 0;
  function nodeTag(n) { if (!n) return 0; if (!NODE_IDS.has(n)) NODE_IDS.set(n, ++nodeCounter); return NODE_IDS.get(n); }
  const OPT_TAGS = new Set(['button', 'div', 'li', 'label', 'article', 'span', 'img', 'a']);
  // An answer is a block you can hit with a thumb. Small text links (a footer's "FAQ / Termos / Privacidade")
  // are not answers however alike they look; buttons keep the old, looser rule.
  const optSized = c => c.tag === 'button' || (c.w >= 110 && c.h >= 38);
  function controls() {
    const els = [...document.querySelectorAll('button, [role="button"], a[href], input[type="submit"], input[type="button"]')];
    // Clickable things that are not buttons or links: a card made of divs, a <label> around a radio
    // button. cursor:pointer is inherited, so the one that matters is the OUTERMOST pointer element;
    // anything that already holds (or sits inside) a button / link is not added twice.
    const hasInteractive = e => !!e.querySelector('button, a[href], [role="button"], input:not([type=radio]):not([type=checkbox]), select, textarea');
    const inInteractive = e => !!e.closest('button, a[href], [role="button"]');
    const seenEl = new Set(els);
    document.querySelectorAll('label, div, li, article, span, img').forEach(e => {
      if (seenEl.has(e) || !isVisible(e) || e.closest('footer, nav, header') && e.tagName !== 'LABEL') return;
      const r = e.getBoundingClientRect();
      if (r.width < 90 || r.height < 28 || r.width > innerWidth * 0.98 && r.height > innerHeight * 0.6) return;
      const isLabel = e.tagName === 'LABEL' && e.querySelector('input[type=radio], input[type=checkbox]');
      if (!isLabel) {
        if (getComputedStyle(e).cursor !== 'pointer') return;
        const p = e.parentElement;
        if (p && getComputedStyle(p).cursor === 'pointer' && p !== document.body) return;   // inherited: the parent is the clickable one
        if (hasInteractive(e) || inInteractive(e)) return;
        if (!(e.innerText || '').trim() && !e.querySelector('img, svg')) return;
      } else if (inInteractive(e)) return;
      els.push(e);
    });
    const out = [], live = [];
    for (const el of els) {
      if (!isVisible(el)) continue;
      if (el.closest('footer')) continue;
      // parked outside the window on the side (a menu drawer waiting to slide in): not something a visitor can press
      const rr = el.getBoundingClientRect();
      if (rr.left >= innerWidth - 1 || rr.right <= 1) continue;
      const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
      if (el.tagName === 'A') {
        const raw = el.getAttribute('href') || '';
        if (/^(mailto:|tel:)/i.test(raw)) continue;
        // "#" / javascript: anchors are buttons in disguise (the page's script decides
        // where they go): worth pressing when they look like a call to action
        const disguised = !raw || raw.startsWith('#') || /^javascript:/i.test(raw);
        if (disguised) {
          const r0 = el.getBoundingClientRect();
          if (!(CTA_TEXT.test(text) || r0.width >= 200)) continue;
        } else {
          try { const u = new URL(el.href); if (u.hostname === location.hostname && (u.pathname === '/' || u.pathname === '')) continue; } catch (e) {}
        }
      }
      if (BRAND_TEXT.test(text)) continue;
      if (el.hasAttribute('aria-expanded')) continue;
      if (MENU_TOGGLE.test(clsOf(el)) || MENU_LABEL.test(el.getAttribute('aria-label') || '')) continue;
      let idx = S.controlIds.get(el);
      if (idx === undefined) { idx = S.controls.length; S.controls.push(el); S.controlIds.set(el, idx); }
      const r = el.getBoundingClientRect();
      let faqRoot = el.closest('[class*="faq" i], [class*="accordion" i], [class*="collapse" i]');
      if (!faqRoot) {
        const nx = el.nextElementSibling;
        if (nx && !nx.contains(el) && (nx.textContent || '').trim().length > 20 && collapsedPanel(nx)) faqRoot = nx;
      }
      out.push({
        i: idx, tag: el.tagName.toLowerCase(), text: text.slice(0, 60),
        w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY),
        href: el.tagName === 'A' ? el.href : null, gkey: '',
        disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
        inFaq: !!faqRoot,
        // "voltar" / an icon-only arrow: never the way FORWARD
        back: BACK_TEXT.test(text) || (!text && r.width < 90 && r.height < 90),
        par: nodeTag(el.parentElement), gpar: nodeTag(el.parentElement && el.parentElement.parentElement),
      });
      live.push(el);
    }
    // Answer options: buttons that LOOK alike (same tag, nearly the same class
    // list and size) but say different things. Each often sits in its own
    // wrapper and carries a per-element id class, so DOM position and exact
    // class equality don't work; class-set overlap does.
    const toks = live.map(el => new Set(clsOf(el).split(/\s+/).filter(Boolean)));
    const parent = out.map((_, k) => k);
    const find = k => { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
    for (let a = 0; a < out.length; a++) {
      if (!OPT_TAGS.has(out[a].tag) || out[a].inFaq || NEXT_TEXT.test(out[a].text) || !optSized(out[a])) continue;
      for (let b = a + 1; b < out.length; b++) {
        if (out[b].tag !== out[a].tag || out[b].inFaq || NEXT_TEXT.test(out[b].text) || out[a].text === out[b].text || !optSized(out[b])) continue;
        if (Math.abs(out[a].w - out[b].w) > 10 || Math.abs(out[a].h - out[b].h) > 24) continue;
        let inter = 0;
        for (const t of toks[a]) if (toks[b].has(t)) inter++;
        const jac = inter / Math.max(toks[a].size + toks[b].size - inter, 1);
        // few classes in common is only evidence if they also sit together
        const together = out[a].par === out[b].par || (out[a].gpar && out[a].gpar === out[b].gpar);
        if (jac >= 0.8 && toks[a].size >= 1 && (toks[a].size >= 4 || together)) parent[find(b)] = find(a);
      }
    }
    const clusters = new Map();
    out.forEach((it, k) => {
      const root = find(k);
      if (!clusters.has(root)) clusters.set(root, new Set());
      clusters.get(root).add(it.text);
      it.gkey = 'c' + root;
    });
    for (const it of out) {
      it.groupSize = (clusters.get(parseInt(it.gkey.slice(1), 10)) || new Set()).size || 1;
      it.isOption = OPT_TAGS.has(it.tag) && it.groupSize >= 2 && !it.inFaq && !it.back && !NEXT_TEXT.test(it.text) && !(it.tag === 'a' && it.external);
      it.risky = RISKY_TEXT.test(it.text);
      it.external = false;
      if (it.href) { try { it.external = new URL(it.href).origin !== location.origin; } catch (e) {} }
      let score = 0;
      if (CTA_TEXT.test(it.text)) score += 3;
      if (it.w >= 200) score += 1;
      if (it.h >= 40) score += 1;
      if (it.inFaq) score -= 5;
      if (it.text.length === 0) score -= 2;
      if (it.isOption) score -= 1;
      if (NEXT_TEXT.test(it.text)) score += 2;
      it.score = score;
    }
    return out;
  }

  // Things that exist in the DOM but are hidden and look like a call to action:
  // the likely home of an offer that only shows late (after a long video).
  function hiddenCtas() {
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
      if (isVisible(el) || el.closest('footer')) continue;
      const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
      if (t && t.length < 60 && CTA_TEXT.test(t) && !BRAND_TEXT.test(t)) out.push(t);
    }
    return out.slice(0, 6);
  }

  // A cheap fingerprint of "which screen of the funnel is this", compared by
  // the walker before/after a click to decide whether the click advanced.
  function signature() {
    const txt = el => (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    // a cookie banner over the screen is not part of the screen (it comes and goes between visits)
    const inConsent = el => { for (let n = el; n && n !== document.body; n = n.parentElement) if ((n.id || n.className) && isConsentWidget(n)) return true; return false; };
    const shown = el => isVisible(el) && !inConsent(el);
    const heads = [...document.querySelectorAll('h1, h2, h3')].filter(shown).map(txt).filter(Boolean).slice(0, 4);
    const btns = [...document.querySelectorAll('button, a[href], [role="button"]')].filter(shown).map(txt).filter(Boolean).slice(0, 12);
    let prog = '';
    const bar = [...document.querySelectorAll('[style*="width"]')].find(e => /progress|bar|bg-featured/i.test(clsOf(e)) && e.style.width && e.style.width.endsWith('%') && e.style.width !== '100%');
    if (bar) prog = bar.style.width;
    const media = [...document.querySelectorAll('video, iframe')].filter(isVisible).map(m => (m.currentSrc || m.src || '').slice(0, 80)).slice(0, 2);
    const imgs = [...document.querySelectorAll('img')].filter(isVisible).map(i => (i.currentSrc || i.src || '').split('/').pop().slice(0, 30)).slice(0, 4);
    // ids of the blocks inside the content root: builders give each step its own
    const ids = locate().blocks.map(b => b.id || '').filter(Boolean).slice(0, 4);
    // something big and fixed on top of the page that was not the page before (a
    // modal, a popup): the screen under it is still the same screen
    let overlay = false;
    try {
      const mid = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      for (let n = mid; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        if (getComputedStyle(n).position === 'fixed') {
          const r = n.getBoundingClientRect();
          if (r.width * r.height >= innerWidth * innerHeight * 0.35) { overlay = true; break; }
        }
      }
    } catch (e) {}
    return { path: location.pathname + location.search, heads, btns, prog, media, imgs, ids, overlay };
  }

  // how an answer option looks selected: classes added/removed on it and its descendants
  function selState(i) {
    const el = S.controls[i];
    if (!el) return null;
    return [el, ...el.querySelectorAll('*')].map(n => clsOf(n).split(/\s+/).filter(Boolean));
  }
  function control(i) { return S.controls[i] || null; }
  // Timelines of the elements in `inScope` (a Set/Map of live elements), as
  // [{ el, json }]. Moving elements keep their style to the motion sampler;
  // the ticking countdown digits belong to the countdown.
  function buildTimelines(inScope) {
    const skipText = new Set((S.countdowns || []).flatMap(g => g.leaves));
    const items = [];
    for (const [el, r] of TL.recs) {
      if (!inScope.has(el) || !el.isConnected) continue;
      // a screen that came by itself after another (a chain of loaders): only what happened
      // since it arrived is its film, and what the element looked like at that moment is its start
      const init0 = Object.assign({}, r.i);
      const evAll = [];
      for (const x of r.e) { if (x[0] < TL.epoch) init0[x[1]] = x[2]; else evAll.push(x); }
      let ev = evAll.filter(x => !(x[1] === 't' && skipText.has(el)) && !(x[1] === 's' && MOT.recs.has(el) && (MOT.recs.get(el).s.length > 1)));
      // a counter that updates every frame: one change every ~90ms is plenty, and the last one always stays
      const thin = [];
      const lastAt = {};
      ev.forEach((x, i) => {
        const isLast = !ev.slice(i + 1).some(y => y[1] === x[1]);
        if (isLast || lastAt[x[1]] === undefined || x[0] - lastAt[x[1]] >= 90) { thin.push(x); lastAt[x[1]] = x[0]; }
      });
      ev = thin;
      if (!ev.length) continue;
      // text can only be replayed on an element that holds nothing but text: a container that was
      // emptied and refilled by the page (the app's root) must never have its content replaced
      if (el.children.length) ev = ev.filter(x => x[1] !== 't');
      // a change that ends where it started is noise (kind by kind)
      const live = new Set([...new Set(ev.map(x => x[1]))].filter(k => { const vals = ev.filter(x => x[1] === k); return vals[vals.length - 1][2] !== init0[k]; }));
      ev = ev.filter(x => live.has(x[1]));
      if (!ev.length) continue;
      items.push({ el, r, ev, init0 });
    }
    if (!items.length) return [];
    const firstEv = Math.min(...items.map(x => x.ev[0][0]));
    const base = TL.epoch ? TL.epoch : (TL.arrive !== undefined ? Math.min(TL.arrive, firstEv) : 0);   // nothing new ever appeared: the screen was already there
    let budget = 320;
    const out = [];
    for (const it of items) {
      if (budget <= 0) break;
      let ev = it.ev;
      if (ev.length > 40) { const step = Math.ceil(ev.length / 40); ev = ev.filter((_, i) => i % step === 0 || i === ev.length - 1); }
      ev = ev.slice(0, budget);
      budget -= ev.length;
      const init = {};
      new Set(ev.map(x => x[1])).forEach(k => { init[k] = it.init0[k]; });
      out.push({ el: it.el, json: JSON.stringify({ i: init, e: ev.map(x => [Math.max(0, x[0] - base), x[1], x[2]]) }) });
    }
    return out;
  }
  // the same, keyed by the node number tagged on the clone (data-vai-n) so a
  // snapshot taken early can be completed later, even after the screen is gone
  function timelines() {
    countdowns();
    const scope = new Set(S.nodeList);
    return buildTimelines(scope).map(x => ({ n: S.nodeList.indexOf(x.el), tl: x.json })).filter(x => x.n >= 0);
  }
  // number histories keyed by the number tagged on the clone (data-vai-n), so a
  // snapshot taken early can be completed later, even after the screen is gone
  function histories() {
    countdowns();
    return S.hists.map(h => ({ n: S.nodeList.indexOf(h.el), hist: h.hist })).filter(h => h.n >= 0);
  }
  // what differs now from when the step was snapshotted (class / style / disabled)
  function diffNodes() {
    const out = [];
    for (let n = 0; n < S.nodeList.length && out.length < 60; n++) {
      const el = S.nodeList[n], b = S.base[n];
      if (!el.isConnected) continue;
      const cls = el.getAttribute('class'), sty = el.getAttribute('style'), dis = !!el.disabled;
      if (cls === b[0] && sty === b[1] && dis === b[2]) continue;
      out.push([n, cls === b[0] ? null : (cls || ''), sty === b[1] ? null : (sty || ''), dis === b[2] ? null : dis]);
    }
    return out;
  }
  // changes whenever a stylesheet is added or gets rules (CSS-in-JS, code-split chunks)
  function cssSig() {
    let n = 0, rules = 0;
    for (const sh of document.styleSheets) { n++; try { rules += sh.cssRules.length; } catch (e) { rules += 1; } }
    return n + ':' + rules;
  }

  window.__vai = { looksPlain, pendingMove, playMedia, videoTime, hideConsent, rebase, timelines, histories, resetAnims, countdowns, diffNodes, appearances, cssSig, plan, blockBox, snapshot, controls, control, selState, hiddenCtas, signature, tick, resetAppearance, visibleCount, hasMedia, sigOf, toggleKeys };
})();
"""


def engine_js() -> str:
    return ENGINE_JS.replace("__SCROLL_LOCK__", SCROLL_LOCK_RE)
