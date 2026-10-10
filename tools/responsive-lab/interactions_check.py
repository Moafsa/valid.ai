#!/usr/bin/env python3
"""Presses things on a CLONE (real mouse) and checks the page answers like the original: FAQ items open and close,
accordion, tabs, "ver mais", menu button on a phone, and the CTA does not get hijacked.  usage: interactions_check.py <clone url>"""
import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1]
fails = 0
def ok(c, what, extra=""):
    global fails
    print(("PASS  " if c else "FAIL  ") + what + ("" if c else "  -> " + str(extra)))
    if not c: fails += 1

async def real_click(pg, selector, nth=0):
    loc = pg.locator(selector).nth(nth)
    await loc.scroll_into_view_if_needed()
    box = await loc.bounding_box()
    await pg.mouse.click(box["x"] + min(box["width"] / 2, 120), box["y"] + box["height"] / 2)
    await pg.wait_for_timeout(500)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1280, "height": 900})
        await pg.goto(URL, wait_until="load"); await pg.wait_for_timeout(1500)
        vis = lambda text: pg.evaluate("t => [...document.querySelectorAll('body *')].some(e => e.children.length === 0 && (e.textContent || '').includes(t) && e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== 'none' && !e.closest('[hidden]'))", text)
        # FAQ (pointer events, nodes added)
        ok(not await vis("sim, é simples"), "FAQ: the answer is hidden at first")
        await real_click(pg, ".q", 0)
        ok(await vis("Preciso saber programar - sim"), "FAQ: pressing the question opens the answer")
        ok(await pg.evaluate("() => document.querySelectorAll('.q')[0].getAttribute('data-name')") == "Open", "FAQ: the item changes to its open look")
        await real_click(pg, ".q", 0)
        ok(not await vis("Preciso saber programar - sim"), "FAQ: pressing again closes it")
        await real_click(pg, ".q", 2)
        ok(await vis("Existe garantia - sim"), "FAQ: the third item opens too")
        # accordion (aria-expanded + hidden panel)
        await real_click(pg, "#b1")
        ok(await vis("Ships worldwide"), "accordion: the panel opens")
        await real_click(pg, "#b1")
        ok(not await vis("Ships worldwide"), "accordion: and closes")
        # tabs
        await real_click(pg, "[role=tab]", 1)
        ok(await vis("Specs content") and not await vis("Overview content"), "tabs: the other tab shows its content")
        # show more
        await real_click(pg, "#more")
        ok(await vis("extra text revealed"), "ver mais: reveals the rest")
        # native details
        await real_click(pg, "summary")
        ok(await vis("Native answer"), "details/summary: opens")
        # a CTA is a link, not an interaction we replay
        before = pg.url
        await real_click(pg, "#cta")
        ok(pg.url.split("#")[0] == before.split("#")[0], "the call-to-action link keeps working as a link")
        # phone: the menu button
        ph = await b.new_page(viewport={"width": 390, "height": 800}, is_mobile=True, has_touch=True, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1")
        await ph.goto(URL, wait_until="load"); await ph.wait_for_timeout(1500)
        shown = lambda: ph.evaluate("() => [...document.querySelectorAll('nav a')].filter(a => a.getBoundingClientRect().height > 0 && getComputedStyle(a).display !== 'none').length")
        ok(await shown() == 0, "phone: the menu links are hidden at first")
        await real_click(ph, "#bg")
        ok(await shown() >= 3, "phone: the menu button opens the menu", await shown())
        await real_click(ph, "#bg")
        ok(await shown() == 0, "phone: and closes it again")
        await b.close()
    print("\nALL PASSED" if fails == 0 else f"\n{fails} FAILED")
    sys.exit(1 if fails else 0)
asyncio.run(main())
