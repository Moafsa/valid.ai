import asyncio, sys, time
from playwright.async_api import async_playwright
pid = sys.argv[1]
BASE = f"http://web:3000/projects/{pid}/p"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        await pg.goto(BASE + '/home', wait_until='load')
        await pg.wait_for_timeout(1500)
        await pg.evaluate("""() => {
          window.__s = []; const t0 = performance.now();
          const root = document.querySelector('[data-vai-root]');
          const h = setInterval(() => {
            const cs = getComputedStyle(root);
            window.__s.push([Math.round(performance.now() - t0), location.pathname.split('/').pop(), root.innerHTML.length, cs.opacity, root.innerText.length, cs.transform === 'none' ? '-' : cs.transform.slice(0, 22)]);
          }, 40);
          setTimeout(() => clearInterval(h), 3000);
        }""")
        await pg.locator('[data-vai-next]').first.dispatch_event('click')
        await pg.wait_for_timeout(3200)
        for r in await pg.evaluate("window.__s"): print(r)
        await b.close()
asyncio.run(main())
