import asyncio, sys, json
sys.path.insert(0, "/app")
from services.playwright_scraper import PlaywrightScraper
from services import layout_probe as lp
async def main():
    url, width = sys.argv[1], int(sys.argv[2])
    async with PlaywrightScraper(use_proxy=False) as sc:
        ctx, page = await lp._open(sc, url, width)
        base = await lp.mark_base(page)
        print("base elements", len(base))
        ctx2, p2 = await lp._open(sc, url, width)
        info = await p2.evaluate(lp.MARK_JS, [base, lp._CLONE_CLASS])
        print("mark", info)
        cands = await p2.evaluate(lp.LIST_JS, [])
        print("candidates", len(cands))
        for c in cands[:40]: print("  ", c)
        res = await lp._harvest(sc, url, width, base, [])
        for r in res: print("RESULT", r["p"], r["text"][:40], "ops", len(r["ops"]), "rev", r["rev"], [o["k"] for o in r["ops"]][:12])
asyncio.run(main())
