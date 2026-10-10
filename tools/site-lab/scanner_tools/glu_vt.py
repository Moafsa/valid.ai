import asyncio, re, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context()).new_page()
        urls = []
        pg.on("request", lambda r: urls.append(r.url) if ("converteai" in r.url or "vturb" in r.url) else None)
        await pg.goto("https://gluteobrasileno.online/?step=result", wait_until="load")
        await pg.wait_for_timeout(5000)
        for u in dict.fromkeys(urls): print(u[:200])
        for u in dict.fromkeys(urls):
            if u.endswith('.js') and 'players' in u:
                t = await pg.evaluate("u => fetch(u).then(r => r.text())", u)
                print('JS', u[-60:], len(t))
                for pat in [r'redirect', r'pause', r'exit', r'unload', r'url']:
                    ms = [m for m in re.finditer(pat, t, re.I)]
                    print(' ', pat, len(ms))
                    for m in ms[:5]: print('     ', t[max(0,m.start()-100):m.end()+160].replace('\n',' '))
        cfg = await pg.evaluate("() => { try { const i = window.smartplayer.instances[0]; return JSON.stringify(i.instance.config).slice(0, 4000); } catch (e) { return String(e); } }")
        print('CFG', cfg)
        await b.close()
asyncio.run(main())
