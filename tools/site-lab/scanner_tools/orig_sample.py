import asyncio, sys, time, re, json
from playwright.async_api import async_playwright
URL = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        await pg.goto(URL, wait_until="domcontentloaded")
        await pg.wait_for_timeout(2500)
        t0 = time.time()
        last = None
        log = []
        async def snap():
            return await pg.evaluate("""() => {
              const t = (document.body.innerText || '').replace(/\\s+/g, ' ').trim();
              const btns = [...document.querySelectorAll('button, a')].filter(e => e.offsetParent && /./.test(e.innerText)).map(e => e.innerText.trim().replace(/\\s+/g,' ')).slice(0, 6);
              return {t: t.slice(0, 110), btns};
            }""")
        for i in range(160):
            s = await snap()
            key = re.sub(r'\d+%', 'N%', s['t'])
            if key != last:
                last = key
                log.append((round(time.time() - t0, 1), s['t'][:100], s['btns'][:3]))
                print(round(time.time() - t0, 1), '|', s['t'][:100], '|', s['btns'][:3], flush=True)
            # advance: click the first button that is not a footer link
            clicked = await pg.evaluate("""() => {
              const els = [...document.querySelectorAll('button')].filter(e => e.offsetParent && !e.disabled && /./.test(e.innerText || ''));
              const bad = /termos|pol[ií]tica|privacidade|suporte|cookie|ver mais|menu/i;
              const el = els.find(e => !bad.test(e.innerText));
              if (el) { el.click(); return el.innerText.trim().slice(0, 30); }
              return null;
            }""")
            await pg.wait_for_timeout(700)
            if time.time() - t0 > 150: break
        await b.close()
asyncio.run(main())
