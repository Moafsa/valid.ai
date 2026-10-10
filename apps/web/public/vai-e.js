/*
 * Pixels & events of a published page: Meta Pixel, Google Analytics 4, Google Ads, TikTok Pixel, Google Tag Manager and custom scripts.
 *
 * The one rule: the pixel is optional. Nothing in here may ever stop the page from working: every entry point is wrapped, a script that
 * does not load (blocker, network, wrong id) is just reported as blocked, and the page never waits for any of it.
 *
 * What it does: loads the vendors' own libraries (after consent, when the project asks for it), listens to what the page does
 * (a step was seen, a lead was captured, a button was pressed, a video played) and tells each integration the event it expects. Then it
 * checks the browser really sent the request and reports what happened to /api/track, so the dashboard can say "sent", "not confirmed"
 * or "blocked" instead of assuming. Nothing the visitor typed is ever read.
 *
 * Config comes from window.__VAI_PX (written by the server for this project). ?vai_pxtest=1 opens the page in test mode: a small panel
 * lists every event and its state, and nothing is counted in the metrics.
 */
(function () {
  'use strict';
  try {
    var P = window.__VAI_PX;
    var V = window.__VAI || {};
    if (!P || !P.integrations || !P.integrations.length || !P.p) return;
    if (V.preview || V.owner) return;
    var qs;
    try { qs = new URLSearchParams(location.search); } catch (e) { qs = { get: function () { return null; } }; }
    var TEST = qs.get('vai_pxtest') === '1';
    if (navigator.webdriver && !TEST && qs.get('vai_test') !== '1') return;      // our own test robots are not visitors

    var LS = null, SS = null;
    try { LS = window.localStorage; } catch (e) {}
    try { SS = window.sessionStorage; } catch (e) {}
    var now = function () { return Date.now(); };
    var safe = function (fn) { return function () { try { return fn.apply(this, arguments); } catch (e) {} }; };
    function rid(n) { var s = ''; while (s.length < n) s += Math.random().toString(36).slice(2); return s.slice(0, n); }
    function get(st, k) { try { return st ? st.getItem(k) : null; } catch (e) { return null; } }
    function put(st, k, v) { try { if (st) st.setItem(k, v); } catch (e) {} }

    /* ───── who: the visit the server wrote (or one of our own when it did not) ───── */
    function sid() {
      var w = window.__VAI || V;
      if (w.sid) return String(w.sid);
      try { if (window.vaiAnalytics && window.vaiAnalytics.ids) return String(window.vaiAnalytics.ids().sid); } catch (e) {}
      var own = get(SS, 'vai_psid');
      if (!own) { own = 'p' + rid(10); put(SS, 'vai_psid', own); }
      return own;
    }
    function slug() { var w = window.__VAI || V; return String(w.slug || (location.pathname.split('/').filter(Boolean).pop() || 'home')).replace(/__m$/, ''); }

    /* ───── once-only guards: in memory, and for the whole visit in this tab ───── */
    var done = {};
    var doneStore = {};
    try { doneStore = JSON.parse(get(SS, 'vai_pxd') || '{}') || {}; } catch (e) {}
    function once(key, perVisit) {
      if (done[key] || (perVisit && doneStore[key])) return false;
      done[key] = 1;
      if (perVisit) { doneStore[key] = 1; var ks = Object.keys(doneStore); if (ks.length > 300) delete doneStore[ks[0]]; put(SS, 'vai_pxd', JSON.stringify(doneStore)); }
      return true;
    }

    /* ───── the project's events and their triggers ───── */
    var EV = {};
    P.events.forEach(function (e) { EV[e.id] = e; });
    var byKind = function (k) { return P.events.filter(function (e) { return e.kind === k; }); };

    /* ───── what each vendor is told (keep in step with vendorName in lib/pixels.ts) ───── */
    function nameFor(type, ev, entry, sub) {
      if (entry && entry.name) return entry.name;
      var k = ev.kind;
      var T = {
        META_PIXEL: { pageview: 'PageView', cta: 'CTA_Click', lead: 'Lead', checkout: 'InitiateCheckout', purchase: 'Purchase', video: sub === '50' ? 'Video50' : sub === 'end' ? 'VideoComplete' : 'VideoPlay', custom: ev.name },
        GOOGLE_ANALYTICS: { pageview: 'page_view', cta: 'cta_click', lead: 'generate_lead', checkout: 'begin_checkout', purchase: 'purchase', video: sub === '50' ? 'video_progress' : sub === 'end' ? 'video_complete' : 'video_start', custom: ev.name },
        TIKTOK_PIXEL: { pageview: 'Pageview', cta: 'ClickButton', lead: 'SubmitForm', checkout: 'InitiateCheckout', purchase: 'CompletePayment', video: sub === '50' ? 'Video50' : sub === 'end' ? 'VideoComplete' : 'VideoPlay', custom: ev.name },
        GTM: { pageview: 'vai_page_view', cta: 'vai_cta_click', lead: 'vai_lead', checkout: 'vai_checkout', purchase: 'vai_purchase', video: sub === '50' ? 'vai_video_50' : sub === 'end' ? 'vai_video_complete' : 'vai_video_start', custom: ev.name },
      };
      if (type === 'GOOGLE_TAG') return 'conversion';
      if (type === 'CUSTOM') return ev.id;
      return (T[type] && T[type][k]) || ev.name;
    }
    // the request each vendor's library makes when it really sends something
    var NET = {
      META_PIXEL: /facebook\.com\/tr\/?\?|facebook\.net\/.+\/tr\b/i,
      GOOGLE_ANALYTICS: /google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect|googletagmanager\.com\/g\/collect/i,
      GOOGLE_TAG: /googleadservices\.com\/pagead\/conversion|google\.com\/pagead\/1p-conversion|googleads\.g\.doubleclick\.net\/pagead|google\.com\/ccm\/collect/i,
      TIKTOK_PIXEL: /analytics\.tiktok\.com\/api\/v2\/pixel|analytics-ipv6\.tiktokw\.us|business-api\.tiktok\.com/i,
      GTM: /googletagmanager\.com\/gtm\.js/i,
    };
    try { if (performance.setResourceTimingBufferSize) performance.setResourceTimingBufferSize(1500); } catch (e) {}

    /* ───── libraries: each one loaded once, a failure is only remembered ───── */
    var lib = {};      // key -> { failed: bool, loaded: bool }
    function loadScript(key, src, cb) {
      if (lib[key]) return lib[key];
      var st = lib[key] = { failed: false, loaded: false };
      try {
        var s = document.createElement('script');
        s.async = true; s.src = src;
        s.onload = function () { st.loaded = true; if (cb) safe(cb)(); };
        s.onerror = function () { st.failed = true; };
        (document.head || document.documentElement).appendChild(s);
      } catch (e) { st.failed = true; }
      return st;
    }
    var gtagBooted = false;
    function gtagBoot(firstId) {
      window.dataLayer = window.dataLayer || [];
      if (!window.gtag) window.gtag = function () { window.dataLayer.push(arguments); };
      if (!gtagBooted) { gtagBooted = true; window.gtag('js', new Date()); loadScript('gtag', 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(firstId)); }
      return lib.gtag;
    }
    var booted = {};
    function boot(ig) {
      if (booted[ig.id]) return;
      booted[ig.id] = true;
      try {
        if (ig.type === 'META_PIXEL') {
          if (!window.fbq) {
            var n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
            if (!window._fbq) window._fbq = n;
            n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
          }
          loadScript('meta', 'https://connect.facebook.net/en_US/fbevents.js');
          window.fbq('set', 'autoConfig', false, ig.pixelId);            // no automatic events: only the ones listed in the panel (no duplicates)
          window.fbq('init', ig.pixelId);
        } else if (ig.type === 'GOOGLE_ANALYTICS') {
          gtagBoot(ig.pixelId); window.gtag('config', ig.pixelId, { send_page_view: false });
        } else if (ig.type === 'GOOGLE_TAG') {
          gtagBoot(ig.pixelId); window.gtag('config', ig.pixelId, { send_page_view: false });
        } else if (ig.type === 'TIKTOK_PIXEL') {
          var w = window, t = 'ttq';
          w.TiktokAnalyticsObject = t;
          var q = w[t] = w[t] || [];
          if (!q.load) {
            q.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
            q.setAndDefer = function (o, m) { o[m] = function () { o.push([m].concat(Array.prototype.slice.call(arguments, 0))); }; };
            for (var i = 0; i < q.methods.length; i++) q.setAndDefer(q, q.methods[i]);
            q.instance = function (id) { var inst = q._i[id] || []; for (var j = 0; j < q.methods.length; j++) q.setAndDefer(inst, q.methods[j]); return inst; };
            q.load = function (id) { q._i = q._i || {}; q._i[id] = []; q._i[id]._u = 'https://analytics.tiktok.com/i18n/pixel/events.js'; q._t = q._t || {}; q._t[id] = +new Date(); q._o = q._o || {}; q._o[id] = {}; loadScript('tiktok', 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + encodeURIComponent(id) + '&lib=' + t); };
          }
          q.load(ig.pixelId);
        } else if (ig.type === 'GTM') {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({ 'gtm.start': now(), event: 'gtm.js' });
          loadScript('gtm_' + ig.pixelId, 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(ig.pixelId));
        } else if (ig.type === 'CUSTOM') {
          bootCustom(ig);
        }
      } catch (e) { (lib['boot_' + ig.id] = { failed: true }); }
    }
    // a custom script: what the person pasted, with or without <script> tags, appended so that it runs. A script that throws only logs.
    function bootCustom(ig) {
      var st = lib['custom_' + ig.id] = { failed: false, loaded: true };
      var code = String(ig.code || '');
      var tpl = document.createElement('template');
      tpl.innerHTML = /<\s*script[\s>]/i.test(code) ? code : '';
      var scripts = tpl.content ? tpl.content.querySelectorAll('script') : [];
      var host = document.body || document.documentElement;
      if (!scripts.length) {
        if (/<\s*script[\s>]/i.test(code)) { st.failed = true; return; }
        var raw = document.createElement('script'); raw.text = code; host.appendChild(raw); return;
      }
      Array.prototype.forEach.call(scripts, function (old) {
        var s = document.createElement('script');
        Array.prototype.forEach.call(old.attributes, function (a) { try { s.setAttribute(a.name, a.value); } catch (e) {} });
        if (old.src) { s.onerror = function () { st.failed = true; }; } else s.text = old.text;
        host.appendChild(s);
      });
    }
    function failed(ig) {
      if (ig.type === 'META_PIXEL') return !!(lib.meta && lib.meta.failed);
      if (ig.type === 'GOOGLE_ANALYTICS' || ig.type === 'GOOGLE_TAG') return !!(lib.gtag && lib.gtag.failed);
      if (ig.type === 'TIKTOK_PIXEL') return !!(lib.tiktok && lib.tiktok.failed);
      if (ig.type === 'GTM') return !!(lib['gtm_' + ig.pixelId] && lib['gtm_' + ig.pixelId].failed);
      if (ig.type === 'CUSTOM') return !!(lib['custom_' + ig.id] && lib['custom_' + ig.id].failed);
      return !!lib['boot_' + ig.id];
    }

    /* ───── reporting: what happened, written down after the browser had time to send ───── */
    var out = [], timer = null, pending = [];
    function flush(unloading) {
      if (timer) { clearTimeout(timer); timer = null; }
      if (unloading) {                                              // what was not resolved yet is "fired": the page left before we could see
        pending.forEach(function (r) { if (!r.resolved) { r.resolved = true; r.st = 'fired'; out.push(r.rec); } });
        pending = [];
      }
      if (!out.length) return;
      var items = out.splice(0, out.length);
      var body = JSON.stringify({ px: 1, p: P.p, s: sid(), test: TEST ? 1 : 0, e: items.map(function (r) { return { i: r.i, tid: r.tid, n: r.n, k: r.k, s: r.s, v: r.v, c: r.c, st: r.st, dd: r.dd }; }) });
      try { if (unloading && navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([body], { type: 'text/plain' }))) return; } catch (e) {}
      try { fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: true }).catch(function () {}); } catch (e) {}
    }
    function queue(rec) {
      out.push(rec);
      if (TEST) panelUpdate(rec);
      if (out.length >= 20) flush(false); else if (!timer) timer = setTimeout(function () { flush(false); }, 1200);
    }
    function netSeen(type, since, name) {
      var rx = NET[type]; if (!rx) return false;
      try {
        var es = performance.getEntriesByType('resource');
        for (var i = es.length - 1; i >= 0; i--) {
          var e = es[i];
          if (e.startTime < since - 30) break;
          if (!rx.test(e.name)) continue;
          if (e.responseStatus >= 400) continue;                       // the vendor answered with an error: that is not a delivered event
          if (type === 'META_PIXEL' && name && /[?&]ev=/.test(e.name) && e.name.indexOf('ev=' + encodeURIComponent(name)) < 0 && e.name.indexOf('ev=' + name) < 0) continue;
          return true;
        }
      } catch (e) {}
      return false;
    }
    // after the call: look for the request the vendor's library makes; a few seconds is enough for it to leave the browser
    function track(rec, ig, name) {
      var t0 = performance.now(), r = { rec: rec, resolved: false, st: 'fired' };
      pending.push(r);
      if (TEST) panelUpdate(rec);
      var finish = function () {
        if (r.resolved) return;
        r.resolved = true;
        var gtm = ig.type === 'GTM' && ((lib['gtm_' + ig.pixelId] && lib['gtm_' + ig.pixelId].loaded) || netSeen('GTM', 0));    // the container is loaded once, not per event
        rec.st = failed(ig) ? 'blocked' : (ig.type === 'CUSTOM' ? 'fired' : (gtm || (ig.type !== 'GTM' && netSeen(ig.type, t0, name)) ? 'sent' : 'unconfirmed'));
        if (ig.type === 'CUSTOM' && !failed(ig)) rec.st = 'sent';           // all that can be known of a custom script is that it was loaded and told
        pending = pending.filter(function (x) { return x !== r; });
        queue(rec);
      };
      setTimeout(safe(finish), 4500);
    }

    /* ───── firing ───── */
    function valueFor(ev, ctx) {
      if (ctx && typeof ctx.value === 'number') return ctx.value;
      if (ev.valueParam) { var raw = qs.get(ev.valueParam); if (raw) { var n = parseFloat(String(raw).replace(',', '.')); if (isFinite(n) && n >= 0) return n; } }
      return typeof ev.value === 'number' ? ev.value : null;
    }
    function callVendor(ig, ev, name, entry, value, ctx) {
      var cur = P.currency || 'BRL';
      var withValue = function (o) { if (value !== null && value !== undefined) { o.value = value; o.currency = cur; } return o; };
      var evId = ev.id + ':' + (ctx.dd || '');
      switch (ig.type) {
        case 'META_PIXEL': {
          var std = /^(PageView|Lead|InitiateCheckout|Purchase|ViewContent|Contact|CompleteRegistration|AddToCart|Search|Subscribe|SubmitApplication|Schedule|StartTrial|AddPaymentInfo|AddToWishlist|FindLocation|CustomizeProduct|Donate)$/.test(name);
          window.fbq(std ? 'trackSingle' : 'trackSingleCustom', ig.pixelId, name, withValue({}), { eventID: evId });
          break;
        }
        case 'GOOGLE_ANALYTICS': {
          var p = withValue({ send_to: ig.pixelId });
          if (ev.kind === 'pageview') { p.page_title = document.title; p.page_location = location.href; p.page_path = location.pathname; }
          if (ev.kind === 'purchase') p.transaction_id = evId;
          if (ev.kind === 'video') { p.video_percent = ctx.sub === '50' ? 50 : ctx.sub === 'end' ? 100 : 0; }
          window.gtag('event', name, p);
          break;
        }
        case 'GOOGLE_TAG': {
          if (!entry || !entry.label) return 'nolabel';
          window.gtag('event', 'conversion', withValue({ send_to: ig.pixelId + '/' + entry.label, transaction_id: ev.kind === 'purchase' ? evId : '' }));
          break;
        }
        case 'TIKTOK_PIXEL': {
          var inst = window.ttq && window.ttq.instance ? window.ttq.instance(ig.pixelId) : window.ttq;
          if (ev.kind === 'pageview') inst.page(); else inst.track(name, withValue({ event_id: evId }));
          break;
        }
        case 'GTM': {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push(withValue({ event: name, vai_event: ev.id, vai_slug: ctx.slug, vai_event_id: evId }));
          break;
        }
        case 'CUSTOM': {
          window.dispatchEvent(new CustomEvent('vai:pixel', { detail: withValue({ event: ev.id, name: ev.name, kind: ev.kind, slug: ctx.slug, sub: ctx.sub || null }) }));
          break;
        }
      }
      return 'ok';
    }

    var started = false, waitingPageview = null;
    function emit(evId, ctx) {
      try {
        var ev = EV[evId]; if (!ev) return;
        ctx = ctx || {};
        ctx.slug = ctx.slug || slug();
        if (!started) { if (ev.kind === 'pageview') waitingPageview = ctx; return; }
        var value = valueFor(ev, ctx);
        P.integrations.forEach(function (ig) {
          var entry = ig.map && ig.map[evId];
          if (!entry || !entry.on) return;
          var dd = (ctx.dd || ev.id) + (ctx.sub ? ':' + ctx.sub : '') + '|' + ctx.slug;
          if (!once('x|' + ig.id + '|' + dd + '|' + (ctx.perVisit ? '' : (ctx.arrival || 0)), !!ctx.perVisit)) return;
          var name = nameFor(ig.type, ev, entry, ctx.sub);
          var rec = { i: ig.type, tid: ig.id, n: name, k: ev.id, s: ctx.slug, v: value === null ? undefined : value, c: value === null ? undefined : (P.currency || 'BRL'), st: 'fired', dd: dd };
          boot(ig);
          if (failed(ig)) { rec.st = 'blocked'; queue(rec); return; }
          var res = 'ok';
          try { res = callVendor(ig, ev, name, entry, value, { slug: ctx.slug, sub: ctx.sub, dd: dd }); } catch (e) { rec.st = 'blocked'; queue(rec); return; }
          if (res === 'nolabel') return;                                       // Google Ads: no conversion label for this event, nothing to send
          track(rec, ig, name);
        });
      } catch (e) {}
    }

    /* ───── what the page does ───── */
    var arrival = 0;
    var lastArrive = { s: '', t: 0 };
    function arrive(sl) {
      var cur = sl || slug();
      if (lastArrive.s === cur && now() - lastArrive.t < 1500) return;          // the same page announced twice in a moment is one arrival
      lastArrive = { s: cur, t: now() };
      arrival++;
      sawView = true;
      var ctx = { slug: sl || slug(), arrival: arrival };
      byKind('pageview').forEach(function (e) { emit(e.id, { slug: ctx.slug, arrival: arrival, dd: 'pv' }); });
      // a page that IS the goal (the thank-you step of a purchase, a custom page event)
      P.events.forEach(function (e) {
        if (e.trigger && e.trigger.type === 'page' && e.trigger.match && String(e.trigger.match).replace(/__m$/, '') === ctx.slug) emit(e.id, { slug: ctx.slug, perVisit: e.kind === 'purchase', dd: e.id });
      });
    }
    var sawView = false;
    function onBus(d) {
      if (!d) return;
      if (d.t === 'view') arrive(d.slug);
      else if (d.t === 'lead') byKind('lead').forEach(function (e) { emit(e.id, { perVisit: true, dd: 'lead' }); });
    }
    window.addEventListener('vai:bus', safe(function (e) { onBus(e.detail); }));

    var INTERACTIVE = 'a[href],button,input[type=submit],input[type=button],[role=button],[data-vai-next],[data-vai-href]';
    function actOn(t) { try { while (t && t.nodeType !== 1) t = t.parentNode; return t && t.closest ? t.closest(INTERACTIVE) : null; } catch (e) { return null; } }
    function looksCta(el) {
      var tag = el.tagName, txt = (el.innerText || el.value || '').trim();
      if (el.closest && el.closest('nav, header, footer, [role=navigation]') && !/btn|button|cta/i.test(String(el.className))) return false;
      return /btn|button|cta/i.test(String(el.className)) || el.hasAttribute('data-vai-next') || el.hasAttribute('data-vai-href') || tag === 'BUTTON' || (txt.length > 1 && txt.length <= 48);
    }
    var CHECKOUT = /checkout|pay\.|\/pay\b|payment|pagamento|pagar|comprar|\/compra|\/buy\b|buy\.|carrinho|\/cart\b|hotmart|kiwify|eduzz|monetizze|braip|ticto|perfectpay|yampi|cartpanda|digistore|clickbank|stripe\.com|mercadopago|pagar\.me|pagseguro|paypal|sunize|appmax|greenn|lastlink|doppus|pepper\.com\.br|assinatura|go\.hotmart|sales\./i;
    function cssOf(el) { try { return el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''); } catch (e) { return ''; } }
    document.addEventListener('click', safe(function (e) {
      var el = actOn(e.target); if (!el) return;
      var text = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      var href = el.tagName === 'A' ? String(el.href || '') : String(el.getAttribute('data-vai-href') || '');
      var sl = slug();
      // checkout: a link that goes to a payment page (once per destination per visit)
      if (href && CHECKOUT.test(href)) byKind('checkout').forEach(function (ev) { emit(ev.id, { perVisit: true, dd: 'co:' + href.slice(0, 60) }); });
      // the project's own click events (by the text of the button, or by a css selector written as sel:...)
      P.events.forEach(function (ev) {
        if (ev.kind !== 'custom' || !ev.trigger || ev.trigger.type !== 'click' || !ev.trigger.match) return;
        var m = String(ev.trigger.match), hit = false;
        if (m.indexOf('sel:') === 0) { try { hit = !!(el.matches(m.slice(4)) || (el.closest && el.closest(m.slice(4)))); } catch (x) {} }
        else hit = text.toLowerCase().indexOf(m.toLowerCase()) >= 0;
        if (hit) emit(ev.id, { arrival: arrival, dd: ev.id });
      });
      if (looksCta(el)) byKind('cta').forEach(function (ev) { emit(ev.id, { arrival: arrival, dd: 'cta:' + (text || cssOf(el)).slice(0, 40) }); });
    }), true);

    // videos: start, half way and the end, once per video for the whole visit (embedded players in an iframe cannot be read)
    var vstate = typeof WeakMap === 'function' ? new WeakMap() : null;
    function vkey(v) { return String(v.currentSrc || v.src || (v.querySelector && v.querySelector('source') && v.querySelector('source').src) || 'video').slice(-60); }
    function vevent(v, sub) {
      if (!byKind('video').length) return;
      var k = vkey(v);
      byKind('video').forEach(function (ev) { emit(ev.id, { perVisit: true, sub: sub, dd: 'v:' + k }); });
    }
    document.addEventListener('play', safe(function (e) { var v = e.target; if (v && v.tagName === 'VIDEO' && !(v.loop && v.muted)) vevent(v, 'start'); }), true);
    document.addEventListener('timeupdate', safe(function (e) {
      var v = e.target; if (!v || v.tagName !== 'VIDEO' || !v.duration || !isFinite(v.duration) || (v.loop && v.muted)) return;
      var st = vstate && (vstate.get(v) || {}); if (!st) return;
      if (!st.half && v.currentTime / v.duration >= 0.5) { st.half = 1; vevent(v, '50'); }
      vstate.set(v, st);
    }), true);
    document.addEventListener('ended', safe(function (e) { var v = e.target; if (v && v.tagName === 'VIDEO' && !(v.loop && v.muted)) vevent(v, 'end'); }), true);

    /* ───── consent and do-not-track ───── */
    function consent() {
      var c = P.consent || {};
      var dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
      if (c.respectDnt !== false && dnt) return 'no';
      if (!c.required) return 'ok';
      var s = get(LS, 'vai_consent');
      return s === 'granted' ? 'ok' : s === 'denied' ? 'no' : 'wait';
    }
    function skipAll() {
      P.integrations.forEach(function (ig) {
        if (!once('skip|' + ig.id, true)) return;
        queue({ i: ig.type, tid: ig.id, n: 'consent', k: 'consent', s: slug(), st: 'skipped', dd: 'consent' });
      });
      flush(false);
    }
    function banner() {
      if (document.getElementById('vai-consent')) return;
      var d = document.createElement('div');
      d.id = 'vai-consent';
      d.setAttribute('role', 'dialog');
      d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483646;max-width:560px;margin:0 auto;background:#111827;color:#f9fafb;font:14px/1.45 system-ui,sans-serif;padding:14px 16px;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.45);display:flex;gap:12px;align-items:center;flex-wrap:wrap';
      var p = document.createElement('span'); p.style.flex = '1 1 240px'; p.textContent = (P.consent && P.consent.text) || 'Usamos cookies e pixels para medir os resultados dos anúncios. Você aceita?';
      var mk = function (label, primary, grant) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
        b.style.cssText = 'cursor:pointer;border:0;border-radius:10px;padding:9px 16px;font:600 13px system-ui,sans-serif;' + (primary ? 'background:#7c3aed;color:#fff' : 'background:#374151;color:#e5e7eb');
        b.onclick = function () { put(LS, 'vai_consent', grant ? 'granted' : 'denied'); try { d.remove(); } catch (e) {} if (grant) start(); else skipAll(); };
        return b;
      };
      d.appendChild(p); d.appendChild(mk('Recusar', false, false)); d.appendChild(mk('Aceitar', true, true));
      (document.body || document.documentElement).appendChild(d);
    }

    /* ───── test mode: a panel that says what happened to each event ───── */
    var panel = null, rows = {};
    var STATE_TXT = { fired: 'chamado, aguardando', sent: 'enviado ✓', unconfirmed: 'sem confirmação', blocked: 'bloqueado ✗', skipped: 'não disparado' };
    function panelUpdate(rec) {
      try {
        if (!panel) {
          panel = document.createElement('div');
          panel.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483647;width:min(360px,calc(100vw - 20px));max-height:46vh;overflow:auto;background:#0b0818;color:#e5e7eb;font:12px/1.4 ui-monospace,Menlo,monospace;border:1px solid #6d28d9;border-radius:12px;padding:10px 12px;box-shadow:0 10px 40px rgba(0,0,0,.5)';
          var h = document.createElement('div'); h.style.cssText = 'font:600 12px system-ui,sans-serif;color:#c4b5fd;margin-bottom:6px'; h.textContent = 'Modo de teste dos pixels: nada daqui entra nas métricas';
          panel.appendChild(h); (document.body || document.documentElement).appendChild(panel);
        }
        var key = rec.tid + '|' + rec.dd, row = rows[key];
        if (!row) { row = rows[key] = document.createElement('div'); row.style.cssText = 'padding:2px 0;border-top:1px solid #1f1b3a'; panel.appendChild(row); }
        row.textContent = rec.i.replace(/_/g, ' ') + ' · ' + rec.n + ' · ' + (STATE_TXT[rec.st] || rec.st);
        row.style.color = rec.st === 'sent' ? '#6ee7b7' : rec.st === 'blocked' ? '#fca5a5' : rec.st === 'unconfirmed' ? '#fcd34d' : '#e5e7eb';
      } catch (e) {}
    }

    /* ───── start ───── */
    function start() {
      if (started) return;
      started = true;
      P.integrations.forEach(boot);
      if (waitingPageview) { var w = waitingPageview; waitingPageview = null; arrive(w.slug); }
    }
    function init() {
      // the runtime already announced the first page (it runs before this script): replay it, then listen
      var bus = window.__VAI_BUS || [];
      var c = consent();
      if (c === 'no') { skipAll(); return; }
      if (c === 'wait') { banner(); }
      else start();
      for (var i = 0; i < bus.length; i++) { if (c === 'ok' || bus[i].t === 'view') onBus(bus[i]); }
      // when the runtime is not there to say it, the first page still counts, once
      setTimeout(safe(function () { if (!sawView && started) arrive(slug()); else if (!sawView && !started && consent() === 'wait') { waitingPageview = { slug: slug() }; } }), 1800);
    }
    window.addEventListener('pagehide', safe(function () { flush(true); }));
    document.addEventListener('visibilitychange', safe(function () { if (document.visibilityState === 'hidden') flush(true); }));
    // a stored consent given in another tab takes effect here too
    window.addEventListener('storage', safe(function (e) { if (e.key === 'vai_consent' && e.newValue === 'granted') start(); }));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safe(init)); else init();
  } catch (e) { /* the page never notices */ }
})();
