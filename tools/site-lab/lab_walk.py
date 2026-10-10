#!/usr/bin/env python3
"""Runs the scanner's own capture (scrape_url, funnel walker included) on lab sites and writes a summary per site.
usage: lab_walk.py <site> [<site>...]   (sites served at http://172.18.0.1:8099/<site>/)"""
import asyncio, json, os, re, sys, time
sys.path.insert(0, '/app')
from services.playwright_scraper import PlaywrightScraper
os.makedirs('/tmp/lab_walk', exist_ok=True)
async def one(site):
    url = f'http://172.18.0.1:8099/{site}/'
    t = time.time()
    out = {'site': site, 'url': url}
    try:
        async with PlaywrightScraper() as sc:
            async def prog(f, tx): pass
            res = await asyncio.wait_for(sc.scrape_url(url, capture_thumbnail=False, on_progress=prog, try_funnel=True), 2400)
        out['took'] = round(time.time() - t, 1)
        if res.get('funnel'):
            f = res['funnel']
            steps = f['steps']
            out['kind'] = 'funnel'
            out['n_steps'] = len(steps)
            out['titles'] = [re.sub(r'^Etapa \d+: ?', '', s['name']) for s in steps]
            out['css'] = len(f.get('page_css') or '')
            out['exit'] = f.get('exit_url')
            out['notes'] = f.get('notes')
            htmls = ["".join(x['dom_html'] for x in s['sections']) for s in steps]
            out['html_bytes'] = sum(len(h) for h in htmls)
            out['attrs'] = {a: sum(h.count(a) for h in htmls) for a in ('data-vai-next', 'data-vai-select', 'data-vai-goto', 'data-vai-href', 'data-vai-delay', 'data-vai-tl', 'data-vai-anim', 'data-vai-auto-to', 'data-vai-player', 'data-vai-cd')}
            out['lab_attrs'] = sum(h.count('data-lab-') for h in htmls)
        else:
            out['kind'] = 'page'
            secs = res.get('sections') or []
            out['n_sections'] = len(secs)
            h = "".join(s.get('dom_html') or '' for s in secs)
            out['html_bytes'] = len(h)
            out['text'] = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', h))[:200]
            out['video'] = bool(res.get('video'))
            out['css'] = len(res.get('page_css') or '')
            out['images'] = len(re.findall(r'<img\b', h))
            out['players'] = h.count('data-vai-player')
    except Exception as e:
        out['error'] = repr(e)[:300]
        out['took'] = round(time.time() - t, 1)
    json.dump(out, open(f'/tmp/lab_walk/{site.replace(chr(47), chr(95))}.json', 'w'), ensure_ascii=False, indent=1)
    print(f"{site:16} {out.get('kind','ERR'):7} steps={out.get('n_steps', out.get('n_sections'))} took={out['took']}s {('ERR ' + out['error']) if 'error' in out else ''}", flush=True)
async def main():
    for s in sys.argv[1:]:
        await one(s)
asyncio.run(main())
