#!/usr/bin/env python3
"""Side-by-side screenshot of an original and its clone at one width.
usage: pair_sheet.py <original url> <clone url> <width> <y0> <height> <out.png>"""
import asyncio, io, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
O, C, W, Y0, H, OUT = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
DESK = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
SCROLL = "async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,110))}window.scrollTo(0,0);await new Promise(r=>setTimeout(r,700))}"
async def shot(b, url):
    ctx = await b.new_context(viewport={"width": W, "height": 900}, is_mobile=W <= 500, has_touch=W <= 900, user_agent=PHONE if W <= 500 else DESK, locale="pt-BR")
    pg = await ctx.new_page()
    try: await pg.goto(url, wait_until="load", timeout=60000)
    except Exception: pass
    await pg.wait_for_timeout(2500)
    await pg.evaluate(SCROLL)
    h = await pg.evaluate("Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)")
    png = await pg.screenshot(full_page=True, clip={"x": 0, "y": Y0, "width": W, "height": min(H, max(100, h - Y0))})
    await ctx.close()
    return Image.open(io.BytesIO(png)).convert("RGB"), h
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        (a, ha), (c, hc) = await asyncio.gather(shot(b, O), shot(b, C))
        await b.close()
    w = a.width + c.width + 20; h = max(a.height, c.height) + 24
    im = Image.new("RGB", (w, h), (255, 0, 255))
    im.paste(a, (0, 24)); im.paste(c, (a.width + 20, 24))
    d = ImageDraw.Draw(im); d.text((4, 6), f"ORIGINAL w={W} docH={ha}", fill=(255, 255, 255)); d.text((a.width + 24, 6), f"CLONE docH={hc}", fill=(255, 255, 255))
    im.save(OUT); print(OUT, im.size)
asyncio.run(main())
