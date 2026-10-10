"""Opens a REAL published page of the running site in a browser (vendors faked), uses it, and lets the reports reach the real server.
usage: live_check.py <base url> <slug>"""
import asyncio, re, sys
from playwright.async_api import async_playwright
BASE, SLUG = sys.argv[1], sys.argv[2]
FB = "(function(){var f=window.fbq;function h(a){a=Array.prototype.slice.call(a);if(a[0]==='trackSingle'||a[0]==='trackSingleCustom'){new Image().src='https://www.facebook.com/tr/?id='+a[1]+'&ev='+encodeURIComponent(a[2]);}}f.callMethod=function(){h(arguments)};(f.queue||[]).forEach(h);f.queue=[];})();"
GT = "(function(){var dl=window.dataLayer;function s(a){if(a[0]==='event')fetch('https://www.google-analytics.com/g/collect?en='+a[1],{method:'POST',keepalive:true}).catch(function(){})}dl.forEach(s);var o=dl.push;dl.push=function(x){s(x);return o.apply(dl,arguments)}})();"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def vend(route):
            u = route.request.url
            if "fbevents.js" in u: await route.fulfill(body=FB, content_type="application/javascript")
            elif "gtag/js" in u: await route.fulfill(body=GT, content_type="application/javascript")
            else: await route.fulfill(status=200, body="GIF89a", content_type="image/gif")
        await pg.route(re.compile(r"(connect\.facebook\.net|facebook\.com/tr|googletagmanager\.com|google-analytics\.com)"), vend)
        await pg.goto(f"{BASE}/s/{SLUG}?vai_test=1&vai_pxtest=1", wait_until="load")
        await pg.wait_for_timeout(1500)
        hasPx = await pg.evaluate("!!window.__VAI_PX && window.__VAI_PX.integrations.length")
        print("pixel config on the page:", hasPx)
        btn = pg.locator("a[href], button").first
        if await btn.count():
            try: await btn.click(timeout=2000, no_wait_after=True)
            except Exception: pass
        await pg.wait_for_timeout(6500)
        await pg.evaluate("window.dispatchEvent(new Event('pagehide'))")
        await pg.wait_for_timeout(800)
        print("panel:", (await pg.evaluate("document.body.innerText.split('Modo de teste dos pixels')[1] || ''"))[:300].replace("\n", " | "))
        print("errors:", errs[:2])
        await b.close()
asyncio.run(main())
