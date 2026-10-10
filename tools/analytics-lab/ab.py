#!/usr/bin/env python3
"""A/B test with real visitors: 24 people open the original address twice (the same version must come back),
the new headline's version presses the button more often. usage: ab.py <state.json> <truth_ab.json>"""
import asyncio, json, random, sys
from playwright.async_api import async_playwright
WEB = "http://web:3000"
async def visit(b, i, slug, out, sem):
    async with sem:
        random.seed(100 + i)
        ctx = await b.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", viewport={"width": 1280, "height": 800}, extra_http_headers={"x-forwarded-for": "200.147.67.14"}, timezone_id="America/Sao_Paulo")
        pg = await ctx.new_page()
        t = {"id": f"ab_{i}", "ok": False}
        try:
            await pg.goto(f"{WEB}/s/{slug}?vai_test=1&utm_source=facebook&utm_medium=cpc&utm_campaign=abtest")
            await pg.wait_for_selector("#headline")
            h1 = await pg.inner_text("#headline")
            side = "B" if "dobra" in h1 else "A"
            t["headline_seen"] = side
            await pg.wait_for_timeout(700)
            press = random.random() < (0.75 if side == "B" else 0.3)
            t["press_cta"] = press
            if press:
                await pg.click("#cta"); await pg.wait_for_selector("#thanks", timeout=8000); await pg.wait_for_timeout(1200)
            await pg.goto("about:blank"); await pg.wait_for_timeout(500)
            await pg.goto(f"{WEB}/s/{slug}?vai_test=1&utm_source=facebook&utm_medium=cpc&utm_campaign=abtest")
            await pg.wait_for_selector("#headline")
            h2 = await pg.inner_text("#headline")
            t["same_both_times"] = (("dobra" in h2) == (side == "B"))
            await pg.wait_for_timeout(500)
            await pg.goto("about:blank"); await pg.wait_for_timeout(500)
            t["ok"] = True
        except Exception as e:
            t["error"] = str(e)[:160]
        await ctx.close(); out.append(t)
async def main():
    state = json.load(open(sys.argv[1])); out = []
    async with async_playwright() as p:
        b = await p.chromium.launch(); sem = asyncio.Semaphore(5)
        await asyncio.gather(*[visit(b, i, state["slug"], out, sem) for i in range(24)])
        await b.close()
    json.dump({"state": state, "visitors": out}, open(sys.argv[2], "w"), indent=1)
    print(sum(1 for t in out if t["ok"]), "/", len(out), "ok", [t.get("error") for t in out if not t["ok"]][:3])
asyncio.run(main())
