import asyncio, sys, json
from playwright.async_api import async_playwright
pid = sys.argv[1]
slugs = sys.argv[2].split(',')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width":390,"height":844})
        pg = await ctx.new_page()
        failed = []
        pg.on('response', lambda r: failed.append((r.status, r.url[:140], r.headers.get('content-type'))) if r.request.resource_type == 'image' and r.status >= 400 else None)
        pg.on('requestfailed', lambda r: failed.append(('FAILED', r.url[:140], r.failure)) if r.resource_type == 'image' else None)
        for s in slugs:
            failed.clear()
            await pg.goto(f"http://web:3000/projects/{pid}/p/{s}", wait_until="load")
            await pg.wait_for_timeout(2500)
            imgs = await pg.evaluate("""() => [...document.images].map(i => ({src: (i.currentSrc||i.src).slice(0,150), ok: i.complete && i.naturalWidth>0, alt: i.alt, w: Math.round(i.getBoundingClientRect().width), loading: i.loading}))""")
            bad = [i for i in imgs if not i['ok']]
            print(f"[{s}] images {len(imgs)}, broken {len(bad)}")
            for i in bad[:6]: print("   BROKEN", i)
            for f in failed[:5]: print("   NET", f)
        await b.close()
asyncio.run(main())
