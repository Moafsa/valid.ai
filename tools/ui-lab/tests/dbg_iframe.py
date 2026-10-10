import asyncio, json
from playwright.async_api import async_playwright
async def main():
    F = json.load(open('/ui/fixtures/funnel_branch.json'))
    pid = open('/ui/dist/data/flow.js').read().split('"projectId": "')[1].split('"')[0]
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 390, "height": 640})
        errs = []
        pg.on("console", lambda m: errs.append(m.text[:150]) if m.type == "error" else None)
        await pg.goto(f"http://web:3000/projects/{pid}/p/home?vai_preview=1&v=m", wait_until="load")
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path="/ui/shots/23_thumb.png")
        print(errs[:5])
        # now as an iframe
        pg2 = await b.new_page(viewport={"width": 600, "height": 700})
        await pg2.set_content(f'<iframe src="http://web:3000/projects/{pid}/p/home?vai_preview=1&v=m" style="width:390px;height:640px;border:1px solid red"></iframe>')
        await pg2.wait_for_timeout(3500)
        await pg2.screenshot(path="/ui/shots/24_thumb_iframe.png")
        await b.close()
asyncio.run(main())
