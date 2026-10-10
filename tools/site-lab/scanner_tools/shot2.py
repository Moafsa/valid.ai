import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for tag, url in [('orig', 'https://gluteobrasileno.online/?step=result'), ('clone', 'http://web:3000/projects/cmuud953400combsuuqwprqh6/p/home')]:
            ctx = await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=1, is_mobile=True)
            pg = await ctx.new_page()
            await pg.goto(url, wait_until='load'); await pg.wait_for_timeout(5000)
            await pg.screenshot(path=f'/tmp/shots/glu_{tag}_top.png')
            h = await pg.evaluate('document.documentElement.scrollHeight')
            print(tag, 'height', h, 'video:', await pg.evaluate("[...document.querySelectorAll('video,vturb-smartplayer,iframe')].map(e=>e.tagName+' '+(e.currentSrc||e.src||'')+' '+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))"))
            await pg.screenshot(path=f'/tmp/shots/glu_{tag}_full.png', full_page=True)
            await ctx.close()
        await b.close()
asyncio.run(main())
