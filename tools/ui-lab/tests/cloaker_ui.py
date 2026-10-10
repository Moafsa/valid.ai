"""Renders the cloaker page with the REAL component against saved lab results (tools/cloaker-lab/out/*.json) and checks what it says.
Run in the scanner image with /ui (this folder) and /cl (tools/cloaker-lab) mounted."""
import asyncio, json, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve
from playwright.async_api import async_playwright
fails = 0
def ok(c, what, extra=""):
    global fails
    print(("PASS  " if c else "FAIL  ") + what + ("" if c else "   -> " + str(extra)))
    if not c: fails += 1

# name: (emoji, must show text, must not show text)
CASES = {
    "lp": ("\U0001F534", ["Confiança:", "Qual condição muda a página", "Endereço real liberado", "Clonar a página real"], []),
    "clean": ("\U0001F7E2", ["Confiança:", "Clonar esta página mesmo assim"], ["Endereço real liberado", "Qual condição muda a página"]),
    "ab": ("\U0001F7E1", ["Confiança:", "muda sozinha"], []),
    "late": ("\U0001F534", ["Confiança:"], []),
}
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, (emoji, must, mustnot) in CASES.items():
            job = json.load(open(f"/cl/out/{name}.json")); job["url"] = "https://link-do-anuncio.com/oferta"
            for w, h in ((1280, 900), (390, 844)):
                pg = await b.new_page(viewport={"width": w, "height": h})
                errs = []
                pg.on("pageerror", lambda e: errs.append(str(e)))
                async def api(route):
                    if route.request.method == "POST": await route.fulfill(json={"id": "abc123abc123"})
                    else: await route.fulfill(json=job)
                await pg.route("**/api/cloaker**", api)
                await pg.goto("http://127.0.0.1:8123/cloaker.html")
                await pg.fill("input", "https://link-do-anuncio.com/oferta")
                await pg.click("text=Analisar link")
                await pg.wait_for_selector("text=Ambientes analisados", timeout=15000)
                await pg.wait_for_timeout(500)
                body = await pg.inner_text("body"); low = body.lower()
                tag = f"{name}@{w}"
                ok(emoji in body, f"{tag}: status emoji {emoji}")
                for t in must: ok(t.lower() in low, f"{tag}: shows \"{t}\"")
                for t in mustnot: ok(t.lower() not in low, f"{tag}: does not show \"{t}\"")
                ok(await pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2"), f"{tag}: no sideways scroll")
                ok(not errs, f"{tag}: no script errors", errs[:2])
                if w == 1280:
                    # the table names every scenario and a letter for the page it received
                    ok(await pg.locator("text=Comparação das versões recebidas").count() == 1, f"{tag}: versions table")
                    rows = await pg.locator("tr.cursor-pointer").count()
                    ok(rows >= 3, f"{tag}: scenario rows ({rows})")
                    # a click compares that scenario with the reference, side by side
                    await pg.locator("tr.cursor-pointer").nth(rows - 1).click()
                    await pg.wait_for_timeout(300)
                    for tab in ("Texto", "O que mudou", "Redirecionamentos", "Cabeçalhos e cookies", "Visual"):
                        await pg.get_by_role("button", name=tab, exact=True).click()
                        await pg.wait_for_timeout(150)
                    ok(True, f"{tag}: every comparison tab opens")
                    await pg.get_by_role("button", name="O que mudou", exact=True).click()
                    ok("Título principal (H1)" in await pg.inner_text("body"), f"{tag}: element comparison lists the H1")
                    await pg.get_by_role("button", name="Visual", exact=True).click()
                await pg.screenshot(path=f"/ui/shots/cloaker_{name}_{w}.png", full_page=True)
                await pg.close()
        await b.close()
    srv.terminate()
    print("\nALL PASSED" if fails == 0 else f"\n{fails} FAILED")
    sys.exit(1 if fails else 0)
asyncio.run(main())
