import asyncio, sys
sys.path.insert(0, "/ui/tests")
from uilab import serve, mock_api
from playwright.async_api import async_playwright
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch(ignore_default_args=["--hide-scrollbars"], args=["--disable-features=OverlayScrollbar,FluentOverlayScrollbar,FluentScrollbar"])
        pg = await b.new_page(viewport={"width": 1920, "height": 1000})
        await pg.route("**/api/**", mock_api)
        await pg.goto("http://127.0.0.1:8123/editor_ia.html")
        await pg.wait_for_selector(".gjs-frame", timeout=40000)
        await pg.wait_for_timeout(4000)
        info = await pg.evaluate("""() => {
          const f = document.querySelector('.gjs-frame'); const d = f.contentDocument; const w = f.contentWindow
          const r = f.getBoundingClientRect(); const wr = document.querySelector('.gjs-frame-wrapper').getBoundingClientRect()
          const st = document.querySelector('.ed-stage').getBoundingClientRect()
          return { frame: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], wrapper: [Math.round(wr.left), Math.round(wr.width)], stage: [Math.round(st.left), Math.round(st.width)],
            docClientW: d.documentElement.clientWidth, innerW: w.innerWidth, scrollbar: w.innerWidth - d.documentElement.clientWidth,
            htmlBg: w.getComputedStyle(d.documentElement).backgroundColor, bodyBg: w.getComputedStyle(d.body).backgroundColor, bodyW: Math.round(d.body.getBoundingClientRect().width), scrollH: d.documentElement.scrollHeight,
            colorScheme: w.getComputedStyle(d.documentElement).colorScheme }
        }""")
        print(info)
        await pg.screenshot(path="/ui/shots/white_line.png")
        await b.close()
    srv.terminate()
asyncio.run(main())
