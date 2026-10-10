/*
 * Runtime for a cloned page, served as its own bare HTML document (see
 * src/lib/clone-document.ts). The original site's scripts are stripped at
 * capture time — running arbitrary third-party JS on our own domain is a
 * real XSS/exfiltration risk — so everything here rebuilds, generically
 * and from markup the page already carries, the handful of behaviours a
 * script-less clone would otherwise lose. No part of it depends on, or can
 * be influenced by, the cloned site's own code.
 */
(function () {
  var cfg = window.__VAI || {};
  // A thumbnail of the page (the funnel map in the dashboard shows each step in a small frame) must only LOOK
  // at it: no analytics, no exit rules, no step that moves on by itself.
  var preview = !!cfg.preview;

  /* ── 1. Analytics + lead capture ───────────────────────────────────── */
  // One visitor = one tab session: lets the dashboard follow a person from step to step.
  function sessionId() {
    try {
      var id = sessionStorage.getItem('vai_sid');
      if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); sessionStorage.setItem('vai_sid', id); }
      return id;
    } catch (e) { return 'nosession'; }
  }
  // the visit the server wrote when this page was opened (kept when a funnel step is swapped in place)
  var visit = cfg.sid ? { sid: cfg.sid, vid: cfg.vid } : null;
  // views and leads are also announced to the page itself (the pixel script, public/vai-e.js, listens): one source for what the platform counts and what the pixels are told
  function bus(b) {
    try {
      if (!b || (b.type !== 'view' && b.type !== 'lead')) return;
      var d = { t: b.type, slug: cfg.slug, path: b.path };
      var q = (window.__VAI_BUS = window.__VAI_BUS || []);
      q.push(d); if (q.length > 60) q.shift();
      window.dispatchEvent(new CustomEvent('vai:bus', { detail: d }));
    } catch (e) {}
  }
  function beacon(body) {
    if (preview) return;
    bus(body);
    if (body && (body.type === 'view' || body.type === 'click')) body.data = Object.assign({ sid: sessionId() }, body.data || {});
    // lead and views are tied to the visit the behaviour analytics follows (see vai-m.js)
    // (when the analytics script is blocked the server's own ids of this visit are used, so a lead is still tied to where it came from)
    var ids = window.vaiAnalytics && window.vaiAnalytics.ids ? window.vaiAnalytics.ids() : visit;
    var payload = JSON.stringify(Object.assign({ projectId: cfg.projectId, pageId: cfg.pageId, slug: cfg.slug }, ids ? { asid: ids.sid, avid: ids.vid } : {}, body));
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true });
    }
  }
  window.vaiBeacon = beacon;
  if (cfg.projectId) {
    beacon({ type: 'view', path: location.pathname, referrer: document.referrer || null });

    // A cloned form posts to a backend that doesn't exist here. Capture the
    // fields as a lead instead and thank the visitor — keep the form the
    // original owner designed, but the submission is now ours.
    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form || form.tagName !== 'FORM') return;
      e.preventDefault();
      // a funnel step's form: Enter moves on exactly like the button does
      var wired = form.querySelector('[data-vai-next], [data-vai-href]');
      if (wired) { wired.click(); return; }
      var formData = {};
      new FormData(form).forEach(function (value, key) {
        if (typeof value === 'string') formData[key] = value;
      });
      beacon({ type: 'lead', path: location.pathname, formData: formData });
      var thanks = document.createElement('p');
      thanks.textContent = 'Obrigado! Recebemos suas informações.';
      thanks.style.cssText = 'padding:1rem;text-align:center;font-weight:600;';
      form.replaceWith(thanks);
    }, true);
  }

  /* ── 1b. Funnel steps ───────────────────────────────────────────────── */
  // A cloned funnel is one page per step. The scanner walked the original and
  // tagged what moves the visitor on (data-vai-next / data-vai-href), how an
  // answer looks once picked (data-vai-select + data-vai-sel + data-vai-goto)
  // and what appears late (data-vai-delay, data-vai-cd, data-vai-auto). All of
  // it is plain markup, so the editor keeps it and can change it.
  //
  // Moving between steps does NOT reload the document: the next step's HTML is
  // fetched ahead of time and swapped into the page's content root with a
  // short fade, like the single-page app it was cloned from. A reload would
  // re-parse the page's whole stylesheet and flash white at every answer.
  var storeKey = 'vai_' + (cfg.projectId || '');
  function loadStore() {
    try { return JSON.parse(sessionStorage.getItem(storeKey) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveStore(st) {
    try { sessionStorage.setItem(storeKey, JSON.stringify(st)); } catch (e) { /* private mode */ }
  }
  function stepUrl(slug) { return (cfg.basePath || '') + '/' + slug + location.search; }
  function visibleText(el) { return (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80); }
  function questionTitle() {
    var h = document.querySelector('h1, h2, h3');
    return h ? visibleText(h).slice(0, 60) : (document.title || 'Etapa');
  }

  // Fields the visitor filled in, keyed so /api/track can find email / phone / name.
  function collectFields() {
    var data = {}, any = false;
    document.querySelectorAll('input, textarea, select').forEach(function (f) {
      var t = (f.type || '').toLowerCase();
      if (['hidden', 'password', 'submit', 'button', 'file'].indexOf(t) > -1) return;
      if ((t === 'checkbox' || t === 'radio') && !f.checked) return;
      var v = (f.value || '').trim();
      if (!v) return;
      var hint = ((f.name || '') + ' ' + (f.placeholder || '') + ' ' + (f.getAttribute('aria-label') || '') + ' ' + (f.id || '')).toLowerCase();
      var key = (t === 'email' || /e-?mail/.test(hint)) ? 'email'
        : (t === 'tel' || /whats|celular|telefone|fone|phone/.test(hint)) ? 'telefone'
        : /nome|name|chama|call you/.test(hint) ? 'nome'
        : (t === 'text' && !data.nome && !/idade|age|peso|weight|altura|height|cep|cpf|cnpj|cidade|city|endere|address/.test(hint)) ? 'nome'
        : (f.name || f.placeholder || f.id || t || 'campo');
      data[key] = v;
      any = true;
    });
    return any ? data : null;
  }

  // One Lead per visitor across all the steps: the first step that has contact
  // data creates it, later steps (more quiz answers) update the same row.
  function sendLead(fields) {
    if (!cfg.projectId) return;
    var st = loadStore();
    if (fields) { st.contact = Object.assign(st.contact || {}, fields); }
    if (!st.contact) { saveStore(st); return; }
    if (!st.k) st.k = Math.random().toString(36).slice(2) + Date.now().toString(36);
    // the first send is the lead; later steps only add answers to the same row
    var kind = st.sent ? 'update' : 'lead';
    st.sent = true;
    saveStore(st);
    beacon({ type: kind, path: location.pathname, leadKey: st.k, formData: Object.assign({}, st.answers || {}, st.contact) });
  }

  // A <label> around a radio / checkbox answers a tap twice: once on the label, once more on the input it
  // forwards to. The second is the first one's echo.
  var lastTap = { el: null, t: 0 };
  function labelEcho(e, el) {
    var now = Date.now();
    if (e.target && e.target.tagName === 'INPUT' && el.tagName === 'LABEL' && lastTap.el === el && now - lastTap.t < 150) return true;
    lastTap = { el: el, t: now };
    return false;
  }

  // Answer options: a single-choice screen swaps the look of one answer for
  // another; a multi-choice one (data-vai-select="m") toggles each answer on
  // and off on its own, like a checklist.
  var selApplied = [];
  var selOn = [];
  var pickedGoto = null;
  function restoreSelection() {
    selApplied.slice().reverse().forEach(function (o) {
      if (o.cls === null) o.el.removeAttribute('class'); else o.el.setAttribute('class', o.cls);
      if (o.style === null) o.el.removeAttribute('style'); else o.el.setAttribute('style', o.style);
      o.el.disabled = o.dis;
    });
    selApplied = [];
  }
  function applySelection(opt) {
    var rows = [];
    try { rows = JSON.parse(opt.getAttribute('data-vai-sel') || '[]'); } catch (err) { rows = []; }
    rows.forEach(function (row) {
      var el = document.querySelector('[data-vai-n="' + row[0] + '"]');
      if (!el) return;
      selApplied.push({ el: el, cls: el.getAttribute('class'), style: el.getAttribute('style'), dis: !!el.disabled });
      if (row[1] !== null) el.setAttribute('class', row[1]);
      if (row[2] !== null) { if (row[2] === '') el.removeAttribute('style'); else el.setAttribute('style', row[2]); }
      if (row[3] !== null) el.disabled = !!row[3];
    });
  }
  document.addEventListener('click', function (e) {
    var opt = e.target && e.target.closest && e.target.closest('[data-vai-select]');
    if (!opt) return;
    if (labelEcho(e, opt)) return;
    restoreSelection();
    if (opt.getAttribute('data-vai-select') === 'm') {
      var at = selOn.indexOf(opt);
      if (at > -1) selOn.splice(at, 1); else selOn.push(opt);
    } else {
      selOn = [opt];
    }
    // every pick is drawn from the untouched screen, so what is on is always
    // exactly the answers in selOn
    selOn.forEach(applySelection);
    var last = selOn[selOn.length - 1];
    pickedGoto = last ? (last.getAttribute('data-vai-goto') || null) : null;
    var st = loadStore();
    st.answers = st.answers || {};
    st.answers[questionTitle()] = selOn.map(visibleText).join(', ');
    saveStore(st);
  }, true);

  // Where a button leads: a step slug, or (the funnel's exit: checkout,
  // WhatsApp, a booking page) a full URL whose {{nome}}/{{email}}/{{telefone}}
  // placeholders are filled with what THIS visitor typed.
  function resolveTarget(t) {
    if (!t) return null;
    if (/^https?:\/\//i.test(t)) {
      var contact = loadStore().contact || {};
      return t.replace(/\{\{(nome|email|telefone)\}\}/g, function (_, k) { return encodeURIComponent(contact[k] || ''); });
    }
    return stepUrl(t);
  }

  var stepTimers = [];
  function clearStepTimers() {
    stepTimers.forEach(function (h) { clearTimeout(h); clearInterval(h); });
    stepTimers = [];
  }

  var cache = {};
  function fetchStep(url) {
    if (!cache[url]) {
      cache[url] = fetch(url, { credentials: 'same-origin', headers: { 'x-vai-step': '1' } }).then(function (r) {
        if (!r.ok) throw new Error('step ' + r.status);
        return r.text();
      });
      cache[url].catch(function () { delete cache[url]; });
    }
    return cache[url];
  }

  // Progress bars: the original animates their width from the old step's value.
  function widthsOf(root) {
    var out = {};
    root.querySelectorAll('[style*="width"]').forEach(function (el) {
      var w = el.style.width;
      if (!w || w.slice(-1) !== '%') return;
      var path = [], n = el;
      while (n && n !== root) { path.unshift(Array.prototype.indexOf.call(n.parentNode.children, n)); n = n.parentNode; }
      out[path.join('.')] = w;
    });
    return out;
  }
  function animateWidths(root, before) {
    var todo = [];
    root.querySelectorAll('[style*="width"]').forEach(function (el) {
      var w = el.style.width;
      if (!w || w.slice(-1) !== '%' || todo.length >= 12) return;
      var path = [], n = el;
      while (n && n !== root) { path.unshift(Array.prototype.indexOf.call(n.parentNode.children, n)); n = n.parentNode; }
      var old = before[path.join('.')];
      if (old && old !== w) todo.push([el, old, w]);
    });
    if (!todo.length) return;
    // one layout for all the bars, not one each
    todo.forEach(function (t) { t[0].style.width = t[1]; });
    void root.offsetWidth;
    todo.forEach(function (t) { t[0].style.width = t[2]; });
  }

  function swapStep(url, html, push) {
    var root = document.querySelector('[data-vai-root]');
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var next = doc.querySelector('[data-vai-root]');
    if (!root || !next) throw new Error('no root');
    // another page of the project with its OWN stylesheet (a gift page, a
    // thank-you page) can't be swapped into this one: load it for real
    var curCss = document.querySelector('link[rel="stylesheet"][href*="/css/"]');
    var nextCss = doc.querySelector('link[rel="stylesheet"][href*="/css/"]');
    if ((curCss && curCss.getAttribute('href')) !== (nextCss && nextCss.getAttribute('href'))) { location.href = url; return; }
    var before = widthsOf(root);
    clearStepTimers();
    restoreSelection();
    pickedGoto = null;
    selApplied = [];
    selOn = [];
    // Leave quickly, arrive gently: the old step fades out, the new one is put
    // in place while hidden, waits (briefly) for its pictures so nothing pops
    // in half-drawn, then rises into view.
    var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.style.transition = calm ? 'none' : 'opacity .12s ease-in';
    root.style.opacity = '0';
    setTimeout(function () {
      // setHTMLUnsafe also turns <template shadowrootmode> back into real shadow roots (web components)
      if (root.setHTMLUnsafe) root.setHTMLUnsafe(next.innerHTML); else root.innerHTML = next.innerHTML;
      if (doc.body && doc.body.className !== undefined) document.body.className = doc.body.className;
      document.title = doc.title || document.title;
      var m = /window\.__VAI=(\{[^<]*\})/.exec(html);
      if (m) { try { cfg = JSON.parse(m[1]); window.__VAI = cfg; if (visit && !cfg.sid) { cfg.sid = visit.sid; cfg.vid = visit.vid; } } catch (e) { /* keep old ids */ } }
      if (push) history.pushState({ vai: 1 }, '', url);
      window.scrollTo(0, 0);
      animateWidths(root, before);
      beacon({ type: 'view', path: location.pathname, referrer: null });
      if (window.vaiAnalytics && window.vaiAnalytics.page) window.vaiAnalytics.page(cfg.slug);   // a funnel step swapped in place is a new page of the visit
      var pics = Array.prototype.filter.call(root.querySelectorAll('img'), function (im) {
        return im.loading !== 'lazy' && !im.complete;
      }).slice(0, 6).map(function (im) {
        return im.decode ? im.decode().catch(function () {}) : Promise.resolve();
      });
      var reveal = function () {
        // the step's own entrance animations, loaders and timers start now, while it can be seen
        initStep();
        if (calm) { root.style.opacity = '1'; return; }
        root.style.transition = 'none';
        root.style.transform = 'translateY(10px)';
        void root.offsetWidth;
        root.style.transition = 'opacity .3s cubic-bezier(.22,.61,.36,1), transform .3s cubic-bezier(.22,.61,.36,1)';
        root.style.opacity = '1';
        root.style.transform = 'none';
        setTimeout(function () { root.style.transition = ''; root.style.transform = ''; }, 340);
      };
      Promise.race([Promise.all(pics), new Promise(function (r) { setTimeout(r, 450); })]).then(reveal, reveal);
    }, calm ? 0 : 120);
  }

  function go(target, push) {
    var url = resolveTarget(target);
    if (!url) return;
    if (/^https?:\/\//i.test(url)) { location.href = url; return; }
    var root = document.querySelector('[data-vai-root]');
    if (!root || !window.fetch || !window.DOMParser) { location.href = url; return; }
    fetchStep(url).then(function (html) {
      swapStep(url, html, push !== false);
    }).catch(function () { location.href = url; });
  }
  window.addEventListener('popstate', function () {
    if (backRuleActive && fireRule('back')) return;
    var seg = location.pathname.replace(cfg.basePath || '', '').replace(/^\//, '') || 'home';
    if (document.querySelector('[data-vai-root]')) go(seg, false);
    else location.reload();
  });

  // Moving on: save the lead / answers, then go to the next step (or out to
  // the checkout / WhatsApp / site the original funnel ended on).
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-vai-next], [data-vai-href]');
    if (!el || el.disabled) return;
    if (el.tagName === 'LABEL' && !el.hasAttribute('data-vai-select') && labelEcho(e, el)) { e.preventDefault(); e.stopPropagation(); return; }
    e.preventDefault();
    e.stopPropagation();
    sendLead(collectFields());
    var target = pickedGoto || el.getAttribute('data-vai-next') || el.getAttribute('data-vai-href');
    // which button / answer was pressed: feeds "where do people go" in the dashboard
    var label = ((el.innerText || el.value || '') + '').replace(/\s+/g, ' ').trim().slice(0, 70);
    beacon({ type: 'click', path: location.pathname, data: { label: label, to: String(target || '').slice(0, 90) } });
    go(target, true);
  }, true);

  // Elements the original showed only after a while.
  // A popup that covers the page (a newsletter offer, an age gate) belongs to the PAGE, not to a step: the
  // visitor sees it once. Every step's copy carries it, so what was already shown (or closed) is remembered.
  function modalKey(m) {
    var t = ((m.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)) + '|' + String(m.className || '').slice(0, 40);
    var h = 5381;
    for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
    return 'vai_modal_' + (cfg.projectId || '') + '_' + (h >>> 0).toString(36);
  }
  function modalSeen(m) {
    try { return !!sessionStorage.getItem(modalKey(m)); } catch (e) { return false; }
  }
  function markModalSeen(m) {
    try { sessionStorage.setItem(modalKey(m), '1'); } catch (e) { /* private mode */ }
  }
  function startDelays() {
    document.querySelectorAll('[data-vai-delay]').forEach(function (el) {
      var secs = parseFloat(el.getAttribute('data-vai-delay')) || 0;
      var isModal = el.hasAttribute('data-vai-modal');
      if (isModal && modalSeen(el)) { el.style.setProperty('display', 'none', 'important'); return; }
      stepTimers.push(setTimeout(function () {
        el.setAttribute('data-vai-shown', '1');
        if (isModal) markModalSeen(el);
      }, secs * 1000));
    });
    // a layer that is there from the start and was already dealt with on an earlier step stays away
    document.querySelectorAll('[data-vai-modal]:not([data-vai-delay])').forEach(function (m) {
      if (modalSeen(m)) m.style.setProperty('display', 'none', 'important');
      else markModalSeen(m);
    });
  }
  // Countdown clocks the scanner saw ticking: re-created from their start value.
  function startCountdowns() {
    var groups = {};
    document.querySelectorAll('[data-vai-cd]').forEach(function (el) {
      var p = el.getAttribute('data-vai-cd').split(':');
      var g = groups[p[0]] || (groups[p[0]] = { total: parseInt(el.getAttribute('data-vai-cd-total'), 10) || 0, leaves: [] });
      g.leaves.push({ el: el, unit: p[1], width: parseInt(p[2], 10) || 2 });
    });
    var keys = Object.keys(groups);
    if (!keys.length) return;
    var started = Date.now();
    function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
    function render() {
      var elapsed = Math.floor((Date.now() - started) / 1000);
      keys.forEach(function (k) {
        var g = groups[k];
        var rem = Math.max(0, g.total - elapsed);
        var units = g.leaves.map(function (l) { return l.unit; });
        var has = function (u) { return units.indexOf(u) > -1; };
        g.leaves.forEach(function (l) {
          var v;
          if (l.unit === 'c2') { l.el.textContent = pad(Math.floor(rem / 60), 2) + ':' + pad(rem % 60, 2); return; }
          if (l.unit === 'c3') { l.el.textContent = pad(Math.floor(rem / 3600), 2) + ':' + pad(Math.floor(rem % 3600 / 60), 2) + ':' + pad(rem % 60, 2); return; }
          if (l.unit === 's') v = (has('m') || has('h') || has('d')) ? rem % 60 : rem;
          else if (l.unit === 'm') v = (has('h') || has('d')) ? Math.floor(rem / 60) % 60 : Math.floor(rem / 60);
          else if (l.unit === 'h') v = has('d') ? Math.floor(rem / 3600) % 24 : Math.floor(rem / 3600);
          else v = Math.floor(rem / 86400);
          l.el.textContent = pad(v, l.width);
        });
      });
    }
    render();
    stepTimers.push(setInterval(render, 1000));
  }
  // A step the original carried on from by itself (an "analysing…" screen).
  function startAutoAdvance() {
    var el = document.querySelector('[data-vai-auto-to]');
    if (!el) return;
    var to = el.getAttribute('data-vai-auto-to');
    var secs = parseFloat(el.getAttribute('data-vai-auto-after')) || 3;
    if (!to) return;
    stepTimers.push(setTimeout(function () { go(to, true); }, secs * 1000));
  }
  // Every step this one can lead to is fetched in the background, so the swap
  // is instant (their pictures are warmed too); the HTML of the steps after
  // THOSE is fetched as well - a few KB each - so a fast clicker never waits.
  var warmed = {};
  var warmedPics = [];
  function targetsIn(root) {
    var seen = {}, out = [];
    root.querySelectorAll('[data-vai-next], [data-vai-goto], [data-vai-auto-to]').forEach(function (el) {
      ['data-vai-next', 'data-vai-goto', 'data-vai-auto-to'].forEach(function (a) {
        var v = el.getAttribute(a);
        if (!v || /^https?/i.test(v) || seen[v]) return;
        seen[v] = 1;
        out.push(v);
      });
    });
    return out;
  }
  function warm(slug, depth) {
    if (warmed[slug] || Object.keys(warmed).length > 14) return;
    warmed[slug] = 1;
    fetchStep(stepUrl(slug)).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      if (depth === 0) {
        Array.prototype.slice.call(doc.querySelectorAll('img[src]'), 0, 8).forEach(function (im) {
          var src = im.getAttribute('src');
          if (src && !/^data:/.test(src)) { var pre = new Image(); pre.decoding = 'async'; pre.src = src; warmedPics.push(pre); }
        });
      }
      if (depth < 2) targetsIn(doc).slice(0, 5).forEach(function (t) { warm(t, depth + 1); });
    }).catch(function () {});
  }
  function prefetchNext() {
    if (!document.querySelector('[data-vai-root]')) return;
    var targets = targetsIn(document).slice(0, 6);
    var run = function () { targets.forEach(function (t) { warm(t, 0); }); };
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 400);
  }

  // Entrance animations recorded from the original (WAAPI keyframes + timing).
  function playAnimations() {
    if (!document.documentElement.animate) return;
    document.querySelectorAll('[data-vai-anim]').forEach(function (el) {
      var list = [];
      try { list = JSON.parse(el.getAttribute('data-vai-anim') || '[]'); } catch (e) { return; }
      list.forEach(function (a) {
        try {
          el.animate(a.f, { duration: a.d || 300, delay: Math.max(0, a.dl || 0), easing: a.e || 'linear', fill: 'backwards' });
        } catch (e) { /* a keyframe this browser does not know */ }
      });
    });
  }
  // The "film" of the screen as recorded on the original: loaders that count,
  // status lines that rotate, bars that fill, check marks that light up. Each
  // element starts as it was on arrival and gets its changes at the same moments.
  function applyTl(el, kind, value) {
    if (kind === 't') { if (!el.children.length) el.textContent = value; }   // never wipe a container
    else if (kind === 'c') { if (value === '') el.removeAttribute('class'); else el.setAttribute('class', value); }
    else if (kind === 's') { if (value === '') el.removeAttribute('style'); else el.setAttribute('style', value); }
  }
  function playTimeline() {
    document.querySelectorAll('[data-vai-tl]').forEach(function (el) {
      var tl;
      try { tl = JSON.parse(el.getAttribute('data-vai-tl') || '{}'); } catch (e) { return; }
      var init = tl.i || {};
      Object.keys(init).forEach(function (k) { applyTl(el, k, init[k]); });
      (tl.e || []).forEach(function (ev) {
        stepTimers.push(setTimeout(function () { applyTl(el, ev[1], ev[2]); }, ev[0]));
      });
    });
  }
  // Numbers that counted on their own ("redirecting… 42%").
  function startHistories() {
    document.querySelectorAll('[data-vai-hist]').forEach(function (el) {
      var hist = [];
      try { hist = JSON.parse(el.getAttribute('data-vai-hist') || '[]'); } catch (e) { return; }
      if (!hist.length) return;
      el.textContent = hist[0][1];
      hist.slice(1).forEach(function (h) {
        stepTimers.push(setTimeout(function () { el.textContent = h[1]; }, Math.max(0, h[0] * 1000)));
      });
    });
  }

  /* ── 1c. Rules of the original page: what happens when the visitor tries to leave ── */
  // Found by the scanner by trying them on the original (exit intent: the mouse
  // leaving through the top; back: the page traps the back button; time: a
  // timed redirect). Each fires once per visitor, like the original's own flag.
  var backRuleActive = false;
  var ruleHandlers = [];
  function ruleDone(r) {
    try { return !!localStorage.getItem('vai_rule_' + (cfg.projectId || '') + '_' + (cfg.pageId || '') + '_' + r.id); } catch (e) { return false; }
  }
  function ruleFor(trigger) {
    var list = cfg.rules || [];
    for (var i = 0; i < list.length; i++) if (list[i].trigger === trigger && list[i].goto) return list[i];
    return null;
  }
  function fireRule(trigger) {
    var r = ruleFor(trigger);
    if (!r || (r.once !== false && ruleDone(r))) return false;
    try { localStorage.setItem('vai_rule_' + (cfg.projectId || '') + '_' + (cfg.pageId || '') + '_' + r.id, '1'); } catch (e) { /* private mode */ }
    var url = resolveTarget(r.goto);
    if (!url) return false;
    location.href = url;
    return true;
  }
  function installRules() {
    ruleHandlers.forEach(function (h) { h[0].removeEventListener(h[1], h[2]); });
    ruleHandlers = [];
    backRuleActive = false;
    var canHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
    var exit = ruleFor('exit-intent');
    if (exit && canHover && !ruleDone(exit)) {
      var onLeave = function (e) { if (e.clientY <= 5) fireRule('exit-intent'); };
      document.addEventListener('mouseleave', onLeave);
      ruleHandlers.push([document, 'mouseleave', onLeave]);
    }
    var back = ruleFor('back');
    if (back && !ruleDone(back)) {
      backRuleActive = true;
      // the same trick the original used: fill the history so the first "back" stays on the page and tells us
      // (once per document: a funnel installs its rules again at every step)
      if (!window.__vaiTrapped) {
        window.__vaiTrapped = true;
        for (var i = 0; i < 4; i++) history.pushState({ vaiTrap: i }, '', location.href);
      }
    }
    var timed = ruleFor('time');
    if (timed && !ruleDone(timed)) stepTimers.push(setTimeout(function () { fireRule('time'); }, (timed.after || 30) * 1000));
    // the visitor switches tab / minimises the window
    var away = ruleFor('hidden');
    if (away && !ruleDone(away)) {
      var onVis = function () { if (document.visibilityState === 'hidden') fireRule('hidden'); };
      document.addEventListener('visibilitychange', onVis);
      ruleHandlers.push([document, 'visibilitychange', onVis]);
    }
    // on a phone there is no mouse to leave through the top: a fast scroll back up means "leaving"
    var up = ruleFor('scroll-up');
    if (up && !ruleDone(up) && !canHover) {
      var peakY = 0, peakT = 0;
      var onScroll = function () {
        var y = window.pageYOffset || 0, now = Date.now();
        if (now - peakT > 600 || y > peakY) { peakY = y; peakT = now; return; }
        if (peakY - y > 250) fireRule('scroll-up');
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      ruleHandlers.push([window, 'scroll', onScroll]);
    }
  }

  /* ── 1d. Video: reveal things at a point of the video, and the smart player ── */
  window.addEventListener('vai:video-time', function (e) {
    var t = e.detail && e.detail.t || 0;
    document.querySelectorAll('[data-vai-pitch-at]:not([data-vai-shown])').forEach(function (el) {
      if (t >= (parseFloat(el.getAttribute('data-vai-pitch-at')) || 0)) el.setAttribute('data-vai-shown', '1');
    });
  });
  // Rules about the video itself: pausing it, finishing it, reaching a moment of it
  // (found on the original by the scanner; same once-per-visitor flag as the other rules).
  window.addEventListener('vai:video', function (e) {
    var k = e.detail && e.detail.e;
    if (k === 'pause') fireRule('video-pause');
    else if (k === 'end') fireRule('video-end');
  });
  window.addEventListener('vai:video-time', function (e) {
    var r = ruleFor('video-time');
    if (r && e.detail && e.detail.t >= (r.after || 0)) fireRule('video-time');
  });
  var playerLoading = false;
  function mountPlayers() {
    if (!document.querySelector('[data-vai-player]')) return;
    if (window.__VAIPlayer) { window.__VAIPlayer.scan(document); return; }
    if (playerLoading) return;
    playerLoading = true;
    loadScript('/vai-player.js').then(function () { if (window.__VAIPlayer) window.__VAIPlayer.scan(document); }).catch(function () { playerLoading = false; });
  }

  /* ── 1e. A button that waits for the screen to be answered ────────────── */
  // The original kept its "Continuar" off until the required fields were filled (the scanner found out
  // which by emptying them one at a time: data-vai-req). Same rule here, from the fields' own values.
  function fieldOk(f) {
    var t = (f.type || '').toLowerCase();
    if (f.tagName === 'SELECT') return !!f.value;
    if (t === 'checkbox' || t === 'radio') return f.checked;
    if (t === 'range') return f.getAttribute('data-vai-touched') === '1';
    var v = (f.value || '').trim();
    if (!v) return false;
    if (t === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    if (t === 'tel') return v.replace(/\D/g, '').length >= 8;
    return true;
  }
  function updateGates() {
    var btns = document.querySelectorAll('[data-vai-gate]');
    if (!btns.length) return;
    var ok = true;
    document.querySelectorAll('[data-vai-req]').forEach(function (f) { if (!fieldOk(f)) ok = false; });
    btns.forEach(function (b) { b.disabled = !ok; if (ok) b.removeAttribute('disabled'); else b.setAttribute('disabled', ''); });
  }
  ['input', 'change'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var f = e.target;
      if (f && f.hasAttribute && f.hasAttribute('data-vai-req')) {
        if ((f.type || '') === 'range') f.setAttribute('data-vai-touched', '1');
        updateGates();
      }
    }, true);
  });

  /* ── 1f. Greeting the visitor by what THEY typed ──────────────────────── */
  // The scanner turned the name it typed on the original ("Ótimo, Marilu!") into <span data-vai-var>.
  function applyVars() {
    var vars = document.querySelectorAll('[data-vai-var]');
    if (!vars.length) return;
    var c = loadStore().contact || {};
    var nome = (c.nome || '').trim();
    vars.forEach(function (el) {
      var k = el.getAttribute('data-vai-var');
      var v = k === 'nome' ? nome : k === 'nome1' ? nome.split(/\s+/)[0] : k === 'email' ? (c.email || '') : '';
      if (v) { el.textContent = v; return; }
      // nothing typed: a neutral word instead of a stranger's name
      el.textContent = k === 'email' ? 'seu e-mail' : k === 'nome' ? 'você' : 'você';
    });
  }

  /* ── 1g. Things that change as the page is scrolled ──────────────────── */
  // The scanner scrolled the original and saw which elements changed class/style, and where (a bar that slides in
  // after the first screen, a header that shrinks): data-vai-scroll = {at, tc, ts, c, s}.
  var scrollItems = null;
  var scrollTick = false;
  function applyScroll() {
    scrollTick = false;
    if (!scrollItems) return;
    var y = window.pageYOffset || 0;
    scrollItems.forEach(function (it) {
      var on = y >= it.d.at;
      if (on === it.on) return;
      it.on = on;
      var cls = on ? it.d.c : it.d.tc, sty = on ? it.d.s : it.d.ts;
      if (cls) it.el.setAttribute('class', cls); else it.el.removeAttribute('class');
      if (sty) it.el.setAttribute('style', sty); else it.el.removeAttribute('style');
    });
  }
  function initScroll() {
    var els = document.querySelectorAll('[data-vai-scroll]');
    if (!els.length) { scrollItems = null; return; }
    scrollItems = [];
    els.forEach(function (el) {
      try { scrollItems.push({ el: el, d: JSON.parse(el.getAttribute('data-vai-scroll')), on: false }); } catch (e) { /* skip */ }
    });
    applyScroll();
  }
  window.addEventListener('scroll', function () {
    if (scrollItems && !scrollTick) { scrollTick = true; requestAnimationFrame(applyScroll); }
  }, { passive: true });

  function initStep() {
    initScroll();
    applyVars();
    updateGates();
    if (!preview) installRules();
    if (!preview) mountPlayers();
    playAnimations();
    playTimeline();
    startHistories();
    startDelays();
    startCountdowns();
    if (!preview) startAutoAdvance();
    if (!preview) prefetchNext();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initStep);
  else initStep();

  /* ── 2. Generic click interactions ─────────────────────────────────── */
  // Buttons the scanner PROVED are toggles (it clicked them while capturing
  // and watched content appear/disappear), tagged as a button/panel pair.
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('[data-vai-toggle-btn]');
    if (!btn) return;
    var panel = document.querySelector('[data-vai-toggle-panel="' + btn.getAttribute('data-vai-toggle-btn') + '"]');
    if (!panel) return;
    var hidden = getComputedStyle(panel).display === 'none';
    // data-vai-open-display: what the panel's display was when the scanner
    // saw it open (a CSS-hidden panel has no "natural" display to fall back to).
    var openDisplay = panel.getAttribute('data-vai-open-display') || 'block';
    panel.style.setProperty('display', hidden ? openDisplay : 'none', 'important');
    // keep what assistive tools and the page's own styles read in step with what is on screen
    if (hidden && panel.hasAttribute('hidden')) panel.removeAttribute('hidden');
    if (btn.hasAttribute('aria-expanded')) btn.setAttribute('aria-expanded', hidden ? 'true' : 'false');
  }, true);

  // aria-expanded / aria-controls: the accessibility contract most
  // menu-toggle and dropdown widgets already declare.
  document.addEventListener('click', function (e) {
    var target = e.target && e.target.closest && e.target.closest('[aria-expanded]');
    if (!target) return;
    // pressed on the capture and replayed exactly (data-vai-mx / data-vai-toggle-*): this guess must not toggle it twice
    if (target.closest('[data-vai-mx], [data-vai-toggle-btn]')) return;
    var wasExpanded = target.getAttribute('aria-expanded') === 'true';
    target.setAttribute('aria-expanded', String(!wasExpanded));
    var controlsId = target.getAttribute('aria-controls');
    var panel = controlsId ? document.getElementById(controlsId) : null;
    if (!panel) {
      var scope = target.closest('header, nav, [class*="header"], [class*="navbar"]') || target.parentElement;
      var guess = scope && scope.querySelector('nav, [class*="menu"], [class*="nav-list"], ul');
      if (guess && guess !== target && !guess.contains(target) && !target.contains(guess)) panel = guess;
    }
    if (panel) {
      panel.style.setProperty('display', wasExpanded ? 'none' : '', 'important');
      if (!wasExpanded && panel.hasAttribute('hidden')) panel.removeAttribute('hidden');
    }
  }, true);

  // Same-page anchors: smooth scroll (the site's own smooth-scroll script is gone).
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = (a.getAttribute('href') || '').slice(1);
    var el = id && document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, true);

  /* ── 2b. Layers over the page (age gate, newsletter popup, promo) ───────── */
  // The original closed them with its own script, which is gone: a button inside one closes it,
  // so a copied gate never traps the visitor behind it. Funnel buttons inside (data-vai-next...) keep working.
  function closeModal(m) {
    markModalSeen(m);
    m.style.setProperty('display', 'none', 'important');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    var m = t && t.closest && t.closest('[data-vai-modal]');
    if (!m) return;
    if (t.closest('[data-vai-next], [data-vai-href], [data-vai-select], [data-vai-goto], [data-vai-player]')) return;
    var a = t.closest('a[href]');
    if (a && !/^#/.test(a.getAttribute('href') || '#')) return;     // a real link keeps going where it goes
    if (t === m || t.closest('button, [role="button"], a, input[type="button"], input[type="submit"], [data-vai-close]')) closeModal(m);
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var all = document.querySelectorAll('[data-vai-modal]');
    for (var i = all.length - 1; i >= 0; i--) if (getComputedStyle(all[i]).display !== 'none') { closeModal(all[i]); break; }
  });

  /* ── 3. Click-to-enlarge for plain photos ──────────────────────────── */
  // The original gallery/lightbox was JS-driven and is gone. Give plain
  // photos on LANDING pages a fullscreen view so clicking one does something.
  // Never in a funnel step, and never on a picture that is part of something
  // else: an answer, a button, a video cover (a cover that opened full screen
  // and stayed there was a real bug), anything with a play icon beside it.
  var overlay = null;
  function closeOverlay() { if (overlay) overlay.style.display = 'none'; }
  function partOfSomethingElse(img) {
    if (img.closest('a[href], button, [role="button"], [data-vai-toggle-btn], [data-vai-select], [data-vai-next], [data-vai-href], [data-vai-goto], [data-vai-player], [data-vai-lb="off"]')) return true;
    var box = img.parentElement;
    for (var up = 0; box && up < 2; up++, box = box.parentElement) {
      if (box.querySelector('video, iframe, [data-vai-player], [aria-label*="play" i], [aria-label*="assist" i], [data-testid*="play" i]')) return true;
      if (box.matches && box.matches('[onclick], [data-vai-next]')) return true;
    }
    return false;
  }
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'IMG') return;
    if (document.querySelector('[data-vai-root]')) return;
    if (partOfSomethingElse(el)) return;
    var src = el.currentSrc || el.src;
    if (!src) return;
    var rect = el.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 120) return;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.88);cursor:zoom-out;padding:24px;';
      var big = document.createElement('img');
      big.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;';
      overlay.appendChild(big);
      overlay.addEventListener('click', closeOverlay);
      document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeOverlay(); });
      window.addEventListener('pagehide', closeOverlay);
      document.body.appendChild(overlay);
    }
    overlay.firstChild.src = src;
    overlay.style.display = 'flex';
  }, true);

  /* ── 4. Known, safe, purely-visual libraries ───────────────────────── */
  // Pinned copies from a trusted CDN, attached only when the clone's own
  // markup shows it was built with that library — never anything taken from
  // the cloned site's own scripts.
  function loadStyle(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.body.appendChild(s);
    });
  }

  function initLibraries() {
    if (document.querySelector('[data-aos]')) {
      loadStyle('https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.css');
      loadScript('https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.js').then(function () {
        if (window.AOS) window.AOS.init({ once: true, duration: 700, offset: 80 });
      }).catch(function () {});
    }

    if (document.querySelector('.swiper, .swiper-container')) {
      loadStyle('https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css');
      loadScript('https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js').then(function () {
        var Swiper = window.Swiper;
        if (!Swiper) return;
        document.querySelectorAll('.swiper, .swiper-container').forEach(function (el) {
          if (el.swiper) return;
          new Swiper(el, {
            loop: true,
            autoplay: { delay: 4000, disableOnInteraction: false },
            pagination: { el: el.querySelector('.swiper-pagination'), clickable: true },
            navigation: { nextEl: el.querySelector('.swiper-button-next'), prevEl: el.querySelector('.swiper-button-prev') },
          });
        });
      }).catch(function () {});
    }

    // HLS (.m3u8) only plays natively in Safari; everywhere else needs hls.js.
    var hlsVideos = Array.prototype.filter.call(document.querySelectorAll('video[src]'), function (v) {
      return /\.m3u8(\?|$)/i.test(v.getAttribute('src') || '') && !v.canPlayType('application/vnd.apple.mpegurl');
    });
    if (hlsVideos.length) {
      loadScript('/hls.min.js').catch(function () { return loadScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js'); }).then(function () {
        if (!window.Hls || !window.Hls.isSupported()) return;
        hlsVideos.forEach(function (v) {
          var hls = new window.Hls();
          hls.loadSource(v.getAttribute('src'));
          hls.attachMedia(v);
        });
      }).catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLibraries);
  else initLibraries();

  /* ── 5. Menu buttons ─────────────────────────────────────────────────── */
  // The original's scripts are not here, so a hamburger button would do nothing. While the page was captured the
  // button was tapped on a phone-sized copy and what changed was written onto it (data-vai-mt: classes, inline
  // style, aria-expanded of the elements it affected). Tapping it here repeats that, and tapping again undoes it.
  var menuOpen = new WeakMap();
  function menuTarget(p) {
    if (p === 'body') return document.body;
    if (p === 'html') return document.documentElement;
    return document.querySelector('[data-vai-p="' + p + '"]');
  }
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('[data-vai-mt]');
    if (!btn) return;
    var changes;
    try { changes = JSON.parse(btn.getAttribute('data-vai-mt')); } catch (x) { return; }
    var open = !menuOpen.get(btn);
    menuOpen.set(btn, open);
    changes.forEach(function (c) {
      var el = menuTarget(c.p);
      if (!el) return;
      (open ? c.add : c.del).forEach(function (k) { el.classList.add(k); });
      (open ? c.del : c.add).forEach(function (k) { el.classList.remove(k); });
      if (c.style !== null && c.style !== undefined && c.p !== 'html') {
        var s = open ? c.style : (c.prevStyle || '');
        if (s) el.setAttribute('style', s); else el.removeAttribute('style');
      }
      if (c.ex) el.setAttribute('aria-expanded', open ? c.ex[1] : c.ex[0]);
      if (c.ah) { var v = open ? c.ah[1] : c.ah[0]; if (v === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', v); }
    });
    var href = btn.getAttribute && btn.getAttribute('href');
    if (href === '#' || (href && href.charAt(0) === '#')) e.preventDefault();
  }, true);

  /* ── 6. Pressing things: FAQ questions, tabs, menus, "ver mais" ──────────── */
  // While the page was captured, every clickable-looking element was pressed with a real mouse click on a copy and what
  // it changed was written onto it (data-vai-mx: attributes set, nodes added, nodes removed). Pressing it here repeats
  // that; pressing it again undoes it. Only the parts that changed are touched, so text the owner edited stays.
  var mxState = new WeakMap();
  function mxNode(p) {
    if (p === 'body') return document.body;
    if (p === 'html') return document.documentElement;
    return document.querySelector('[data-vai-p="' + p + '"]');
  }
  function mxFragment(html) {
    var t = document.createElement('template');
    t.innerHTML = html;
    t.content.querySelectorAll('script').forEach(function (n) { n.remove(); });
    t.content.querySelectorAll('*').forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (a) {
        if (/^on/i.test(a.name) || (/^(href|src|action|formaction)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
      });
    });
    return t.content;
  }
  function mxApply(ops) {
    var undo = [];
    var order = { '-': 0, a: 1, t: 2, '+': 3 };
    ops.slice().sort(function (x, y) { return order[x.k] - order[y.k]; }).forEach(function (o) {
      if (o.k === 'a') {
        var el = mxNode(o.p); if (!el) return;
        var was = el.getAttribute(o.n);
        if (o.v === null || o.v === undefined) el.removeAttribute(o.n); else el.setAttribute(o.n, o.v);
        undo.push(function () { if (was === null) el.removeAttribute(o.n); else el.setAttribute(o.n, was); });
      } else if (o.k === '-') {
        var gone = mxNode(o.p); if (!gone || !gone.parentNode) return;
        var par = gone.parentNode, nxt = gone.nextSibling;
        gone.parentNode.removeChild(gone);
        undo.push(function () { par.insertBefore(gone, nxt && nxt.parentNode === par ? nxt : null); });
      } else if (o.k === '+') {
        var parent = mxNode(o.p); if (!parent) return;
        var before = o.b ? mxNode(o.b) : null;
        var frag = mxFragment(o.h);
        var made = Array.prototype.slice.call(frag.childNodes);
        parent.insertBefore(frag, before && before.parentNode === parent ? before : null);
        made.forEach(function (n) { if (n.nodeType === 1 && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) mxAnimate(n); });
        undo.push(function () { made.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); });
      } else if (o.k === 't') {
        var tn = mxNode(o.p); if (!tn) return;
        var oldText = tn.textContent;
        tn.textContent = o.v;
        undo.push(function () { tn.textContent = oldText; });
      }
    });
    return undo;
  }
  var mxStyled = false;
  function mxAnimate(el) {
    if (!mxStyled) {
      mxStyled = true;
      var st = document.createElement('style');
      st.textContent = '@keyframes vaiReveal{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}';
      document.head.appendChild(st);
    }
    el.style.animation = 'vaiReveal .28s ease-out both';
    var done = function () { el.style.animation = ''; el.removeEventListener('animationend', done); };
    el.addEventListener('animationend', done);
    setTimeout(done, 700);
  }
  function mxReveal(watch) {
    watch.forEach(function (w) {
      if (w[1] === 0 && w[0].offsetHeight > 0 && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) mxAnimate(w[0]);
    });
  }
  document.addEventListener('click', function (e) {
    var trig = e.target && e.target.closest && e.target.closest('[data-vai-mx]');
    if (!trig) return;
    var inner = e.target.closest('a[href], input, select, textarea, label');
    if (inner && inner !== trig && trig.contains(inner) && !(inner.tagName === 'A' && (inner.getAttribute('href') || '').charAt(0) === '#')) return;
    var cfg;
    try { cfg = JSON.parse(trig.getAttribute('data-vai-mx')); } catch (x) { return; }
    var side = (window.innerWidth < 768 && cfg.m) ? cfg.m : (cfg.d || cfg.m);
    if (!side || !side.ops) return;
    var st = mxState.get(trig) || { open: false, undo: [] };
    if (st.open) {
      if (!side.rev) return;
      for (var i = st.undo.length - 1; i >= 0; i--) { try { st.undo[i](); } catch (x) {} }
      if (side.close) mxApply(side.close);
      st = { open: false, undo: [] };
    } else {
      // what was not on screen before and is now (an answer, a menu, a tab's content) fades in the way the original opened it
      var watch = [];
      side.ops.forEach(function (o) { if (o.k === 'a') { var w = mxNode(o.p); if (w && watch.indexOf(w) < 0) watch.push([w, w.offsetHeight]); } });
      var undone = mxApply(side.ops);
      st = { open: true, undo: undone };
      mxReveal(watch);
    }
    mxState.set(trig, st);
    var href = trig.getAttribute && trig.getAttribute('href');
    if (href && href.charAt(0) === '#') e.preventDefault();
  }, true);
})();
