"""Edits a cloned page in the real editor the way a person would, saves it, and writes what the editor sent to the server.
usage: edit_session.py <fixture name> -> /ui/out/<name>_saved.json  ({pageId, blocks})"""
import asyncio, json, os, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve, mock_api
from playwright.async_api import async_playwright
name = sys.argv[1]
os.makedirs("/ui/out", exist_ok=True)

async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        saved = []
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        async def api(route):
            if "save-page" in route.request.url:
                saved.append(json.loads(route.request.post_data or "{}"))
            await mock_api(route)
        await pg.route("**/api/**", api)
        await pg.goto(f"http://127.0.0.1:8123/editor_{name}.html")
        await pg.wait_for_selector(".gjs-frame", timeout=45000)
        await pg.wait_for_timeout(3500)
        log = await pg.evaluate("""async () => {
          const ed = window.__vaiEditor, log = [];
          const root = ed.getWrapper();
          const heads = root.find('h1, h2');
          // 1. text of the first heading
          if (heads[0]) { heads[0].components('Titulo EDITADO'); log.push('text'); }
          // 2. a layout property changed on the Desktop screen (the guard must pin the other screens)
          if (heads[0]) { heads[0].addStyle({ 'font-size': '70px' }); log.push('font-size'); }
          // 3. a colour change (applies everywhere)
          const first = root.find('p')[0];
          if (first) { first.addStyle({ color: '#c026d3' }); log.push('color'); }
          // 4. replace an image if there is one
          const img = root.find('img')[0];
          if (img) { img.set('src', 'https://placehold.co/600x400'); img.addAttributes({ src: 'https://placehold.co/600x400' }); try { img.removeAttributes(['srcset', 'sizes']) } catch (e) {} const par = img.parent && img.parent(); if (par && String(par.get('tagName')).toLowerCase() === 'picture') par.components().models.filter(c => String(c.get('tagName')).toLowerCase() === 'source').forEach(c => c.remove()); log.push('image'); }
          // 5. duplicate the last section, then add a new one
          const blocks = root.components().models.filter(c => c.get('tagName'));
          const container = blocks[0] && blocks[0].parent();
          if (container) {
            const secs = container.components().models.filter(c => String(c.get('tagName')).toLowerCase() === 'section');
            const last = secs[secs.length - 1];
            if (last) { const copy = last.clone(); container.components().add(copy, { at: container.components().models.indexOf(last) + 1 }); copy.addAttributes({ 'data-vai-block-id': crypto.randomUUID() }); log.push('duplicate'); }
            container.components().add('<section style="padding:32px 24px"><h2>Secao nova</h2><p>Texto da secao nova.</p></section>', { at: container.components().length - 1 });
            log.push('add');
          }
          await new Promise(r => setTimeout(r, 4500));   // let the guard write its rules
          return log;
        }""")
        await pg.click("#ed-save-btn")
        await pg.wait_for_timeout(2000)
        out = {"log": log, "errors": errs, "saved": saved[-1] if saved else None}
        json.dump(out, open(f"/ui/out/{name}_saved.json", "w"), ensure_ascii=False)
        print(name, "edits:", log, "| saved blocks:", len((saved[-1] or {}).get("blocks", [])) if saved else 0, "| errors:", errs[:2])
        await b.close()
    srv.terminate()
asyncio.run(main())
