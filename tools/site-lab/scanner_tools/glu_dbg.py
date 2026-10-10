import asyncio, sys
from playwright.async_api import async_playwright
pid = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        pg.on('console', lambda m: print('  console', m.type, m.text[:160]))
        pg.on('pageerror', lambda e: print('  pageerror', str(e)[:200]))
        pg.on('requestfailed', lambda r: print('  REQFAIL', r.url[:110], r.failure))
        pg.on('response', lambda r: print('  RESP', r.status, r.url[:110], r.headers.get('access-control-allow-origin')) if ('converteai' in r.url or 'hls' in r.url or 'player' in r.url) else None)
        await pg.goto(f"http://web:3000/projects/{pid}/p/home", wait_until='load'); await pg.wait_for_timeout(3000)
        print('Hls loaded?', await pg.evaluate("typeof window.Hls"), 'player scripts:', await pg.evaluate("typeof window.__VAIPlayer"))
        await pg.tap('[data-vai-player]'); await pg.wait_for_timeout(6000)
        print('Hls loaded?', await pg.evaluate("typeof window.Hls"), await pg.evaluate("window.Hls && Hls.isSupported()"))
        print(await pg.evaluate("(() => { const v = document.querySelector('.vai-pl-main'); return v && {rs: v.readyState, err: v.error && v.error.message, net: v.networkState, src: v.src.slice(0,60)} })()"))
        await b.close()
asyncio.run(main())
