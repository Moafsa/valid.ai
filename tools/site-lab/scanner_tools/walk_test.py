import asyncio, sys, json, time, re
sys.path.insert(0, '/app')
from services.playwright_scraper import PlaywrightScraper
from services.funnel_walker import FunnelWalker
url, tag = sys.argv[1], sys.argv[2]
async def prog(f, t): print(f"   [{f:.2f}] {t}")
async def main():
    async with PlaywrightScraper() as sc:
        t = time.time()
        res = await FunnelWalker(sc, url, prog).walk()
        print("took", round(time.time()-t,1), "s")
        if not res: print("NOT A FUNNEL"); return
        print("steps:", len(res['steps']), "css:", len(res['page_css']), "exit:", res['exit_url'])
        for n in res['notes']: print("NOTE:", n)
        for st in res['steps']:
            html = "".join(s['dom_html'] for s in st['sections'])
            print(f"- {st['slug']:9} {st['name'][:50]!r} blocks={len(st['sections'])} delayed={st['delayed']} media={st['has_media']} auto={st['auto_next']} next={re.findall(r'data-vai-next=\"([^\"]+)\"', html)} sel={html.count('data-vai-select')} delays={re.findall(r'data-vai-delay=\"([^\"]+)\"', html)} href={re.findall(r'data-vai-href=\"([^\"]+)\"', html)} goto={re.findall(r'data-vai-goto=\"([^\"]+)\"', html)}")
        for st in res['steps']:
            html = "".join(x['dom_html'] for x in st['sections'])
            for m in re.finditer(r'<[^>]*data-vai-delay="([^"]+)"[^>]*>(.{0,200})', html):
                print('  DELAYED', st['slug'], m.group(1), re.sub(r'<[^>]+>', ' ', m.group(2))[:80].strip())
        json.dump(res, open(f'/tmp/walk_{tag}.json','w'), ensure_ascii=False)
asyncio.run(main())
