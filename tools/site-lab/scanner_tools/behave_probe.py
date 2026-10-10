import asyncio, sys, json
from playwright.async_api import async_playwright
url = sys.argv[1]
INSTR = r"""
(() => {
  const log = (window.__behav = window.__behav || []);
  const L = (kind, detail) => { try { log.push([Math.round(performance.now()), kind, String(detail).slice(0, 160)]); } catch (e) {} };
  const origAdd = EventTarget.prototype.addEventListener;
  const watched = /^(mouseout|mouseleave|mouseenter|beforeunload|unload|pagehide|visibilitychange|popstate|blur|focus|scroll|keydown|contextmenu|copy|touchstart|touchmove|resize|hashchange|deviceorientation|devicemotion)$/;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (watched.test(type)) {
      const who = this === window ? 'window' : this === document ? 'document' : (this.tagName || this.constructor.name);
      L('listener', type + ' on ' + who);
    }
    return origAdd.call(this, type, fn, opts);
  };
  const st = window.setTimeout;
  window.setTimeout = function (fn, ms, ...a) { if (ms >= 2500) L('timeout', ms + 'ms'); return st.call(this, fn, ms, ...a); };
  const si = window.setInterval;
  window.setInterval = function (fn, ms, ...a) { L('interval', ms + 'ms'); return si.call(this, fn, ms, ...a); };
  for (const m of ['pushState', 'replaceState']) { const o = history[m]; history[m] = function (s, t, u) { L('history.' + m, u); return o.apply(this, arguments); }; }
  const op = window.open; window.open = function (u) { L('window.open', u); return op.apply(this, arguments); };
  const f = window.fetch; window.fetch = function (u, o) { L('fetch', (o && o.method || 'GET') + ' ' + (typeof u === 'string' ? u : u.url)); return f.apply(this, arguments); };
  const sb = navigator.sendBeacon && navigator.sendBeacon.bind(navigator); if (sb) navigator.sendBeacon = function (u) { L('sendBeacon', u); return sb.apply(null, arguments); };
  try { const proto = Storage.prototype; const gi = proto.getItem, si2 = proto.setItem;
    proto.getItem = function (k) { L('storage.get', k); return gi.call(this, k); };
    proto.setItem = function (k, v) { L('storage.set', k + '=' + String(v).slice(0, 40)); return si2.call(this, k, v); }; } catch (e) {}
  const dc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (dc) Object.defineProperty(document, 'cookie', { get() { return dc.get.call(document); }, set(v) { L('cookie.set', String(v).split(';')[0]); dc.set.call(document, v); } });
})();
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
        await ctx.add_init_script(INSTR)
        pg = await ctx.new_page()
        navs = []
        pg.on('framenavigated', lambda f: navs.append(f.url[:120]) if f == pg.main_frame else None)
        pg.on('popup', lambda p2: navs.append('POPUP ' + p2.url[:100]))
        reqs = []
        pg.on('request', lambda r: reqs.append(r.method + ' ' + r.url[:110]) if r.resource_type in ('xhr','fetch','document','ping') or r.method != 'GET' else None)
        await pg.goto(url, wait_until='load'); await pg.wait_for_timeout(4000)
        print('TITLE', await pg.title(), '| height', await pg.evaluate('document.documentElement.scrollHeight'))
        print('--- behaviours registered at load:')
        for e in await pg.evaluate("window.__behav || []"): print('  ', e)
        print('--- visible text sample:', (await pg.inner_text('body'))[:500].replace('\n', ' / '))
        print('--- videos/iframes:', await pg.evaluate("[...document.querySelectorAll('video,iframe,vturb-smartplayer,[id^=vid_],[class*=player]')].map(e => e.tagName+':'+(e.src||e.id||e.className||'').toString().slice(0,80))"))
        h = await pg.evaluate('document.documentElement.scrollHeight')
        y = 0
        while y < h:
            await pg.evaluate(f'window.scrollTo(0,{y})'); await pg.wait_for_timeout(250); y += 400
        await pg.wait_for_timeout(1500)
        print('--- all behaviours after scrolling:')
        allb = await pg.evaluate("window.__behav || []")
        for e in allb[:70]: print('  ', e)
        print('navs:', navs[:6]); print('requests:', reqs[:14])
        await b.close()
asyncio.run(main())
