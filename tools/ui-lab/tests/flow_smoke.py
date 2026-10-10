import asyncio, json, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve, mock_api
from playwright.async_api import async_playwright
OUT = "/ui/shots"
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1440, "height": 1100})
        logs = []
        pg.on("pageerror", lambda e: logs.append("PAGEERROR " + str(e)[:300]))
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text[:160]}") if m.type == "error" else None)
        await pg.route("**/api/**", mock_api)
        for name, qs in (("nodata", ""), ("data", "?data=1")):
            await pg.goto(f"http://127.0.0.1:8123/flow.html{qs}")
            await pg.wait_for_selector("[data-node]", timeout=20000)
            await pg.wait_for_timeout(4000)
            await pg.screenshot(path=f"{OUT}/20_flow_{name}.png", full_page=True)
        # click a node
        await pg.locator("[data-node]").nth(3).click()
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=f"{OUT}/21_flow_selected.png", full_page=True)
        await pg.get_by_role("button", name="Lista").click()
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=f"{OUT}/22_flow_list.png")
        print("\n".join(logs[:10]))
        await b.close()
    srv.terminate()
asyncio.run(main())
