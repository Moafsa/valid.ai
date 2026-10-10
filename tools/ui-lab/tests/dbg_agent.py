import asyncio, json, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve
from playwright.async_api import async_playwright
async def api(route):
    await route.fulfill(status=200, content_type="application/json", body="{}")
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1500, "height": 950})
        await pg.route("**/api/**", api)
        await pg.goto("http://127.0.0.1:8123/editor_ia.html"); await pg.wait_for_selector(".gjs-frame", timeout=40000); await pg.wait_for_timeout(3500)
        r = await pg.evaluate("""() => {
          const ed = window.__vaiEditor, d = ed.Canvas.getDocument()
          const out = {}
          // content root = the container the editor saves blocks from (children of the innermost wrapper)
          let c = ed.getWrapper(); 
          const top = []; 
          const find = (comp, depth) => { if (depth > 4) return; comp.components().forEach(ch => { if (ch.get('type') !== 'textnode') top.push([depth, ch.getId(), ch.getEl() && ch.getEl().tagName]); find(ch, depth + 1) }) }
          find(ed.getWrapper(), 0)
          out.tree = top.slice(0, 8)
          // the editor's save uses getCss({component}) on each top-level block: which block contains h1?
          const h1 = ed.Components.allById()[d.querySelector('h1').id]
          let blk = h1; while (blk.parent() && blk.parent().get('type') !== 'wrapper' && blk.parent().parent() && blk.parent().parent().get('type') !== 'wrapper') blk = blk.parent()
          out.block = blk.getId()
          ed.Css.addRules('.zz-used{color:#0f0}  h2{letter-spacing:.3em}  @media (max-width:600px){.zz-used{color:#00f}}  body{background:#123456}  .zz-unused{color:#f00}')
          h1.addClass('zz-used')
          const scoped = ed.getCss({ component: blk }) || ''
          const full = ed.getCss() || ''
          out.scopedHas = { used: scoped.includes('zz-used'), media: /@media[^{]*\\{[^}]*zz-used/.test(scoped), tagH2: /h2\\s*\\{[^}]*letter-spacing/.test(scoped), body: /body\\s*\\{[^}]*123456/.test(scoped), unused: scoped.includes('zz-unused') }
          out.fullHas = { used: full.includes('zz-used'), tagH2: /h2\\s*\\{[^}]*letter-spacing/.test(full), body: /body\\s*\\{[^}]*123456/.test(full), unused: full.includes('zz-unused') }
          return out
        }""")
        print(json.dumps(r, indent=1))
        await b.close()
    srv.terminate()
asyncio.run(main())
