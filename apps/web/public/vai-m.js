/*
 * First-party behaviour analytics of a cloned page.
 *
 * One small script, no third party: it follows one visit (where it came from, what the visitor looked at, clicked,
 * scrolled, watched and where it ended) and sends it to /api/track in small batches. Everything is tied to a visit
 * (sid) and a browser (vid), so the dashboard can follow a lead from the ad to the conversion.
 *
 * Never breaks the page: every entry point is wrapped, a failed send is dropped (or retried once), nothing here
 * reads what a visitor types into a field (only THAT a field was used).
 *
 * Not active on: thumbnails (?vai_preview), the owner's own visits, robots (navigator.webdriver, unless ?vai_test=1).
 */
(function () {
  'use strict';
  var cfg = window.__VAI || {};
  if (!cfg.projectId || cfg.preview || cfg.owner) return;
  var qs = new URLSearchParams(location.search);
  if (qs.get('vai_pxtest') === '1') return;          // the owner trying their pixels (see vai-e.js): not a visit
  var TEST = qs.get('vai_test') === '1';
  var BOT = !!navigator.webdriver && !TEST;
  if (BOT) return;                                   // our own test robots (the scanner, the labs) are not visitors
  var LS = null, SS = null;
  try { LS = window.localStorage; } catch (e) {}
  try { SS = window.sessionStorage; } catch (e) {}
  var now = function () { return Date.now(); };
  var rid = function (n) {
    var s = '';
    try { var a = new Uint8Array(n || 8); crypto.getRandomValues(a); for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16); return s; } catch (e) {}
    while (s.length < (n || 8) * 2) s += Math.random().toString(16).slice(2);
    return s.slice(0, (n || 8) * 2);
  };
  function store(kind, key, val) {
    var st = kind === 'l' ? LS : SS;
    try { if (val === undefined) return st && st.getItem(key); if (val === null) st && st.removeItem(key); else st && st.setItem(key, val); } catch (e) {}
  }

  /* ── who: the browser (kept for good) and the visit (30 minutes without a sign of life ends it) ── */
  // The server already wrote this visit when the page was opened and handed over its ids: the page adopts them, so what the
  // browser adds (clicks, scroll, video) lands on the same visit. Without them (older cache, no server record) it makes its own.
  var vid = cfg.vid || store('l', 'vai_vid');
  var isNew = !!cfg.fresh;
  if (!vid) { vid = rid(8); isNew = true; }
  store('l', 'vai_vid', vid);
  var SESSION_MS = 30 * 60 * 1000;
  var sess = null;
  try { sess = JSON.parse(store('l', 'vai_s') || 'null'); } catch (e) {}
  var newSession = false;
  if (cfg.sid) {
    if (!sess || sess.id !== cfg.sid || sess.p !== cfg.projectId) { sess = { id: cfg.sid, start: now(), last: now(), p: cfg.projectId, seq: 0, pv: 0 }; newSession = true; }
    sess.seq = Math.max(0, (cfg.seq || 1) - 1);                                     // the server counted this page: the next one is theirs
  } else if (!sess || !sess.id || now() - (sess.last || 0) > SESSION_MS || sess.p !== cfg.projectId) {
    sess = { id: rid(8), start: now(), last: now(), p: cfg.projectId, seq: 0, pv: 0 };
    newSession = true;
  }
  var lastCookie = 0;
  function touchSession() {
    sess.last = now(); store('l', 'vai_s', JSON.stringify(sess));
    // keep the server's cookie of this visit alive too: a full page load after a long stay is still the same visit
    if (now() - lastCookie > 10000) { lastCookie = now(); try { document.cookie = 'vai_s=' + sess.id + '.' + now() + '.' + (sess.seq || 0) + '; path=/; max-age=7200; samesite=lax'; } catch (e) {} }
  }
  touchSession();

  /* ── where the visit came from: URL parameters (kept for the whole visit), referrer, ad click ids ── */
  var attr = null;
  try { attr = newSession ? null : JSON.parse(store('l', 'vai_a') || 'null'); } catch (e) {}
  if (!attr) {
    var ref = document.referrer || '';
    var refHost = '';
    try { refHost = ref ? new URL(ref).hostname.replace(/^www\./, '') : ''; } catch (e) {}
    var own = location.hostname.replace(/^www\./, '');
    var rootOf = function (h) { return h.split('.').slice(-2).join('.'); };
    if (refHost && rootOf(refHost) === rootOf(own)) { ref = ''; refHost = ''; }       // coming from our own site is not a source
    var cid = null, cidT = null;
    ['fbclid', 'gclid', 'ttclid', 'msclkid', 'wbraid', 'gbraid', 'twclid', 'li_fat_id'].forEach(function (k) { if (!cid && qs.get(k)) { cid = qs.get(k); cidT = k; } });
    attr = {
      ref: ref.slice(0, 300), rd: refHost,
      us: qs.get('utm_source') || qs.get('src') || null, um: qs.get('utm_medium') || null, uc: qs.get('utm_campaign') || null,
      ut: qs.get('utm_content') || null, ux: qs.get('utm_term') || null,
      cid: cid ? String(cid).slice(0, 80) : null, cidt: cidT,
      land: location.pathname, host: location.host,
    };
    store('l', 'vai_a', JSON.stringify(attr));
  }

  /* ── what kind of device: sent as raw facts, the server turns them into names ── */
  function context() {
    var tz = null; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
    return {
      n: isNew ? 1 : 0, bot: BOT ? 1 : 0, ua: navigator.userAgent.slice(0, 300),
      sw: screen.width, sh: screen.height, vw: innerWidth, vh: innerHeight, dpr: window.devicePixelRatio || 1, mem: navigator.deviceMemory || 0, cores: navigator.hardwareConcurrency || 0,
      conn: navigator.connection ? { et: navigator.connection.effectiveType || '', sd: !!navigator.connection.saveData } : null, lang: (navigator.language || '').slice(0, 12), tz: tz,
      touch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0 ? 1 : 0,
      a: attr, mode: cfg.mode || 'published', host: location.host, exp: cfg.exp || null, t0: sess.start,
    };
  }

  /* ── the queue: small batches, sent when something happened and a few seconds passed, and when the page goes away ── */
  var queue = [], timer = null, sending = 0, sent = {}, sentOnce = false;
  function enqueue(item) {
    if (BOT && !TEST) { /* robots still reach the server flagged, so the dashboard can leave them out */ }
    item.ts = item.ts || now();
    queue.push(item);
    touchSession();
    if (queue.length >= 25) flush(false);
    else if (!timer) timer = setTimeout(function () { flush(false); }, sentOnce ? 4000 : 400);          // the first word is said at once: a visit that lasts a second still counts
  }
  function flush(unloading) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length) return;
    sentOnce = true;
    var items = queue.splice(0, queue.length);
    var body = JSON.stringify({ v: 1, b: rid(6), cn: now(), p: cfg.projectId, s: sess.id, vid: vid, c: context(), e: items });
    var url = '/api/track';                                                          // the endpoint every page already uses: the one a blocker is least likely to know
    try {
      if (unloading && navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
    } catch (e) {}
    try {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: true }).catch(function () {
        if (!unloading) { queue = items.concat(queue).slice(0, 200); }                   // one more try at the next flush
      });
    } catch (e) {}
  }

  /* ── pages: the first one when the script starts; funnel steps that swap in place call vaiAnalytics.page() ── */
  var pv = null;
  var bands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bandsSent = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  var activeMs = 0, lastActivity = now(), maxScroll = 0, pvClicks = 0, lastEng = 0;
  var milestones = {};
  function docHeight() { var d = document.documentElement, b = document.body; return Math.max(d.scrollHeight, b ? b.scrollHeight : 0, 1); }
  function scrollPct() { var y = window.pageYOffset || document.documentElement.scrollTop || 0; return Math.max(0, Math.min(100, Math.round((y + innerHeight) / docHeight() * 100))); }
  function curSlug() { return (window.__VAI || cfg).slug || (location.pathname.split('/').filter(Boolean).pop() || 'home'); }

  function startPage(slug) {
    if (pv) endPage('navigate');
    sess.seq = (sess.seq || 0) + 1; sess.pv = (sess.pv || 0) + 1; touchSession();
    pv = { id: sess.id + '.' + sess.seq, seq: sess.seq, slug: slug || curSlug(), path: location.pathname, t0: now() };
    bands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; bandsSent = bands.slice(); activeMs = 0; maxScroll = scrollPct(); pvClicks = 0; milestones = {}; lastEng = now();
    enqueue({ t: 'pv', id: pv.id, seq: pv.seq, slug: pv.slug, path: pv.path, title: (document.title || '').slice(0, 120), ts: pv.t0 });
  }
  function engSnapshot(final) {
    if (!pv) return null;
    var d = bands.map(function (v, i) { return v - bandsSent[i]; });
    bandsSent = bands.slice();
    return { t: final ? 'exit' : 'eng', pv: pv.id, slug: pv.slug, act: Math.round(activeMs), tot: now() - pv.t0, sc: maxScroll, ck: pvClicks, bd: d };
  }
  function heartbeat() { var s = engSnapshot(false); if (s) enqueue(s); }
  function endPage(kind) {
    var s = engSnapshot(true);
    if (s) { s.k = kind; enqueue(s); }
    pv = null;
  }
  setInterval(function () { if (pv && document.visibilityState === 'visible') heartbeat(); }, 10000);

  /* ── attention: time the tab was really in use, and which tenth of the page was on screen ── */
  ['mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'pointerdown', 'wheel'].forEach(function (ev) {
    window.addEventListener(ev, function () { lastActivity = now(); }, { passive: true, capture: true });
  });
  setInterval(function () {
    if (!pv || document.visibilityState !== 'visible') return;
    if (now() - lastActivity > 15000) return;                                       // gone for a coffee: not attention
    activeMs += 1000;
    var y = window.pageYOffset || 0;
    var mid = Math.min(0.999, Math.max(0, (y + innerHeight / 2) / docHeight()));
    bands[Math.floor(mid * 10)] += 1;
  }, 1000);

  /* ── scroll depth ── */
  var scrollTick = false;
  window.addEventListener('scroll', function () {
    if (scrollTick) return; scrollTick = true;
    setTimeout(function () {
      scrollTick = false;
      var p = scrollPct();
      if (p > maxScroll) maxScroll = p;
      [25, 50, 75, 90, 100].forEach(function (m) {
        if (maxScroll >= m && !milestones[m] && pv) { milestones[m] = 1; enqueue({ t: 'ev', k: 'scroll', slug: pv.slug, d: { pct: m } }); }
      });
    }, 150);
  }, { passive: true });

  /* ── clicks: where, on what, whether anything answered, whether the visitor was hammering ── */
  function cssPath(el) {
    var parts = [], n = el, depth = 0;
    while (n && n.nodeType === 1 && n !== document.body && n !== document.documentElement && depth < 9) {
      var tag = n.tagName.toLowerCase();
      if (n.id && /^[A-Za-z][\w-]{1,40}$/.test(n.id) && document.querySelectorAll('#' + CSS.escape(n.id)).length === 1) { parts.unshift('#' + n.id); break; }
      var i = 1, sib = n;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === n.tagName) i++;
      parts.unshift(tag + (i > 1 || (n.nextElementSibling && n.nextElementSibling.tagName === n.tagName) ? ':nth-of-type(' + i + ')' : ''));
      n = n.parentElement; depth++;
    }
    return parts.join('>').slice(0, 240);
  }
  var INTERACTIVE = 'a[href],button,input,select,textarea,label,summary,[role=button],[role=link],[role=tab],[role=menuitem],[onclick],[data-vai-next],[data-vai-href],[data-vai-select],[data-vai-mx],[data-vai-toggle-btn],[aria-expanded],[tabindex]';
  function interactiveAncestor(el) { try { return el.closest ? el.closest(INTERACTIVE) : null; } catch (e) { return null; } }
  function looksCta(el) {
    if (!el) return false;
    var tag = el.tagName;
    var isBtn = tag === 'BUTTON' || tag === 'A' || (tag === 'INPUT' && /submit|button/i.test(el.type)) || el.getAttribute('role') === 'button' || el.hasAttribute('data-vai-next') || el.hasAttribute('data-vai-href');
    if (!isBtn) return false;
    if (el.closest('nav, header, footer, [role=navigation]') && !/btn|button|cta/i.test(String(el.className))) return false;
    var txt = (el.innerText || el.value || '').trim();
    return /btn|button|cta/i.test(String(el.className)) || el.hasAttribute('data-vai-next') || el.hasAttribute('data-vai-href') || (txt.length > 1 && txt.length <= 48);
  }
  var recent = [];
  function onClick(e) {
    try {
      if (!pv) return;
      var raw = (e.composedPath && e.composedPath()[0]) || e.target;
      if (!raw || raw.nodeType !== 1) raw = raw && raw.parentElement;
      if (!raw) return;
      var act = interactiveAncestor(raw) || raw;
      var r = act.getBoundingClientRect();
      var pw = Math.max(r.width, 1), ph = Math.max(r.height, 1);
      var t = now();
      var item = {
        t: 'ck', slug: pv.slug, ts: t, sel: cssPath(act), tag: act.tagName.toLowerCase(),
        tx: (act.innerText || act.value || act.getAttribute('alt') || act.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        href: (act.tagName === 'A' ? String(act.href || '') : (act.getAttribute('data-vai-href') || act.getAttribute('data-vai-next') || '')).slice(0, 220) || null,
        x: Math.round(e.pageX), y: Math.round(e.pageY), dw: document.documentElement.scrollWidth, dh: docHeight(), vw: innerWidth, vh: innerHeight,
        ox: Math.max(0, Math.min(1000, Math.round((e.clientX - r.left) / pw * 1000))), oy: Math.max(0, Math.min(1000, Math.round((e.clientY - r.top) / ph * 1000))),
        cta: looksCta(act) ? 1 : 0, vi: act.closest && act.closest('[data-vai-player],video') ? 1 : 0,
      };
      pvClicks++;
      // hammering: 3+ presses within a second in the same few pixels
      recent = recent.filter(function (c) { return t - c.t < 1000; });
      recent.push({ t: t, x: item.x, y: item.y });
      var near = recent.filter(function (c) { return Math.abs(c.x - item.x) < 32 && Math.abs(c.y - item.y) < 32; });
      if (near.length >= 3) item.rage = 1;
      enqueue(item);
      if (item.rage) enqueue({ t: 'ev', k: 'rage', slug: item.slug, d: { sel: item.sel, tx: item.tx } });
      // did anything answer? watch for a moment; if nothing did, say so afterwards (the click itself is already on its way)
      var link = act.tagName === 'A' && act.getAttribute('href') && !/^#/.test(act.getAttribute('href'));
      var form = /^(INPUT|SELECT|TEXTAREA|LABEL|SUMMARY|OPTION)$/.test(act.tagName);
      if (link || form) return;
      var changed = false, mo = null;
      try {
        mo = new MutationObserver(function () { changed = true; });
        mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      } catch (x) {}
      var y0 = window.pageYOffset, u0 = location.href;
      var pointer = false; try { pointer = getComputedStyle(act).cursor === 'pointer'; } catch (x) {}
      var looksClickable = pointer || !!interactiveAncestor(raw) || /^(IMG|SVG|BUTTON)$/i.test(act.tagName);
      setTimeout(function () {
        if (mo) mo.disconnect();
        try {
          var moved = Math.abs((window.pageYOffset || 0) - y0) > 4 || location.href !== u0;
          var sel = window.getSelection && String(window.getSelection() || '').length > 0;     // selecting text is an answer too
          if (!changed && !moved && !sel && looksClickable) enqueue({ t: 'ev', k: 'dead', slug: item.slug, d: { sel: item.sel, tx: item.tx, at: item.ts } });
        } catch (x) {}
      }, 700);
    } catch (x) {}
  }
  document.addEventListener('click', onClick, true);

  /* ── forms: that a field was used (never what was typed), and that it was sent ── */
  var formsStarted = {};
  document.addEventListener('focusin', function (e) {
    var el = e.target; if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || /^(hidden|submit|button|checkbox|radio)$/i.test(el.type || '')) return;
    var f = el.form; var key = (f && (f.id || f.getAttribute('name') || f.action)) || 'form';
    if (formsStarted[key] || !pv) return; formsStarted[key] = 1;
    enqueue({ t: 'ev', k: 'form_start', slug: pv.slug, d: { form: String(key).slice(0, 60), field: String(el.name || el.type || '').slice(0, 40) } });
  }, true);
  document.addEventListener('submit', function (e) {
    var f = e.target; if (!f || !pv) return;
    enqueue({ t: 'ev', k: 'form_submit', slug: pv.slug, d: { form: String(f.id || f.getAttribute('name') || f.action || 'form').slice(0, 60) } });
    flush(false);
  }, true);

  /* ── links that leave the site, phone / mail / whatsapp ── */
  document.addEventListener('click', function (e) {
    try {
      var a = e.target && e.target.closest && e.target.closest('a[href]'); if (!a || !pv) return;
      var h = a.href || '';
      if (/^(tel:|mailto:|sms:)/i.test(h) || /wa\.me|whatsapp|t\.me\//i.test(h)) enqueue({ t: 'ev', k: 'contact', slug: pv.slug, d: { href: h.slice(0, 160) } });
      else if (/^https?:/i.test(h) && a.hostname && a.hostname.replace(/^www\./, '') !== location.hostname.replace(/^www\./, '')) { enqueue({ t: 'ev', k: 'outbound', slug: pv.slug, d: { href: h.slice(0, 200), host: a.hostname } }); flush(false); }
    } catch (x) {}
  }, true);

  /* ── video: which seconds were really played (seeks leave gaps), for a retention curve second by second ── */
  var videos = [];
  function videoKey(v) {
    var host = v.closest && v.closest('[data-vai-player]');
    if (host) { try { var c = JSON.parse(host.getAttribute('data-vai-player') || '{}'); if (c.src || c.embed) return String(c.src || c.embed).slice(0, 200); } catch (x) {} }
    return String(v.currentSrc || v.src || 'video').slice(0, 200);
  }
  function mergeRanges(r) {
    r.sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    r.forEach(function (x) { var l = out[out.length - 1]; if (l && x[0] <= l[1] + 1) l[1] = Math.max(l[1], x[1]); else out.push([x[0], x[1]]); });
    return out;
  }
  function watchVideo(v) {
    if (v.__vaiWatched) return; v.__vaiWatched = 1;
    var st = { src: videoKey(v), ranges: [], plays: 0, last: null, start: null, max: 0, ended: false, dirty: false, t0: null };
    videos.push(st);
    function key() { if (!st.src) st.src = videoKey(v); return st.src; }
    function dur() { return isFinite(v.duration) ? Math.round(v.duration) : 0; }
    function close() {
      if (st.start !== null && st.last !== null && st.last >= st.start) { st.ranges.push([Math.floor(st.start), Math.ceil(st.last)]); st.ranges = mergeRanges(st.ranges); st.dirty = true; }
      st.start = null; st.last = null;
    }
    function report(force) {
      if (!st.dirty && !force) return;
      var rs = st.ranges.slice();
      if (st.start !== null && st.last !== null) rs.push([Math.floor(st.start), Math.ceil(st.last)]);
      rs = mergeRanges(rs);
      st.dirty = false;
      enqueue({ t: 'vd', slug: pv ? pv.slug : curSlug(), src: key(), dur: dur(), plays: st.plays, rg: rs.slice(0, 60), mx: Math.round(st.max), end: st.ended ? 1 : 0, at: Math.round(v.currentTime || 0) });
    }
    v.addEventListener('play', function () { if (st.t0 === null) st.t0 = now(); }, true);
    v.addEventListener('playing', function () { if (!st.playing) { st.playing = 1; st.plays++; st.dirty = true; if (pv) enqueue({ t: 'ev', k: 'video_play', slug: pv.slug, d: { src: key(), at: Math.round(v.currentTime || 0) } }); } if (st.start === null) { st.start = v.currentTime; st.last = v.currentTime; } }, true);
    v.addEventListener('timeupdate', function () {
      var t = v.currentTime || 0;
      if (v.paused && !v.ended) return;
      if (st.start === null) { st.start = t; st.last = t; }
      else if (t >= st.last && t - st.last < 2.5) st.last = t;                       // played on
      else { close(); st.start = t; st.last = t; }                                   // jumped: a new stretch
      if (t > st.max) st.max = t;
    }, true);
    v.addEventListener('seeking', function () { close(); st.playing = 0; }, true);
    v.addEventListener('pause', function () { close(); st.playing = 0; report(true); }, true);
    v.addEventListener('ended', function () { st.ended = true; close(); st.playing = 0; report(true); }, true);
    setInterval(function () { if (st.start !== null) { st.dirty = true; report(false); } }, 10000);
    st.flush = function () { close(); report(false); };
  }
  /* a video was on the screen (the denominator of "how many pressed play"): once per page view and video */
  var seenKeys = {}, io = null;
  function seen(el, key) {
    if (!pv) return;
    var id = pv.id + '|' + key;
    if (seenKeys[id] || el.__vaiSeenWatch) return;
    el.__vaiSeenWatch = 1;
    var fire = function () { if (!pv || seenKeys[pv.id + '|' + key]) return; seenKeys[pv.id + '|' + key] = 1; enqueue({ t: 'ev', k: 'video_seen', slug: pv.slug, d: { src: key } }); };
    if (!('IntersectionObserver' in window)) { fire(); return; }
    if (!io) io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && e.target.__vaiSeenFire) { var f = e.target.__vaiSeenFire; io.unobserve(e.target); f(); } }); }, { threshold: 0.3 });
    el.__vaiSeenFire = fire;
    io.observe(el);
  }
  function scanVideos() {
    try {
      Array.prototype.forEach.call(document.querySelectorAll('[data-vai-player]'), function (h) {
        var c = {}; try { c = JSON.parse(h.getAttribute('data-vai-player') || '{}'); } catch (x) {}
        var k = String(c.src || c.embed || '').slice(0, 200);
        if (k) seen(h, k);
      });
      Array.prototype.forEach.call(document.querySelectorAll('video'), function (v) {
        var host = v.closest('[data-vai-player]');
        if (host) { if (v.classList.contains('vai-pl-main')) watchVideo(v); return; }       // the player's own cover clip is not the video
        if (v.loop && (v.muted || v.hasAttribute('muted'))) return;                          // a background clip
        seen(v, videoKey(v));
        watchVideo(v);
      });
    } catch (x) {}
  }
  try { new MutationObserver(function () { scanVideos(); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (x) {}

  /* ── leaving ── */
  var left = false;
  function leave(kind) {
    if (left) return; left = true;
    videos.forEach(function (s) { try { s.flush(); } catch (x) {} });
    endPage(kind || 'leave');
    flush(true);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { videos.forEach(function (s) { try { s.flush(); } catch (x) {} }); heartbeat(); flush(true); left = false; }
  });
  window.addEventListener('pagehide', function () { leave('leave'); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) { left = false; startPage(); } });

  /* ── what the rest of the runtime can say to analytics ── */
  window.vaiAnalytics = {
    ids: function () { return { sid: sess.id, vid: vid }; },
    page: function (slug) {
      left = false;
      videos.forEach(function (s) { try { s.flush(); } catch (x) {} });   // what was watched belongs to the page that is being left
      videos = [];
      startPage(slug);
      scanVideos();
    },
    lead: function () { if (pv) { enqueue({ t: 'ev', k: 'lead', slug: pv.slug, d: {} }); flush(false); } },
    track: function (name, props) { if (pv && name) enqueue({ t: 'ev', k: 'custom', slug: pv.slug, d: { name: String(name).slice(0, 60), props: props && typeof props === 'object' ? props : undefined } }); },
    flush: function () { flush(false); },
    // the player reports its own events; an embedded video (an iframe) has no clock to read, so only its start is known
    video: function (src, e) { if (e === 'play' && pv && !videos.some(function (v) { return v.src === String(src).slice(0, 200); })) enqueue({ t: 'ev', k: 'video_play', slug: pv.slug, d: { src: String(src).slice(0, 200), embed: 1, at: 0 } }); },
  };

  /* ── how fast the page really was for this person (the numbers Google calls Core Web Vitals) ── */
  var vit = { lcp: 0, fcp: 0, cls: 0, ttfb: 0, load: 0 }, vitSent = false;
  try {
    var nav = performance.getEntriesByType('navigation')[0];
    if (nav) vit.ttfb = Math.round(nav.responseStart);
    new PerformanceObserver(function (l) { var e = l.getEntries(); if (e.length) vit.lcp = Math.round(e[e.length - 1].startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (e.name === 'first-contentful-paint') vit.fcp = Math.round(e.startTime); }); }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) vit.cls += e.value; }); }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
  function sendVitals() {
    if (vitSent || !pv) return;
    try { var nv = performance.getEntriesByType('navigation')[0]; if (nv && nv.loadEventEnd > 0) vit.load = Math.round(nv.loadEventEnd); } catch (e) {}
    if (!vit.lcp && !vit.fcp && !vit.load) return;
    vitSent = true;
    enqueue({ t: 'ev', k: 'vitals', slug: pv.slug, d: { lcp: vit.lcp, fcp: vit.fcp, ttfb: vit.ttfb, load: vit.load, cls: Math.round(vit.cls * 1000) / 1000 } });
    if (document.visibilityState === 'hidden') flush(true);
  }
  setTimeout(sendVitals, 5500);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') sendVitals(); });

  startPage();
  scanVideos();
  heartbeatSoon();
  function heartbeatSoon() { setTimeout(function () { if (pv) heartbeat(); }, 2500); }

  /* ── session recording (rrweb), only for the share of visits the project asked for ── */
  var rec = cfg.rec;
  if (rec && rec.on && !BOT) {
    var sampled = store('s', 'vai_rec');
    if (sampled === null || sampled === undefined) { sampled = Math.random() < (rec.sample == null ? 1 : rec.sample) ? '1' : '0'; store('s', 'vai_rec', sampled); }
    if (sampled === '1') startRecording();
  }
  function startRecording() {
    var s = document.createElement('script');
    s.src = '/vendor/r.js';
    s.async = true;
    s.onload = function () {
      try {
        var R = window.rrweb, rrweb = window.rrwebRecord || (R && (typeof R.record === 'function' ? R.record : (typeof R === 'function' ? R : (R.default && R.default.record))));
        if (!rrweb) return;
        var buf = [], seq = 0, bytes = 0, stopped = false, started = now();
        var send = function (final) {
          if (!buf.length) return;
          var events = buf.splice(0, buf.length);
          var n = seq++;
          var meta = '?p=' + encodeURIComponent(cfg.projectId) + '&s=' + encodeURIComponent(sess.id) + '&n=' + n + '&t=' + started + '&w=' + innerWidth + '&h=' + innerHeight + '&d=' + encodeURIComponent(device()) + (final ? '&f=1' : '');
          var json = JSON.stringify(events);
          bytes += json.length;
          var post = function (body, enc) {
            try {
              if (final && navigator.sendBeacon && navigator.sendBeacon('/api/track/r' + meta, new Blob([body], { type: enc === 'gz' ? 'application/octet-stream' : 'text/plain' }))) return;
              fetch('/api/track/r' + meta, { method: 'POST', headers: { 'Content-Type': enc === 'gz' ? 'application/octet-stream' : 'text/plain', 'X-Vai-Enc': enc }, body: body, keepalive: true }).catch(function () {});
            } catch (x) {}
          };
          if (typeof CompressionStream === 'function' && !final) {
            try {
              new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob().then(function (b) { post(b, 'gz'); }, function () { post(json, 'raw'); });
              return;
            } catch (x) {}
          }
          post(json, 'raw');
        };
        var stop = rrweb({
          emit: function (ev) { if (stopped) return; buf.push(ev); if (buf.length >= 150) send(false); if (bytes > 3000000 || now() - started > 25 * 60 * 1000) { stopped = true; send(true); try { stop && stop(); } catch (x) {} } },
          maskAllInputs: true, inlineStylesheet: false, recordCanvas: false, blockClass: 'vai-private', maskTextClass: 'vai-mask',
          sampling: { mousemove: 80, scroll: 150, input: 'last' },
          checkoutEveryNms: 180000,
        });
        setInterval(function () { send(false); }, 8000);
        window.addEventListener('pagehide', function () { send(true); });
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') send(true); });
      } catch (x) {}
    };
    document.head.appendChild(s);
  }
  function device() { return innerWidth < 768 ? 'mobile' : innerWidth < 1100 ? 'tablet' : 'desktop'; }
})();
