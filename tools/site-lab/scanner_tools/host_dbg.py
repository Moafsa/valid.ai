import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={"width":390,"height":844}, is_mobile=True)).new_page()
        await pg.goto('https://gluteobrasileno.online/?step=result', wait_until='load'); await pg.wait_for_timeout(5000)
        print(await pg.evaluate("""() => {
          const h = document.querySelector('vturb-smartplayer');
          const info = (n) => n.tagName + '.' + String(n.className).slice(0,40) + ' ' + Math.round(n.getBoundingClientRect().width) + 'x' + Math.round(n.getBoundingClientRect().height) + (n.src ? ' src=' + n.src.slice(-50) : '') + (n.currentSrc ? ' cur=' + n.currentSrc.slice(-40) : '');
          const light = [...h.querySelectorAll('*')].map(info);
          const sr = h.shadowRoot ? [...h.shadowRoot.querySelectorAll('*')].map(info) : null;
          return { light: light.slice(0, 20), shadow: sr && sr.slice(0, 40), style: h.getAttribute('style') };
        }"""))
        await b.close()
asyncio.run(main())
