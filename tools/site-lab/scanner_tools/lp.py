import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await (await b.new_context(viewport={"width":1280,"height":800})).new_page()
        await pg.goto('https://be-vallid.com/',wait_until='networkidle'); await pg.wait_for_timeout(800)
        await pg.screenshot(path='/tmp/shots/lp.png'); await b.close()
asyncio.run(main())
