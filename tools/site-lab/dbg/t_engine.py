import asyncio, sys, json
sys.path.insert(0, "/app")
from playwright.async_api import async_playwright
from services.capture_engine import ENGINE_JS
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":1440,"height":900})
        await pg.goto(sys.argv[1], wait_until="load")
        await pg.wait_for_timeout(1500)
        await pg.evaluate(ENGINE_JS)
        plan = await pg.evaluate("() => window.__vai.plan()")
        print("plan", str(plan)[:200])
        n = plan.get("count", 1) if isinstance(plan, dict) else 1
        html = ""
        for i in range(n):
            s = await pg.evaluate("(i) => window.__vai.snapshot(i, {})", i)
            if i == 0: print("keys", list(s.keys()) if isinstance(s, dict) else type(s))
            if s: html += json.dumps(s)
        print("badge", "grecaptcha-badge" in html, "recaptcha", "recaptcha" in html, "mkto", "mkto" in html.lower(), len(html))
        await b.close()
asyncio.run(main())
