import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={"width":1280,"height":800})).new_page()
        await pg.goto("https://gluteobrasileno.online/presente.html", wait_until="load"); await pg.wait_for_timeout(3500)
        await pg.screenshot(path='/tmp/shots/gift_orig.png')
        await b.close()
asyncio.run(main())
