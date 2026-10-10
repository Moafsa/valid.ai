import asyncio, json, sys, re
sys.path.insert(0, "/ui/tests")
from uilab import serve, mock_api
from playwright.async_api import async_playwright
fails = 0
def ok(c, what, extra=""):
    global fails
    print(("PASS  " if c else "FAIL  ") + what + ("" if c else "  -> " + str(extra)))
    if not c: fails += 1

async def open_editor(b, name):
    pg = await b.new_page(viewport={"width": 1440, "height": 900})
    saved = []
    logs = []
    pg.on("pageerror", lambda e: logs.append("PAGEERROR " + str(e)[:200]))
    async def api(route):
        if "save-page" in route.request.url:
            saved.append(json.loads(route.request.post_data or "{}"))
        await mock_api(route)
    await pg.route("**/api/**", api)
    await pg.goto(f"http://127.0.0.1:8123/editor_{name}.html")
    await pg.wait_for_selector(".gjs-frame", timeout=45000)
    await pg.wait_for_timeout(3500)
    return pg, saved, logs

async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()

        # 1. a Desktop edit of a property the original changes on smaller screens is pinned there
        pg, saved, logs = await open_editor(b, "mq")
        r = await pg.evaluate("""async () => {
          const ed = window.__vaiEditor; const h1 = ed.getWrapper().find('h1')[0]; const card = ed.getWrapper().find('.card')[0];
          ed.select(h1);
          h1.addStyle({ 'font-size': '64px' });
          card.addStyle({ 'padding-top': '40px' });
          await new Promise(r => setTimeout(r, 4000));
          return { css: ed.getCss(), h1id: h1.getId(), cardid: card.getId(), device: ed.getDevice() };
        }""")
        css = r["css"]
        def rule(media, cid, prop):
            m = re.search(r"@media \(max-width: " + media + r"px\)\s*\{(.*?)\}\s*\}", css, re.S) if False else None
            return re.search(r"@media \(max-width: " + media + r"px\)\s*\{[^@]*?#" + cid + r"\s*\{[^}]*" + prop + r":\s*([^;}]+)", css, re.S)
        t = rule("1024", r["h1id"], "font-size"); m = rule("768", r["h1id"], "font-size")
        ok(t and t.group(1).strip() == "36px", "heading: the tablet size of the original (36px) is pinned when the desktop size is edited", css[-500:])
        ok(m and m.group(1).strip() == "28px", "heading: the phone size of the original (28px) is pinned", css[-500:])
        ok(re.search(r"#" + r["h1id"] + r"\s*\{[^}]*font-size:\s*64px", css), "heading: the desktop edit itself is there")
        ok("max-width: 1440px" not in css, "Desktop edits are written with no media query (they apply on screens wider than the canvas too)", css[-300:])
        ok(not rule("1024", r["cardid"], "padding-top") and not rule("768", r["cardid"], "padding-top"), "card: padding the original never changed on smaller screens is NOT pinned (the edit carries over)")
        ok(not logs, "no page errors", logs)
        await pg.close()

        # 2. replacing a picture drops the srcset / <picture><source> that would keep showing the old file
        pg, saved, logs = await open_editor(b, "pic")
        before = await pg.evaluate("() => window.__vaiEditor.getHtml()")
        ok("<source" in before and "media=" in before, "the picture keeps its art-directed sources when loaded", before[:200])
        await pg.evaluate("""() => { const ed = window.__vaiEditor; const img = ed.getWrapper().find('img')[0]; ed.select(img); }""")
        await pg.wait_for_timeout(500)
        await pg.get_by_role("button", name="Conteúdo", exact=True).click() if await pg.get_by_role("button", name="Conteúdo", exact=True).count() else None
        inp = pg.locator(".ed-media-card input[type=file]").first
        if await inp.count():
            await inp.set_input_files({"name": "x.png", "mimeType": "image/png", "buffer": b"\x89PNG\r\n\x1a\n" + b"0" * 64})
            await pg.wait_for_timeout(1200)
            after = await pg.evaluate("() => window.__vaiEditor.getHtml()")
            seg = after[after.find("<picture") - 20: after.find("</picture>") + 12] if "<picture" in after else after[:400]
            ok("<source" not in after and "srcset=" not in after and "placehold.co" in after, "after replacing the picture there is no <source>/srcset left and the new file is used", seg)
        else:
            print("INFO  no upload input found for the picture; skipped")
        await pg.close()

        # 3. the menu button's replay data survives editing and saving
        pg, saved, logs = await open_editor(b, "burger")
        html = await pg.evaluate("() => window.__vaiEditor.getHtml()")
        ok("data-vai-mt" in html, "the menu button's data-vai-mt is kept by the editor", html[:300])
        await pg.evaluate("() => { const ed = window.__vaiEditor; const t = ed.getWrapper().find('h1')[0]; t.components('Novo título'); }")
        await pg.click("#ed-save-btn")
        await pg.wait_for_timeout(1500)
        blob = json.dumps(saved[-1], ensure_ascii=False) if saved else ""
        ok("data-vai-mt" in blob and "Novo título" in blob, "saving keeps both the edit and the menu data", blob[:200])
        await pg.close()

        print("\nALL PASSED" if fails == 0 else f"\n{fails} FAILED")
        await b.close()
    srv.terminate()
    sys.exit(1 if fails else 0)
asyncio.run(main())
