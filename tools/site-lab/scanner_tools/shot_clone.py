import asyncio, sys
from playwright.async_api import async_playwright
pid, slugs = sys.argv[1], sys.argv[2].split(',')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for s in slugs:
            pg = await (await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)).new_page()
            await pg.goto(f"http://web:3000/projects/{pid}/p/{s}", wait_until='load'); await pg.wait_for_timeout(3000)
            await pg.screenshot(path=f'/tmp/shots/clone_{s}.png')
        await b.close()
asyncio.run(main())
