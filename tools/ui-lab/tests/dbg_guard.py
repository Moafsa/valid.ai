import asyncio, json, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve, mock_api
from playwright.async_api import async_playwright
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        logs = []
        pg.on("console", lambda m: logs.append(m.type + ": " + m.text[:200]))
        pg.on("pageerror", lambda e: logs.append("PAGEERROR " + str(e)[:300]))
        await pg.route("**/api/**", mock_api)
        await pg.goto("http://127.0.0.1:8123/editor_mq.html")
        await pg.wait_for_selector(".gjs-frame", timeout=45000)
        await pg.wait_for_timeout(3500)
        r = await pg.evaluate("""async () => {
          const ed = window.__vaiEditor; const h1 = ed.getWrapper().find('h1')[0];
          const ev = [];
          ed.on('component:styleUpdate', (c, p) => ev.push(['styleUpdate', Object.keys(p && p.style || {}), ed.getDevice()]));
          ed.on('style:property:update', (...a) => ev.push(['prop']));
          const g = ed.__guard;
          const where = g.locate(h1);
          const w = g.widths();
          const [fd, ft, fm] = await Promise.all([g.frame(w.desktop), g.frame(w.tablet), g.frame(w.mobile)]);
          const info = { where, w, hasFrames: !!fd && !!ft && !!fm, id: h1.getId() };
          if (fd) { const ed1 = g.find(fd.doc, where); info.foundDesktop = !!ed1; info.html = ed1 ? ed1.outerHTML.slice(0, 80) : null; info.cssLen = fd.doc.styleSheets.length; info.rules = fd.doc.styleSheets[0] ? fd.doc.styleSheets[0].cssRules.length : -1; info.fs = ed1 ? fd.win.getComputedStyle(ed1).fontSize : null }
          if (ft) { const e2 = g.find(ft.doc, where); info.fsTablet = e2 ? ft.win.getComputedStyle(e2).fontSize : null; info.tw = ft.win.innerWidth }
          let err = null;
          try { await g.pin(h1, ['font-size']); } catch (e) { err = String(e && e.stack || e).slice(0, 400) }
          info.err = err; info.state = ed.StyleManager && ed.StyleManager.getState ? ed.StyleManager.getState() : 'nofn';
          info.after = ed.getCss().slice(-300);
          h1.addStyle({ 'font-size': '64px' });
          await new Promise(r => setTimeout(r, 3500));
          info.css = ed.getCss().slice(-300);
          return { info, ev, iframes: document.querySelectorAll('iframe[sandbox]').length, bpDevices: ed.Devices.getDevices().map(d => [d.get('name'), d.get('widthMedia')]) };
        }""")
        print(json.dumps(r)); print("\n".join(logs[:12]))
        await b.close()
    srv.terminate()
asyncio.run(main())
