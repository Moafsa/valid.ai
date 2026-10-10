import asyncio, sys, json
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "https://gluteobrasileno.online/?step=result"
INIT = r"""
(() => {
  window.__ev = [];
  const o = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (t, f, op) {
    const who = this === window ? 'window' : this === document ? 'document' : (this.tagName || this.constructor.name || '?') + (this.id ? '#' + this.id : '');
    window.__ev.push([t, who]);
    if (/^(video:|player:|pause|ended|play$|smartautoplay|analytics)/.test(t)) { try { (window.__src = window.__src || []).push([t, who, Function.prototype.toString.call(f).slice(0, 260)]); } catch (e) {} }
    return o.call(this, t, f, op);
  };
  const oo = window.open; window.open = function (u) { (window.__opens = window.__opens || []).push(String(u)); return null; };
  for (const m of ['pushState','replaceState']) { const h = history[m]; history[m] = function () { (window.__hist = window.__hist || []).push([m, String(arguments[2])]); return h.apply(this, arguments); }; }
})();
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 1280, "height": 800})
        await ctx.add_init_script(INIT)
        pg = await ctx.new_page()
        navs = []
        pg.on("framenavigated", lambda f: navs.append(f.url) if f == pg.main_frame else None)
        await pg.goto(URL, wait_until="domcontentloaded")
        await pg.wait_for_timeout(4000)
        info = await pg.evaluate("""() => ({
          videos: [...document.querySelectorAll('video')].map(v => ({src: v.currentSrc || v.src, paused: v.paused, muted: v.muted, t: v.currentTime, dur: v.duration, controls: v.controls, rect: v.getBoundingClientRect().toJSON()})),
          iframes: [...document.querySelectorAll('iframe')].map(i => i.src),
          customs: [...document.querySelectorAll('*')].filter(n => n.tagName.includes('-')).map(n => n.tagName).slice(0, 20),
          evs: [...new Set(window.__ev.map(e => e.join('@')))].slice(0, 120),
        })""")
        info['evs'] = [e for e in info['evs'] if not e.endswith('@DIV#root')][:60]
        print(json.dumps({k: v for k, v in info.items() if k != 'evs'}, indent=1)[:2500])
        print('EVS', info['evs'])
        srcs = await pg.evaluate("window.__src || []")
        for t, who, f in srcs[:14]: print('SRC', t, who, '|', f.replace('\n', ' ')[:220])
        print('GLOBALS', await pg.evaluate("Object.keys(window).filter(k => /smart|vturb|player|vid_/i.test(k))"))
        await pg.screenshot(path="/tmp/glu_pause_0.png")
        v = info["videos"][0] if info["videos"] else None
        if v:
            r = v["rect"]
            cx, cy = r["x"] + r["width"] / 2, r["y"] + r["height"] / 2
            await pg.mouse.click(cx, cy)
            await pg.wait_for_timeout(3000)
            print("after click1", await pg.evaluate("() => [...document.querySelectorAll('video')].map(v => [v.paused, v.muted, v.currentTime])"), pg.url)
            await pg.mouse.click(cx, cy)
            await pg.wait_for_timeout(3000)
            print("after click2 (pause?)", await pg.evaluate("() => [...document.querySelectorAll('video')].map(v => [v.paused, v.muted, v.currentTime])"), pg.url)
            await pg.screenshot(path="/tmp/glu_pause_1.png")
            for name, js in [
              ('dom pause event', "() => { document.querySelectorAll('vturb-smartplayer, vturb-player').forEach(e => { e.dispatchEvent(new CustomEvent('video:pause', {bubbles:true, composed:true})); }); window.dispatchEvent(new Event('blur')); }"),
              ('smartplayer api', "() => { const sp = window.smartplayer; const i = sp && sp.instances && sp.instances[0]; if (i && i.pause) i.pause(); return !!i; }"),
              ('video pause js', "() => document.querySelectorAll('vturb-smartplayer').forEach(h => { const v = h.shadowRoot && h.shadowRoot.querySelector('video'); if (v) { v.dispatchEvent(new Event('play')); v.dispatchEvent(new Event('pause')); } })"),
            ]:
                try: r = await pg.evaluate(js)
                except Exception as e: r = repr(e)[:80]
                await pg.wait_for_timeout(2500)
                print('TRY', name, r, '->', pg.url, 'navs', len(navs))
            await pg.evaluate("() => document.querySelectorAll('video').forEach(v => v.pause())")
            await pg.wait_for_timeout(3000)
            print("after js pause", pg.url, navs[-3:], await pg.evaluate("() => [window.__hist, window.__opens]"))
        print("NAVS", navs)
        await b.close()
asyncio.run(main())
