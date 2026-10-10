import asyncio, sys, json
from playwright.async_api import async_playwright
pid = sys.argv[1]; slugs = sys.argv[2].split(',')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width":390,"height":844})
        pg = await ctx.new_page()
        net_bad = []
        pg.on('response', lambda r: net_bad.append((r.status, r.url[:110])) if r.status >= 400 else None)
        pg.on('requestfailed', lambda r: net_bad.append(('FAILED ' + str(r.failure), r.url[:110])))
        tot = {'imgs': 0, 'broken': 0, 'bgs': 0, 'bgbad': 0, 'videos': 0}
        for s in slugs:
            net_bad.clear()
            await pg.goto(f"http://web:3000/projects/{pid}/p/{s}", wait_until="load")
            await pg.wait_for_timeout(1800)
            r = await pg.evaluate("""async () => {
              const imgs = [...document.images]; const broken = imgs.filter(i => !(i.complete && i.naturalWidth > 0)).map(i => (i.currentSrc||i.src).slice(0,100));
              const bgs = new Set(); document.querySelectorAll('*').forEach(e => { const m = getComputedStyle(e).backgroundImage.match(/url\\("?([^")]+)"?\\)/g); if (m) m.forEach(x => bgs.add(x.replace(/^url\\("?|"?\\)$/g,''))); });
              const bgbad = []; await Promise.all([...bgs].filter(u => !u.startsWith('data:')).slice(0,30).map(u => new Promise(res => { const im = new Image(); im.onload = () => res(); im.onerror = () => { bgbad.push(u.slice(0,100)); res(); }; im.src = u; })));
              return { imgs: imgs.length, broken, bgs: bgs.size, bgbad, videos: document.querySelectorAll('video,iframe').length };
            }""")
            tot['imgs'] += r['imgs']; tot['broken'] += len(r['broken']); tot['bgs'] += r['bgs']; tot['bgbad'] += len(r['bgbad']); tot['videos'] += r['videos']
            if r['broken'] or r['bgbad'] or net_bad:
                print(f"[{s}] broken imgs={r['broken'][:3]} bad bgs={r['bgbad'][:3]} net={net_bad[:3]}")
        print('TOTAL', tot)
        await b.close()
asyncio.run(main())
