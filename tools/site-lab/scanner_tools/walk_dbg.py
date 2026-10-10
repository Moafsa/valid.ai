import asyncio, sys, time, os
sys.path.insert(0, '/app')
from services.playwright_scraper import PlaywrightScraper
from services.funnel_walker import FunnelWalker
url = sys.argv[1]
async def prog(f, t): pass
async def main():
    async with PlaywrightScraper() as sc:
        w = FunnelWalker(sc, url, prog)
        res = await w.walk()
        print("result:", bool(res), "spa_seen:", w._spa_seen)
        for k, n in sorted(w.nodes.items(), key=lambda kv: kv[1].index):
            print(" node", n.index, repr(k)[:70], "step" if n.step else "NO-STEP", "mode", n.mode, "opts", len(n.options), "targets", {a[:14]: b[:30] if b else b for a, b in list(n.targets.items())[:3]}, "fp", (w._fingerprint(n) or '')[:40] if n.step else None)
asyncio.run(main())
