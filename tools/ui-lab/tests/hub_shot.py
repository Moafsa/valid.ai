import asyncio, json, sys, urllib.request
sys.path.insert(0, "/ui/tests")
from uilab import serve
from playwright.async_api import async_playwright
PID = sys.argv[1]
api = lambda v: json.loads(urllib.request.urlopen(f"http://an_api:3100/api/projects/{PID}/analytics/{v}?period=7d").read())
ov, ins = api("overview"), api("insights")
t = ov["totals"]
data = {"totals": {k: t[k] for k in ("sessions", "visitors", "conversions", "conversionRate", "avgActiveSec", "avgScroll")}, "previousSessions": ov["previous"]["sessions"], "bucket": ov["series"]["bucket"], "series": [p["sessions"] for p in ov["series"]["points"]],
        "summary": next((i["text"] for i in ins["insights"] if i["kind"] == "resumo"), None), "found": [{"id": i["id"], "kind": i["kind"], "title": i["title"]} for i in ins["insights"] if i["kind"] != "resumo"][:3]}
open("/ui/dist/data/hub.js", "w").write("window.__FIXTURE=" + json.dumps({"data": data}))
async def main():
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w in (1280, 390):
            pg = await b.new_page(viewport={"width": w, "height": 1500 if w > 500 else 2200})
            await pg.goto("http://127.0.0.1:8123/hub.html")
            await pg.wait_for_timeout(1200)
            await pg.screenshot(path=f"/ui/shots/hub_{w}.png", full_page=True)
        await b.close()
    srv.terminate()
asyncio.run(main())
