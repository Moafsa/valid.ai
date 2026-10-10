import asyncio, json, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve
from playwright.async_api import async_playwright
fails = 0
def ok(c, what, extra=""):
    global fails
    print(("PASS  " if c else "FAIL  ") + what + ("" if c else "  -> " + str(extra)))
    if not c: fails += 1

async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        calls = []
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        state = {"published": False, "changes": False}
        async def api(route):
            req = route.request
            url = req.url
            if "/publish" in url:
                calls.append((req.method, url.split("/api/")[1], req.post_data))
                if req.method == "GET":
                    return await route.fulfill(status=200, content_type="application/json", body=json.dumps({"published": state["published"], "slug": "meu-site" if state["published"] else None, "publishedAt": None, "unpublishedChanges": state["changes"]}))
                if req.method == "POST":
                    state["published"] = True
                    return await route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "slug": json.loads(req.post_data)["slug"], "url": "/s/x", "pages": 1}))
                if req.method == "DELETE":
                    state["published"] = False
                    return await route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True}))
            if "save-page" in url:
                calls.append(("POST", "editor/save-page", None))
            return await route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "url": "https://placehold.co/10"}))
        await pg.route("**/api/**", api)
        await pg.goto("http://127.0.0.1:8123/editor_mq.html")
        await pg.wait_for_selector(".gjs-frame", timeout=45000)
        await pg.wait_for_timeout(3000)
        await pg.get_by_role("button", name="Publicar").first.click()
        await pg.wait_for_selector("[role=dialog][aria-label=Publicar]", timeout=5000)
        txt = await pg.locator("[role=dialog][aria-label=Publicar]").inner_text()
        ok("só a página clonada" in txt and "sem nada do editor" in txt, "the dialog says what publishing does (only the cloned page)", txt[:200])
        await pg.locator("[role=dialog][aria-label=Publicar] input[type=text]").fill("Meu Site Novo")
        await pg.get_by_role("button", name="Salvar e publicar").click()
        await pg.wait_for_timeout(1500)
        names = [c[0] + " " + c[1] for c in calls]
        ok(any(n.startswith("POST editor/save-page") for n in names) and names.index(next(n for n in names if n.startswith("POST editor/save-page"))) < names.index(next(n for n in names if n.startswith("POST projects/") and n.endswith("/publish"))), "the page is saved first, then published", names)
        post = next((c for c in calls if c[0] == "POST" and c[1].endswith("/publish")), None)
        ok(post and json.loads(post[2])["slug"] == "Meu Site Novo", "the publish endpoint gets the chosen address", post)
        txt = await pg.locator("[role=dialog][aria-label=Publicar]").inner_text()
        ok("be-vallid.com/s/" in txt and "Tirar do ar" in txt, "after publishing: the public link and 'Tirar do ar' are shown", txt[:300])
        link = await pg.locator("[role=dialog][aria-label=Publicar] a[href^='/s/']").count()
        ok(link == 1, "there is a link that opens the public site")
        await pg.get_by_role("button", name="Tirar do ar").click()
        await pg.wait_for_timeout(800)
        ok(any(c[0] == "DELETE" for c in calls), "'Tirar do ar' calls the unpublish endpoint")
        ok(not errs, "no page errors", errs)
        await b.close()
    print("\nALL PASSED" if fails == 0 else f"\n{fails} FAILED")
    srv.terminate()
    sys.exit(1 if fails else 0)
asyncio.run(main())
