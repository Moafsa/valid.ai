import asyncio, sys
from playwright.async_api import async_playwright
pid, slug = sys.argv[1], sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)).new_page()
        pg.on('pageerror', lambda e: print('PAGEERR', str(e)[:200]))
        pg.on('console', lambda m: print('console', m.type, m.text[:160]) if m.type in ('error','warning') else None)
        await pg.goto(f"http://web:3000/projects/{pid}/p/{slug}", wait_until='load'); await pg.wait_for_timeout(4000)
        info = await pg.evaluate("""() => {
          const root = document.querySelector('[data-vai-root]');
          const delayed = [...document.querySelectorAll('[data-vai-delay]')].map(e => [e.getAttribute('data-vai-delay'), e.hasAttribute('data-vai-shown'), (e.innerText||'').trim().slice(0,30), getComputedStyle(e).display, getComputedStyle(e).opacity]);
          const tl = [...document.querySelectorAll('[data-vai-tl]')].map(e => [(e.getAttribute('data-vai-tl')||'').slice(0,200), e.className.slice(0,60)]);
          const anim = [...document.querySelectorAll('[data-vai-anim]')].map(e => (e.getAttribute('data-vai-anim')||'').slice(0,240));
          const hid = [...(root||document.body).querySelectorAll('*')].filter(e => { const cs = getComputedStyle(e); return cs.display === 'none' }).length;
          return {rootText: ((root||document.body).innerText||'').slice(0,160), delayed, tl, anim, hiddenCount: hid, rootH: root ? root.getBoundingClientRect().height : null};
        }""")
        for k, v in info.items(): print(k, v)
        await b.close()
asyncio.run(main())
