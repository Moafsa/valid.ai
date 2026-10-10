import asyncio, re
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context()).new_page()
        await pg.goto("https://gluteobrasileno.online/?step=result", wait_until="load")
        r = await pg.evaluate("fetch('/js/main-CCyNX3Hi-v3.js').then(r => r.text())")
        print(len(r))
        for pat in [r'instances', r'smartplayer', r'\.on\("', r'onPause|"pause"\)|video:pause|visibilitychange', r'presente', r'step=']:
            ms = list(re.finditer(pat, r))
            print('==', pat, len(ms))
            for m in ms[:6]:
                a = max(0, m.start()-150); print('   ', r[a:m.end()+250].replace('\n',' '))
        await b.close()
asyncio.run(main())
