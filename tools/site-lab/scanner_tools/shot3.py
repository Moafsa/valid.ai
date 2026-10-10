import asyncio, sys
from playwright.async_api import async_playwright
pid = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for tag, url in [('orig', 'https://gluteobrasileno.online/?step=result'), ('clone', f'http://web:3000/projects/{pid}/p/home')]:
            ctx = await b.new_context(viewport={"width":390,"height":844}, is_mobile=True)
            pg = await ctx.new_page()
            await pg.goto(url, wait_until='load'); await pg.wait_for_timeout(4500)
            await pg.screenshot(path=f'/tmp/shots/glu3_{tag}.png')
            await ctx.close()
        await b.close()
asyncio.run(main())
