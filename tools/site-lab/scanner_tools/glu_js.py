import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context()).new_page()
        await pg.goto("https://gluteobrasileno.online/?step=result", wait_until="load")
        r = await pg.evaluate("fetch('/js/rastreo.js?v=1').then(r => r.text())")
        print(len(r)); print(r[:6000])
        await b.close()
asyncio.run(main())
