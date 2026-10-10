import asyncio, re, sys
from playwright.async_api import async_playwright
URL = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1280, "height": 800})
        pg = await ctx.new_page()
        scripts = {}
        async def on_resp(r):
            try:
                if r.request.resource_type == "script" and "converteai" not in r.url and "vturb" not in r.url:
                    scripts[r.url] = await r.text()
            except Exception: pass
        pg.on("response", lambda r: asyncio.ensure_future(on_resp(r)))
        await pg.goto(URL, wait_until="load")
        await pg.wait_for_timeout(3000)
        html = await pg.content()
        inline = re.findall(r"<script(?![^>]*src)[^>]*>(.*?)</script>", html, flags=re.S)
        print("inline scripts:", len(inline), [len(x) for x in inline])
        allsrc = [("inline%d" % i, s) for i, s in enumerate(inline)] + list(scripts.items())
        for name, s in allsrc:
            for m in re.finditer(r"pause|ended|smartplayer|location\.(href|replace|assign)|window\.open|onpause", s):
                a = max(0, m.start() - 120); print("::", name[-50:], "|", s[a:m.end() + 160].replace("\n", " ")[:300]); 
        await b.close()
asyncio.run(main())
