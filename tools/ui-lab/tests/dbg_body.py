import asyncio, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve, mock_api
from playwright.async_api import async_playwright
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1600, "height": 950})
        await pg.route("**/api/**", mock_api)
        await pg.goto("http://127.0.0.1:8123/editor_ia.html")
        await pg.wait_for_selector(".gjs-frame", timeout=40000); await pg.wait_for_timeout(3500)
        r = await pg.evaluate("""() => {
          const ed = window.__vaiEditor, d = ed.Canvas.getDocument(), w = d.defaultView, um = ed.UndoManager
          const info = {}
          info.bodyBefore = w.getComputedStyle(d.body).backgroundColor
          const s0 = um.getStack().length
          
          const bg = () => w.getComputedStyle(d.body).backgroundColor
          ed.Css.setRule('body', { 'background-color': '#ff0000 !important' }); info.bodyImportant = bg()
          ed.Css.setRule('body', { 'background-color': '#00ff00' }); ed.Css.setRule('html body', { 'background-color': '#0000ff' }); info.htmlBody = bg()
          ed.Css.setRule('html body', { 'background-color': '#ffffff !important' }); info.htmlBodyImportant = bg()
          info.rulesWithBg = ed.Css.getAll().models.filter(r => { const st = r.getStyle(); return st && (st['background-color'] || st.background) && /^(html )?body/.test(r.selectorsToString()) }).map(r => r.selectorsToString() + ' ' + JSON.stringify(r.getStyle()))
          info.pageCssBody = (document.body.innerHTML.length, '')
          info.ruleSelectors = ed.Css.getAll().models.filter(r => /body/.test(r.selectorsToString ? r.selectorsToString() : '')).map(r => r.selectorsToString() + ' ' + JSON.stringify(r.getStyle())).slice(0, 4)
          info.wrapperTag = ed.getWrapper().getEl().tagName + '#' + ed.getWrapper().getEl().id
          return info
        }""")
        for k, v in r.items(): print(f"{k}: {v}")
        await b.close()
    srv.terminate()
asyncio.run(main())
