/* Lab quiz engine: a configurable funnel in vanilla JS, used to simulate many kinds of quiz/VSL/waiting-page sites.
 * window.QUIZ = { route:'state|push|hash', advance:'auto|continue', transition:'none|fade|slide', ids:true|false|'generic',
 *                 progress:true, cookie:false, popupAt:0, renderDelay:0, steps:[...] , gen:{n:5000} }
 * Step types: single, multi, info, input, select, slider, loader, video, countdown, result
 * Every interactive element carries data-lab-* hooks so the same driver can play the original and the clone. */
(function () {
  var C = window.QUIZ, app = document.getElementById('app');
  if (C.gen) {
    C.steps = [];
    for (var n = 1; n <= C.gen.n; n++) {
      if (C.gen.kind === 'mixed' && n % 7 === 0) C.steps.push({ type: 'info', title: 'Você está indo bem! (' + n + ')', sub: 'Mais ' + (C.gen.n - n) + ' perguntas.' });
      else if (C.gen.kind === 'mixed' && n % 11 === 0) C.steps.push({ type: 'loader', title: 'Calculando bloco ' + n, secs: 1.5 });
      else C.steps.push({ type: 'single', title: 'Pergunta ' + n + ' de ' + C.gen.n, sub: 'Escolha uma resposta', options: ['Resposta A' + n, 'Resposta B' + n, 'Resposta C' + n] });
    }
    C.steps.push({ type: 'result', title: 'Resultado final', sub: 'Obrigado por responder', cta: 'QUERO MEU PLANO', href: 'https://example.com/checkout' });
  }
  var S = C.steps, st = { i: 0, ans: {}, hist: [], timers: [] };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function who(t) { var n = (st.name || 'amigo').trim(); return String(t).replace(/\{nome1\}/g, n.split(/\s+/)[0]).replace(/\{nome\}/g, n); }
  function hid(i) { var h = 0, t = 'k' + i + (C.salt || ''); for (var k = 0; k < t.length; k++) h = (h * 31 + t.charCodeAt(k)) >>> 0; return 'step_' + h.toString(36).slice(0, 6); }
  function clear() { st.timers.forEach(function (t) { clearTimeout(t); clearInterval(t); }); st.timers = []; }
  function later(fn, ms) { st.timers.push(setTimeout(fn, ms)); }
  function every(fn, ms) { st.timers.push(setInterval(fn, ms)); }
  function url(i) { return C.route === 'push' ? location.pathname + '?step=' + (i + 1) : C.route === 'hash' ? '#/' + (i + 1) : null; }
  function readStart() {
    if (C.route === 'push') { var m = /[?&]step=(\d+)/.exec(location.search); if (m) return Math.min(S.length - 1, Math.max(0, +m[1] - 1)); }
    if (C.route === 'hash') { var h = /#\/(\d+)/.exec(location.hash); if (h) return Math.min(S.length - 1, Math.max(0, +h[1] - 1)); }
    return 0;
  }
  function nextIndex(i, opt) {
    var s = S[i];
    if (opt && opt.next != null) return opt.next;
    if (s.next != null) return s.next;
    return i + 1;
  }
  function go(i, push) {
    clear();
    if (i >= S.length) { location.href = 'https://example.com/end'; return; }
    if (push !== false) { st.hist.push(st.i); var u = url(i); if (u) history.pushState({ i: i }, '', u); }
    st.i = i;
    render();
  }
  function progress() {
    if (C.progress === false) return '';
    var pct = Math.round((st.i) / Math.max(1, S.length - 1) * 100);
    return '<div class="progress"><i style="width:' + pct + '%"></i></div>';
  }
  function btn(label, cls, attrs) { return '<button class="' + cls + '" ' + (attrs || '') + '>' + esc(label) + '</button>'; }
  function render() {
    var s = S[st.i], h = '';
    var idAttr = C.ids === true ? ' id="' + hid(st.i) + '"' : '';
    h += progress();
    h += '<section class="screen ' + (C.transition === 'fade' ? 't-fade' : C.transition === 'slide' ? 't-slide' : '') + '"' + idAttr + ' data-lab-step="' + (st.i + 1) + '" data-lab-type="' + s.type + '">';
    if (s.img) h += '<img class="hero" src="' + s.img + '" alt="" width="640" height="360">';
    h += '<h2 class="title">' + esc(who(s.title || '')) + '</h2>';
    if (s.sub) h += '<p class="sub">' + esc(who(s.sub)) + '</p>';
    if (s.type === 'single' || s.type === 'multi') {
      h += '<div class="opts">';
      s.options.forEach(function (o, k) {
        var label = typeof o === 'string' ? o : o.t;
        var ot = C.optTag || 'button';
        if (ot === 'label') h += '<label class="opt" data-lab-opt="' + k + '" style="cursor:pointer"><input type="' + (s.type === 'multi' ? 'checkbox' : 'radio') + '" name="q' + st.i + '"><span class="lbl">' + esc(label) + '</span></label>';
        else if (ot === 'div') h += '<div class="opt" data-lab-opt="' + k + '" style="cursor:pointer"><span class="chk"></span><span class="lbl">' + esc(label) + '</span></div>';
        else h += '<button class="opt" data-lab-opt="' + k + '"><span class="chk"></span><span class="lbl">' + esc(label) + '</span></button>';
      });
      h += '</div>';
      if (s.type === 'multi' || C.advance === 'continue') h += btn(s.cta || 'Continuar', 'continue', 'data-lab-continue disabled');
    } else if (s.type === 'input') {
      s.fields.forEach(function (f, k) {
        h += '<label class="fld">' + esc(f.label) + '<input data-lab-field="' + k + '" type="' + (f.type || 'text') + '" placeholder="' + esc(f.ph || '') + '"></label>';
      });
      h += btn(s.cta || 'Continuar', 'continue', 'data-lab-continue disabled');
    } else if (s.type === 'select') {
      h += '<select data-lab-select><option value="">Selecione…</option>' + s.options.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>';
      h += btn(s.cta || 'Continuar', 'continue', 'data-lab-continue disabled');
    } else if (s.type === 'slider') {
      h += '<input type="range" min="' + s.min + '" max="' + s.max + '" value="' + s.min + '" data-lab-slider><div class="val" data-lab-val>' + s.min + '</div>';
      h += btn(s.cta || 'Continuar', 'continue', 'data-lab-continue disabled');
    } else if (s.type === 'info') {
      h += btn(s.cta || 'Continuar', 'continue', 'data-lab-continue');
    } else if (s.type === 'loader') {
      h += '<div class="loader"><div class="bar"><i data-lab-bar></i></div><span class="pct" data-lab-pct>0%</span><p class="status" data-lab-status>' + esc((s.msgs || ['Processando…'])[0]) + '</p></div>';
    } else if (s.type === 'video') {
      h += '<div class="vwrap">' + (s.iframe ? '<iframe src="' + s.iframe + '" width="560" height="315" frameborder="0" allowfullscreen></iframe>' :
        '<video data-lab-video ' + (s.controls ? 'controls ' : '') + (s.autoplay ? 'autoplay muted ' : '') + 'playsinline loop src="/media/flower.webm" poster="' + (s.poster || '') + '"></video>') + '</div>';
      if (s.cd) h += '<p class="cdwrap">Oferta termina em <b class="cd" data-lab-cd>05:00</b></p>';
      h += '<div class="late" data-lab-late style="display:none">' + btn(s.cta || 'QUERO COMPRAR AGORA', 'cta', 'data-lab-cta') + '</div>';
    } else if (s.type === 'countdown') {
      h += '<p class="cdwrap"><b class="cd" data-lab-cd>03:00</b></p>' + btn(s.cta || 'Continuar', 'continue', 'data-lab-continue');
    } else if (s.type === 'result') {
      if (s.cd) h += '<p class="cdwrap">Oferta expira em <b class="cd" data-lab-cd>10:00</b></p>';
      h += '<ul class="bul"><li>Plano completo</li><li>Acesso imediato</li><li>Garantia de 7 dias</li></ul>';
      h += '<div class="late" data-lab-late ' + (s.lateCta ? 'style="display:none"' : '') + '>' + btn(s.cta || 'QUERO COMEÇAR', 'cta', 'data-lab-cta') + '</div>';
    }
    h += '</section>';
    if (C.footer !== false) h += '<footer class="foot">© 2026 Lab Funnel · <a href="#termos">Termos</a></footer>';
    app.innerHTML = h;
    window.scrollTo(0, 0);
    wire(s);
  }
  function wire(s) {
    var cont = app.querySelector('[data-lab-continue]');
    function enable(on) { if (cont) { if (on) cont.removeAttribute('disabled'); else cont.setAttribute('disabled', ''); } }
    if (s.type === 'single' || s.type === 'multi') {
      var opts = [].slice.call(app.querySelectorAll('.opt'));
      opts.forEach(function (o, k) {
        var evName = (C.optTag === 'label') ? 'change' : 'click';
        var target = (C.optTag === 'label') ? o.querySelector('input') : o;
        target.addEventListener(evName, function () {
          var opt = typeof s.options[k] === 'string' ? null : s.options[k];
          if (s.type === 'multi') { o.classList.toggle('sel'); enable(app.querySelectorAll('.opt.sel').length > 0); return; }
          opts.forEach(function (x) { x.classList.remove('sel'); }); o.classList.add('sel');
          st.ans[st.i] = k;
          if (C.advance === 'continue') { enable(true); st.pick = opt; return; }
          later(function () { go(nextIndex(st.i, opt)); }, C.pickDelay || 120);
        });
      });
      if (cont) cont.addEventListener('click', function () { if (cont.hasAttribute('disabled')) return; go(nextIndex(st.i, st.pick)); st.pick = null; });
    } else if (s.type === 'input') {
      var ins = [].slice.call(app.querySelectorAll('input'));
      function valid() { return ins.every(function (el, k) { var v = el.value.trim(); var f = s.fields[k]; if (f.type === 'email') return /.+@.+\..+/.test(v); if (f.type === 'tel') return v.replace(/\D/g, '').length >= 8; return v.length >= 2; }); }
      ins.forEach(function (el) { el.addEventListener('input', function () { enable(valid()); }); });
      cont.addEventListener('click', function () { if (cont.hasAttribute('disabled')) return; if (s.saveName) st.name = ins[0].value.trim(); go(nextIndex(st.i)); });
    } else if (s.type === 'select') {
      var sel = app.querySelector('select'); sel.addEventListener('change', function () { enable(!!sel.value); });
      cont.addEventListener('click', function () { if (!cont.hasAttribute('disabled')) go(nextIndex(st.i)); });
    } else if (s.type === 'slider') {
      var r = app.querySelector('input[type=range]'), v = app.querySelector('[data-lab-val]');
      r.addEventListener('input', function () { v.textContent = r.value; enable(+r.value > +s.min); });
      cont.addEventListener('click', function () { if (!cont.hasAttribute('disabled')) go(nextIndex(st.i)); });
    } else if (s.type === 'info' || s.type === 'countdown') {
      cont.addEventListener('click', function () { go(nextIndex(st.i)); });
      if (s.type === 'countdown') countdown(180);
    } else if (s.type === 'loader') {
      var bar = app.querySelector('[data-lab-bar]'), pct = app.querySelector('[data-lab-pct]'), status = app.querySelector('[data-lab-status]');
      var total = (s.secs || 4) * 1000, t0 = Date.now(), msgs = s.msgs || ['Processando…'];
      every(function () {
        var p = Math.min(100, Math.round((Date.now() - t0) / total * 100));
        bar.style.width = p + '%'; pct.textContent = p + '%';
        status.textContent = msgs[Math.min(msgs.length - 1, Math.floor(p / (100 / msgs.length)))];
        if (p >= 100) { clear(); later(function () { go(nextIndex(st.i)); }, 350); }
      }, 100);
    } else if (s.type === 'video') {
      var vd = app.querySelector('video'), late = app.querySelector('[data-lab-late]');
      var at = s.ctaAt || 3;
      if (vd) {
        vd.addEventListener('timeupdate', function () { if (vd.currentTime >= at) late.style.display = ''; });
        if (!s.controls) vd.addEventListener('click', function () { if (vd.paused) vd.play(); else vd.pause(); });
        if (s.pauseGoto != null) vd.addEventListener('pause', function () { if (!vd.ended && vd.currentTime > 0.5) go(s.pauseGoto); });
        vd.addEventListener('ended', function () { late.style.display = ''; });
      } else later(function () { late.style.display = ''; }, at * 1000);
      if (s.lateTimer) later(function () { late.style.display = ''; }, s.lateTimer * 1000);
      if (s.cd) countdown(300);
      app.querySelector('[data-lab-cta]').addEventListener('click', function () { if (s.href) location.href = s.href; else go(nextIndex(st.i)); });
    } else if (s.type === 'result') {
      var cta = app.querySelector('[data-lab-cta]'), l2 = app.querySelector('[data-lab-late]');
      if (s.lateCta) later(function () { l2.style.display = ''; }, s.lateCta * 1000);
      if (s.cd) countdown(600);
      cta.addEventListener('click', function () { location.href = s.href || 'https://example.com/checkout'; });
    }
    if (s.autoNext) later(function () { go(nextIndex(st.i)); }, s.autoNext * 1000);
    if (s.delays) s.delays.forEach(function (d) {
      var el = app.querySelector(d.sel); if (!el) return;
      el.style.visibility = 'hidden'; later(function () { el.style.visibility = ''; }, d.at);
    });
  }
  function countdown(secs) {
    var el = app.querySelector('[data-lab-cd]'); if (!el) return;
    var t0 = Date.now();
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function tick() { var r = Math.max(0, secs - Math.floor((Date.now() - t0) / 1000)); el.textContent = pad(Math.floor(r / 60)) + ':' + pad(r % 60); }
    tick(); every(tick, 1000);
  }
  window.addEventListener('popstate', function (e) {
    var i = readStart(); if (C.route === 'push' || C.route === 'hash') { clear(); st.i = i; render(); }
  });
  function cookie() {
    var d = document.createElement('div'); d.id = 'onetrust-banner-sdk';
    d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #ccc;padding:14px;z-index:9999;font:14px system-ui';
    d.innerHTML = '<b>Valorizamos sua privacidade</b> <button id="onetrust-accept-btn-handler" style="margin-left:10px">Aceitar</button>';
    document.body.appendChild(d);
    d.querySelector('button').onclick = function () { d.remove(); };
  }
  function popup() {
    var d = document.createElement('div'); d.className = 'lab-popup';
    d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9998';
    d.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:300px;font-family:system-ui"><h3>Espere!</h3><p>Receba 10% de desconto</p><button data-lab-close>Fechar</button></div>';
    document.body.appendChild(d); d.querySelector('button').onclick = function () { d.remove(); };
  }
  function boot() {
    st.i = readStart(); render();
    if (C.cookie) cookie();
    if (C.popupAt) setTimeout(popup, C.popupAt);
  }
  if (C.renderDelay) { app.innerHTML = '<p class="sub" style="text-align:center;padding:40px">Carregando…</p>'; setTimeout(boot, C.renderDelay); } else boot();
})();
