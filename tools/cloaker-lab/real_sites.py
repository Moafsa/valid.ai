"""Spot check on real public sites that are NOT cloakers: none may come out red (a yellow with a reason is fine).
usage: real_sites.py [url ...]   (run in the scanner image, real network, the SSRF guard stays on)"""
import asyncio, os, sys
sys.path.insert(0, "/app")
from services import cloaker_probe as C
SITES = sys.argv[1:] or ["https://example.com/", "https://en.wikipedia.org/wiki/Cloaking", "https://news.ycombinator.com/", "https://www.python.org/", "https://www.mozilla.org/", "https://g1.globo.com/"]
C._sem = asyncio.Semaphore(2)
async def one(u):
    jid = C.start(u)
    while C.JOBS[jid]["status"] in ("queued", "running"): await asyncio.sleep(2)
    j = C.JOBS[jid]; a = j.get("analysis") or {}
    print(f"{'OK  ' if a.get('status') != 'red' else 'RED '} {u}: {a.get('status')} {a.get('confidence')}% | {a.get('headline')} | different={a.get('counts', {}).get('different')} failed={a.get('counts', {}).get('failed')} {j.get('error') or ''}", flush=True)
    for f in a.get("findings", [])[:3]: print(f"      - {f['groupLabel']} [{f['kind']}] {f['condition']} sig={f['sig']:.2f} explained={f.get('explained')}", flush=True)
    return a.get("status")
async def main():
    res = await asyncio.gather(*[one(u) for u in SITES])
    print("\nALL PASSED" if "red" not in res else "\nA REAL SITE CAME OUT RED")
asyncio.run(main())
