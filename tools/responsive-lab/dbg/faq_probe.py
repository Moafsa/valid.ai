import asyncio, sys, json
from playwright.async_api import async_playwright
URL = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        await pg.goto(URL, wait_until="load", timeout=60000)
        await pg.wait_for_timeout(4000)
        await pg.evaluate("async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120))}window.scrollTo(0,0)}")
        await pg.wait_for_timeout(1000)
        r = await pg.evaluate("""() => {
          const txt = [...document.querySelectorAll('h1,h2,h3,p,div,span')].filter(e => e.children.length === 0 && /perguntas|d[uú]vidas|faq/i.test(e.textContent || ''));
          return txt.slice(0, 6).map(e => ({ tag: e.tagName, text: e.textContent.trim().slice(0, 60), y: Math.round(e.getBoundingClientRect().top + scrollY), cls: String(e.className).slice(0, 60) }));
        }""")
        print(json.dumps(r, ensure_ascii=False))
        await b.close()
asyncio.run(main())
