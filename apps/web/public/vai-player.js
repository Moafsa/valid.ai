/*
 * be-Vallid VSL player: small, independent, no third-party player inside.
 *
 * It replaces the heavy players of sales pages (VTurb, Panda, Wistia, plain
 * <video>) with one light player that follows the SAME RULES the original had.
 * Mounted on every  <div data-vai-player='{"src":"...","poster":"..."}'>  that
 * the cloner (or the editor) puts on the page, inside a box that keeps the
 * original proportion, position and responsiveness.
 *
 * Config (everything optional except src or embed):
 *   src        video URL: .mp4 / .webm / .m3u8 (HLS, hls.js is loaded only when needed)
 *   embed      iframe URL (YouTube, Vimeo...) when there is no direct file: shown as a
 *              light cover, the real iframe is created only when the visitor presses play
 *   poster     cover image (thumbnail)
 *   preview    short muted clip that loops before the click (VTurb "smart autoplay")
 *   start      'click'   waits for a tap
 *              'auto'    starts when the page opens (muted + "turn on sound" if the browser says no)
 *              'preview' muted loop first, a tap restarts it from 0 WITH sound (default with a cover)
 *   bar        'smart' a bar that fills fast then slows down and never shows the time left (default)
 *              'plain' an honest thin bar, no times
 *              'full'  complete controls: play/pause, time, seek, volume, fullscreen
 *              'none'  nothing
 *   pause      'free'  a tap pauses / resumes (default)
 *              'never' the visitor cannot pause
 *              'once'  one pause is allowed; after resuming it is locked
 *   seek       false (default) cannot skip ahead of what was watched; true allows it
 *   fullscreen true shows a fullscreen button
 *   loop       true restarts at the end
 *   resume     true (default) remembers where the visitor stopped and offers to continue
 *   curve      how generous the smart bar is, 0.3 (very) .. 1 (honest). default 0.55
 *   color      bar colour
 *   hint       text over the cover ("Clique para ouvir")
 *   cover      'shot' when the cover is a picture of the original player (no play button drawn)
 *   resumeText {title, play, replay}  texts of the "continue watching?" box
 *   soundText  text of the "turn on the sound" tag
 *
 * Page hooks: dispatches  vai:video  {e: play|pause|resume|end|unmute|fullscreen, t, d, src}
 * and  vai:video-time  {t, d, src}  on window; the page runtime uses them for rules
 * ("when paused go to...") and to show things at a moment of the video.
 * Reports plays, milestones, pauses and how long people stayed to /api/track.
 */
(function () {
  if (window.__VAIPlayer) return;

  var CSS = '' +
    '.vai-pl{position:absolute;inset:0;overflow:hidden;background:#000;cursor:pointer;-webkit-tap-highlight-color:transparent;border-radius:inherit;user-select:none;-webkit-user-select:none}' +
    '.vai-pl video,.vai-pl img.vai-pl-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;background:#000}' +
    '.vai-pl video.vai-pl-main{object-fit:contain}' +
    '.vai-pl iframe{position:absolute;inset:0;width:100%;height:100%;border:0}' +
    '.vai-pl-play{position:absolute;left:50%;top:50%;width:72px;height:72px;margin:-36px 0 0 -36px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 0 3px rgba(255,255,255,.85);padding-left:4px;box-sizing:border-box}' +
    '.vai-pl-hint{position:absolute;left:0;right:0;bottom:14%;text-align:center;color:#fff;font:700 15px/1.2 system-ui,sans-serif;text-shadow:0 1px 6px rgba(0,0,0,.8);pointer-events:none}' +
    '.vai-pl-bar{position:absolute;left:0;right:0;bottom:0;height:5px;background:rgba(255,255,255,.22);opacity:0;transition:opacity .3s;pointer-events:none}' +
    '.vai-pl.vai-on .vai-pl-bar{opacity:1}' +
    '.vai-pl-bar i{display:block;height:100%;width:0;background:var(--vai-bar,#fff);transition:width .35s linear}' +
    '.vai-pl-pause{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;pointer-events:none}' +
    '.vai-pl.vai-paused .vai-pl-pause{opacity:1}' +
    '.vai-pl-sound{position:absolute;left:50%;top:14px;transform:translateX(-50%);background:rgba(0,0,0,.7);color:#fff;font:700 14px/1 system-ui,sans-serif;padding:10px 16px;border-radius:999px;display:none;white-space:nowrap;box-shadow:0 0 0 2px rgba(255,255,255,.8);pointer-events:none}' +
    '.vai-pl.vai-muted .vai-pl-sound{display:block}' +
    '.vai-pl-fs{position:absolute;right:8px;bottom:12px;width:34px;height:34px;border:0;border-radius:8px;background:rgba(0,0,0,.5);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity .3s;padding:0}' +
    '.vai-pl.vai-on .vai-pl-fs{opacity:1}' +
    '.vai-pl-ctl{position:absolute;left:0;right:0;bottom:0;display:none;align-items:center;gap:8px;padding:8px 10px;background:linear-gradient(transparent,rgba(0,0,0,.75));color:#fff;font:600 12px system-ui,sans-serif;cursor:default}' +
    '.vai-pl.vai-full.vai-on .vai-pl-ctl{display:flex}' +
    '.vai-pl-ctl button{border:0;background:none;color:#fff;cursor:pointer;padding:4px 6px;min-width:28px;display:flex;align-items:center;justify-content:center}' +
    '.vai-pl-ctl input[type=range]{flex:1;min-width:0;height:4px;accent-color:var(--vai-bar,#fff);cursor:pointer}' +
    '.vai-pl-resume{position:absolute;inset:0;display:none;flex-direction:column;gap:10px;align-items:center;justify-content:center;background:rgba(0,0,0,.72);z-index:3}' +
    '.vai-pl-resume.vai-show{display:flex}' +
    '.vai-pl-resume b{color:#fff;font:700 16px system-ui,sans-serif;text-align:center;padding:0 16px}' +
    '.vai-pl-resume button{border:0;border-radius:10px;padding:12px 18px;font:700 15px system-ui,sans-serif;cursor:pointer;min-width:220px;max-width:88%}' +
    '.vai-pl-resume button.vai-primary{background:#22c55e;color:#04210f}' +
    '.vai-pl-resume button.vai-secondary{background:rgba(255,255,255,.14);color:#fff}';

  // drawn, not typed: the glyphs for these symbols are missing on plenty of phones
  var SV = function (d, w) { return '<svg viewBox="0 0 24 24" width="' + (w || 22) + '" height="' + (w || 22) + '" fill="currentColor" aria-hidden="true"><path d="' + d + '"/></svg>'; };
  var ICON = {
    play: SV('M8 5v14l11-7z', 34),
    playS: SV('M8 5v14l11-7z'),
    pause: SV('M6 5h4v14H6zM14 5h4v14h-4z'),
    pauseBig: SV('M6 5h4v14H6zM14 5h4v14h-4z', 30),
    vol: SV('M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z'),
    mute: SV('M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.4-2.4-1.4-1.4-2.4 2.4-2.4-2.4-1.4 1.4 2.4 2.4-2.4 2.4 1.4 1.4 2.4-2.4 2.4 2.4 1.4-1.4z'),
    fs: SV('M5 5h5v2H7v3H5V5zm9 0h5v5h-2V7h-3V5zM5 14h2v3h3v2H5v-5zm12 0h2v3h-3v2h-5v-2h3v-3z', 20),
  };

  function injectCss() {
    if (document.getElementById('vai-player-css')) return;
    var st = document.createElement('style');
    st.id = 'vai-player-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  var hlsPromise = null;
  function loadHls() {
    if (window.Hls) return Promise.resolve();
    if (hlsPromise) return hlsPromise;
    // our own copy first (same host, nothing else to connect to); the public CDN only if that fails
    function add(src) {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = function () { resolve(); };
        s.onerror = function () { s.remove(); reject(new Error('hls.js failed to load')); };
        document.body.appendChild(s);
      });
    }
    hlsPromise = add('/hls.min.js').catch(function () { return add('https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js'); }).catch(function (e) { hlsPromise = null; throw e; });
    return hlsPromise;
  }

  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function track(src, e, t, d) {
    if (typeof window.vaiBeacon !== 'function') return;
    window.vaiBeacon({ type: 'video', path: location.pathname, data: { src: String(src).slice(0, 200), e: e, t: Math.round(t || 0), d: Math.round(d || 0) } });
    if (window.vaiAnalytics && window.vaiAnalytics.video) window.vaiAnalytics.video(src, e, t, d);
  }

  function whenNear(host, cb) {
    if (!('IntersectionObserver' in window)) { cb(); return; }
    var io = new IntersectionObserver(function (es) {
      if (es[0] && es[0].isIntersecting) { io.disconnect(); cb(); }
    }, { rootMargin: '400px' });
    io.observe(host);
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function mount(host) {
    if (host.getAttribute('data-vai-ready')) return;
    var cfg = {};
    try { cfg = JSON.parse(host.getAttribute('data-vai-player') || '{}'); } catch (e) { return; }
    if (!cfg.src && !cfg.embed) return;
    host.setAttribute('data-vai-ready', '1');
    injectCss();

    var id = cfg.src || cfg.embed;
    var barMode = cfg.bar === 'plain' || cfg.bar === 'none' || cfg.bar === 'full' ? cfg.bar : 'smart';
    var pauseMode = cfg.pause === 'never' || cfg.pause === false ? 'never' : cfg.pause === 'once' ? 'once' : 'free';
    var canSeekAhead = cfg.seek === true;
    var key = 'vai_resume_' + hash(id);
    var startMode = cfg.start === 'click' || cfg.start === 'auto' || cfg.start === 'preview' ? cfg.start : ((cfg.preview || cfg.poster) ? 'preview' : 'click');
    if (cfg.embed && !cfg.src && startMode !== 'auto') startMode = 'click';
    var curve = typeof cfg.curve === 'number' ? cfg.curve : 0.55;

    var box = document.createElement('div');
    box.className = 'vai-pl' + (barMode === 'full' ? ' vai-full' : '');
    if (cfg.color) box.style.setProperty('--vai-bar', cfg.color);
    host.innerHTML = '';
    host.appendChild(box);

    /* ── the cover: a light picture (or a muted clip), never the heavy video ── */
    var cover = null;
    if (cfg.preview && cfg.src) {
      cover = document.createElement('video');
      cover.muted = true; cover.loop = true; cover.autoplay = true;
      cover.setAttribute('playsinline', ''); cover.setAttribute('muted', '');
      cover.preload = 'metadata';
      cover.src = cfg.preview;
      if (cfg.poster) cover.poster = cfg.poster;
      box.appendChild(cover);
    } else if (cfg.poster) {
      cover = document.createElement('img');
      cover.className = 'vai-pl-poster';
      cover.src = cfg.poster;
      cover.alt = '';
      cover.decoding = 'async';
      cover.loading = 'lazy';
      box.appendChild(cover);
    }

    var main = null;
    if (cfg.src) {
      main = document.createElement('video');
      main.className = 'vai-pl-main';
      main.setAttribute('playsinline', '');
      main.setAttribute('webkit-playsinline', '');
      main.preload = 'none';
      main.style.display = 'none';
      if (cfg.loop) main.loop = true;
      box.appendChild(main);
    }

    var playBtn = null;
    if ((startMode === 'click' && cfg.cover !== 'shot') || !cover) {
      playBtn = document.createElement('div');
      playBtn.className = 'vai-pl-play';
      playBtn.innerHTML = ICON.play;
      box.appendChild(playBtn);
    }
    var hint = null;
    if (cfg.hint) {
      hint = document.createElement('div');
      hint.className = 'vai-pl-hint';
      hint.textContent = cfg.hint;
      box.appendChild(hint);
    }
    var bar = document.createElement('div');
    bar.className = 'vai-pl-bar';
    bar.innerHTML = '<i></i>';
    if (barMode !== 'smart' && barMode !== 'plain') bar.style.display = 'none';
    box.appendChild(bar);
    var fill = bar.firstChild;
    var pauseIcon = document.createElement('div');
    pauseIcon.className = 'vai-pl-pause';
    pauseIcon.innerHTML = ICON.pauseBig;
    box.appendChild(pauseIcon);
    var soundTag = document.createElement('div');
    soundTag.className = 'vai-pl-sound';
    soundTag.textContent = cfg.soundText || 'Toque para ligar o som';
    box.appendChild(soundTag);

    function toggleFs() {
      var inFs = document.fullscreenElement || document.webkitFullscreenElement;
      try {
        if (inFs) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
        if (box.requestFullscreen) box.requestFullscreen();
        else if (box.webkitRequestFullscreen) box.webkitRequestFullscreen();
        else if (main && main.webkitEnterFullscreen) main.webkitEnterFullscreen();   // iPhone
        emit('fullscreen');
        if (!sent.fs) { sent.fs = 1; track(id, 'fullscreen', main ? main.currentTime : 0, main ? main.duration : 0); }
      } catch (e) { /* not allowed */ }
    }
    if (cfg.fullscreen && barMode !== 'full' && cfg.src) {
      var fsBtn = document.createElement('button');
      fsBtn.className = 'vai-pl-fs';
      fsBtn.type = 'button';
      fsBtn.setAttribute('aria-label', 'Tela cheia');
      fsBtn.innerHTML = ICON.fs;
      fsBtn.addEventListener('click', function (ev) { ev.stopPropagation(); toggleFs(); });
      box.appendChild(fsBtn);
    }

    /* complete controls */
    var ctl = null, ctlPlay = null, ctlTime = null, ctlSeek = null, ctlMute = null;
    if (barMode === 'full' && cfg.src) {
      ctl = document.createElement('div');
      ctl.className = 'vai-pl-ctl';
      ctl.addEventListener('click', function (ev) { ev.stopPropagation(); });
      ctlPlay = document.createElement('button'); ctlPlay.type = 'button'; ctlPlay.innerHTML = ICON.pause; ctlPlay.setAttribute('aria-label', 'Pausar');
      ctlTime = document.createElement('span'); ctlTime.textContent = '0:00 / 0:00';
      ctlSeek = document.createElement('input'); ctlSeek.type = 'range'; ctlSeek.min = '0'; ctlSeek.max = '1000'; ctlSeek.value = '0';
      ctlMute = document.createElement('button'); ctlMute.type = 'button'; ctlMute.innerHTML = ICON.vol; ctlMute.setAttribute('aria-label', 'Som');
      var ctlFs = document.createElement('button'); ctlFs.type = 'button'; ctlFs.innerHTML = ICON.fs; ctlFs.setAttribute('aria-label', 'Tela cheia');
      ctl.appendChild(ctlPlay); ctl.appendChild(ctlTime); ctl.appendChild(ctlSeek); ctl.appendChild(ctlMute);
      if (cfg.fullscreen !== false) ctl.appendChild(ctlFs);
      box.appendChild(ctl);
      ctlFs.addEventListener('click', toggleFs);
    }

    var resumeBox = document.createElement('div');
    resumeBox.className = 'vai-pl-resume';
    box.appendChild(resumeBox);

    var started = false, maxT = 0, sent = {}, srcReady = null, pausedOnce = false, locked = false, wantSound = false;

    function emit(e) {
      var t = main ? main.currentTime : 0, d = main ? (main.duration || 0) : 0;
      try { window.dispatchEvent(new CustomEvent('vai:video', { detail: { e: e, t: t, d: d, src: id } })); } catch (err) { /* old browser */ }
    }

    /* ── source: a file straight into <video>, HLS through hls.js (only now) ── */
    function attachSource() {
      if (srcReady) return srcReady;
      if (/\.m3u8(\?|$)/i.test(cfg.src) && !main.canPlayType('application/vnd.apple.mpegurl')) {
        srcReady = loadHls().then(function () {
          if (!window.Hls || !window.Hls.isSupported()) { main.src = cfg.src; return; }
          var hls = new window.Hls({ maxBufferLength: 30 });
          hls.loadSource(cfg.src);
          hls.attachMedia(main);
        });
      } else {
        main.src = cfg.src;
        srcReady = Promise.resolve();
      }
      return srcReady;
    }

    function tryPlay() {
      var pr = main.play();
      // a browser that refuses sound without a recent tap: start muted rather than not at all
      if (pr && pr.catch) pr.catch(function () {
        main.muted = true;
        wantSound = true;
        box.classList.add('vai-muted');
        main.play().catch(function () {});
      });
    }

    function embedStart() {
      if (started) return;
      started = true;
      box.classList.add('vai-on');
      if (playBtn) playBtn.remove();
      var f = document.createElement('iframe');
      var u = cfg.embed;
      u += (u.indexOf('?') > -1 ? '&' : '?') + 'autoplay=1';
      // the frame is asked to say where the video is (the same clock a native video gives), so what the original shows at a moment of
      // the video (a buy button at minute 3) comes up at that moment in the clone
      if (/youtube(-nocookie)?\.com\/embed/i.test(u) && !/enablejsapi=/.test(u)) u += '&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
      if (/player\.vimeo\.com/i.test(u) && !/[?&]api=/.test(u)) u += '&api=1';
      f.src = u;
      f.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
      f.setAttribute('allowfullscreen', '');
      box.appendChild(f);
      box.style.cursor = 'default';
      watchEmbedClock(f, u);
      if (!sent.play) { sent.play = 1; track(id, 'play', 0, 0); emit('play'); }
    }

    /* the video inside a frame answers by message: YouTube sends its position while it plays, Vimeo when asked; a player that says nothing
       is timed from the tap (it cannot be paused from here, so this is only the fallback) */
    function watchEmbedClock(f, u) {
      var yt = /youtube(-nocookie)?\.com\/embed/i.test(u), vim = /player\.vimeo\.com/i.test(u);
      var t0 = Date.now(), real = false;
      function tick(t, dur) {
        if (!(t >= 0)) return;
        if (t > maxT) maxT = t;
        try { window.dispatchEvent(new CustomEvent('vai:video-time', { detail: { t: t, d: dur || 0, src: id } })); } catch (e) { /* old browser */ }
      }
      function say(o) { try { f.contentWindow.postMessage(typeof o === 'string' ? o : JSON.stringify(o), '*'); } catch (e) { /* frame gone */ } }
      function listen() {
        if (yt) { say({ event: 'listening', id: 1, channel: 'widget' }); say({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: 1, channel: 'widget' }); }
        if (vim) { say({ method: 'addEventListener', value: 'timeupdate' }); say({ method: 'addEventListener', value: 'playProgress' }); }
      }
      window.addEventListener('message', function (ev) {
        if (ev.source !== f.contentWindow) return;
        var d = ev.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
        if (!d || typeof d !== 'object') return;
        if (yt) {
          if (d.event === 'onReady') listen();
          if (d.info && typeof d.info.currentTime === 'number' && d.info.playerState !== undefined) { real = true; tick(d.info.currentTime, d.info.duration); }
        } else if (vim) {
          if (d.event === 'ready') listen();
          if (d.event === 'timeupdate' && d.data && typeof d.data.seconds === 'number') { real = true; tick(d.data.seconds, d.data.duration); }
          else if (d.event === 'playProgress' && d.data && typeof d.data.seconds === 'number') { real = true; tick(d.data.seconds, d.data.duration); }
        }
      });
      f.addEventListener('load', function () { listen(); setTimeout(listen, 1200); setTimeout(listen, 3500); });
      setInterval(function () { if (!real && Date.now() - t0 > 6000) tick((Date.now() - t0) / 1000); }, 1000);
    }

    function begin(from) {
      if (!main) { embedStart(); return; }
      started = true;
      box.classList.add('vai-on');
      if (playBtn) playBtn.remove();
      if (hint) hint.remove();
      resumeBox.classList.remove('vai-show');
      attachSource().then(function () {
        main.style.display = 'block';
        main.preload = 'auto';
        main.muted = false;
        // keep the cover up until the video really shows a frame, so there is no black flash
        if (cover) main.addEventListener('playing', function () { if (cover.pause) cover.pause(); cover.style.display = 'none'; }, { once: true });
        if (from > 0) main.addEventListener('loadedmetadata', function () { try { main.currentTime = from; } catch (e) { /* not seekable yet */ } }, { once: true });
        tryPlay();
      });
      if (!sent.play) { sent.play = 1; track(id, 'play', 0, 0); emit('play'); }
    }

    function saved() {
      if (cfg.resume === false) return 0;
      try { return parseFloat(localStorage.getItem(key)) || 0; } catch (e) { return 0; }
    }

    function start() {
      var at = saved();
      if (at > 8 && !started && main) {
        var rt = cfg.resumeText || {};
        resumeBox.innerHTML = '';
        var title = document.createElement('b'); title.textContent = rt.title || 'Você já começou a assistir';
        var go = document.createElement('button'); go.className = 'vai-primary'; go.textContent = rt.play || 'Continuar de onde parei';
        var again = document.createElement('button'); again.className = 'vai-secondary'; again.textContent = rt.replay || 'Assistir desde o início';
        go.onclick = function (ev) { ev.stopPropagation(); begin(at); };
        again.onclick = function (ev) { ev.stopPropagation(); try { localStorage.removeItem(key); } catch (e) {} begin(0); };
        resumeBox.appendChild(title); resumeBox.appendChild(go); resumeBox.appendChild(again);
        resumeBox.classList.add('vai-show');
        return;
      }
      begin(0);
    }

    function unmute() {
      if (!main || !wantSound) return false;
      wantSound = false;
      main.muted = false;
      box.classList.remove('vai-muted');
      emit('unmute');
      return true;
    }

    /* ── what a tap does once the video runs: the original's pause rule ── */
    function onTap() {
      if (!started) { start(); return; }
      if (!main) return;
      if (unmute()) return;
      if (pauseMode === 'never' || locked) return;
      if (main.paused) {
        main.play().catch(function () {});
        if (pauseMode === 'once' && pausedOnce) locked = true;
      } else {
        main.pause();
        if (pauseMode === 'once') pausedOnce = true;
      }
    }
    box.addEventListener('click', onTap);

    if (main) {
      main.addEventListener('pause', function () {
        if (main.ended || !started) return;
        // a locked video comes back on its own
        if (pauseMode === 'never' || locked) {
          if (document.visibilityState !== 'hidden') setTimeout(function () { if (main.paused && !main.ended) main.play().catch(function () {}); }, 60);
          return;
        }
        box.classList.add('vai-paused');
        sent.wasPaused = 1;
        if (ctlPlay) { ctlPlay.innerHTML = ICON.playS; ctlPlay.setAttribute('aria-label', 'Continuar'); }
        if (document.visibilityState === 'hidden') return;
        track(id, 'pause', main.currentTime, main.duration);
        emit('pause');
      });
      main.addEventListener('playing', function () {
        box.classList.remove('vai-paused');
        if (ctlPlay) { ctlPlay.innerHTML = ICON.pause; ctlPlay.setAttribute('aria-label', 'Pausar'); }
        if (sent.wasPaused) { sent.wasPaused = 0; emit('resume'); }
      });
      main.addEventListener('ended', function () {
        box.classList.remove('vai-paused');
        track(id, 'p100', main.duration, main.duration);
        emit('end');
      });

      // no skipping ahead of what was actually watched
      main.addEventListener('seeking', function () {
        if (canSeekAhead) return;
        if (main.currentTime > maxT + 2) main.currentTime = maxT;
      });

      var lastSave = 0;
      main.addEventListener('timeupdate', function () {
        var t = main.currentTime, d = main.duration || 0;
        if (t > maxT) maxT = t;
        if (barMode === 'smart' && d) {
          fill.style.width = (Math.pow(Math.min(1, t / d), curve) * 100).toFixed(2) + '%';
        } else if (barMode === 'plain' && d) {
          fill.style.width = (t / d * 100).toFixed(2) + '%';
        }
        if (ctl && d) {
          ctlTime.textContent = fmt(t) + ' / ' + fmt(d);
          if (!ctlSeek.__drag) ctlSeek.value = String(Math.round(t / d * 1000));
        }
        window.dispatchEvent(new CustomEvent('vai:video-time', { detail: { t: maxT, d: d, src: id } }));
        if (d) {
          [['p25', .25], ['p50', .5], ['p75', .75], ['p95', .95]].forEach(function (m) {
            if (!sent[m[0]] && maxT / d >= m[1]) { sent[m[0]] = 1; track(id, m[0], maxT, d); }
          });
        }
        if (Date.now() - lastSave > 2000 && cfg.resume !== false) {
          lastSave = Date.now();
          try { if (d && t > d - 10) localStorage.removeItem(key); else localStorage.setItem(key, String(t)); } catch (e) {}
        }
      });

      if (ctl) {
        ctlPlay.addEventListener('click', function () { onTap(); });
        ctlMute.addEventListener('click', function () {
          main.muted = !main.muted;
          ctlMute.innerHTML = main.muted ? ICON.mute : ICON.vol;
          box.classList.remove('vai-muted');
          wantSound = false;
        });
        ctlSeek.addEventListener('input', function () { ctlSeek.__drag = true; });
        ctlSeek.addEventListener('change', function () {
          ctlSeek.__drag = false;
          var d = main.duration || 0;
          if (!d) return;
          var to = d * (parseInt(ctlSeek.value, 10) / 1000);
          if (!canSeekAhead && to > maxT + 2) to = maxT;
          main.currentTime = to;
        });
      }
    }

    function leave() {
      if (started && main && !sent.leave) { sent.leave = 1; track(id, 'leave', maxT, main.duration || 0); }
    }
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { leave(); sent.leave = 0; return; }
      // back on the tab: a video that may not be paused carries on
      if (main && started && (pauseMode === 'never' || locked) && main.paused && !main.ended) main.play().catch(function () {});
    });

    if (startMode === 'auto') {
      // when the page opens (or the player first comes near the screen): with sound if the
      // browser allows it, muted with a "turn on the sound" tag if it does not
      whenNear(host, function () {
        if (started) return;
        var at = saved();
        begin(at > 8 ? at : 0);
      });
    } else if (cfg.src && !/\.m3u8(\?|$)/i.test(cfg.src) && startMode !== 'preview') {
      // a file gets only its first bytes, and only once it is near the screen
      whenNear(host, function () { if (!started && main) { main.preload = 'metadata'; attachSource(); } });
    }
  }

  window.__VAIPlayer = {
    mount: mount,
    scan: function (root) {
      (root || document).querySelectorAll('[data-vai-player]:not([data-vai-ready])').forEach(mount);
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { window.__VAIPlayer.scan(document); });
})();
