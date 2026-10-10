#!/usr/bin/env python3
"""Reads out/*/result.json and prints one line per site with what looks wrong, worst first."""
import json, glob, sys
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else 'out'
rows = []
for f in sorted(glob.glob(f'/opt/funnelai/tools/site-lab/sites/{OUTDIR}/*/result.json')):
    r = json.load(open(f))
    if 'crash' in r: rows.append((999, r['idx'], r['url'], ['CRASH ' + r['crash'][:60]])); continue
    flags = []; score = 0
    for w in ('1440', '390'):
        d = r['widths'].get(w) or {}
        if d.get('fail'): flags.append(f'{w}:FAIL {d["fail"][:70]}'); score += 50; continue
        if d.get('recall', 1) < 0.9: flags.append(f'{w}:recall {d["recall"]}'); score += (1 - d['recall']) * 80
        hr = d.get('heightRatio', 1)
        if hr < 0.85 or hr > 1.18: flags.append(f'{w}:height x{hr}'); score += 20
        if d.get('overflowX'): flags.append(f'{w}:OVERFLOW-X'); score += 25
        b = d.get('broken', [0, 0])
        if b[1] > b[0] + 1: flags.append(f'{w}:broken-img {b}'); score += 15
        if d.get('videoMissing'): flags.append(f'{w}:VIDEO-MISSING'); score += 30
        va = d.get('videoArea')
        if va is not None and (va < 0.7 or va > 1.4): flags.append(f'{w}:video-area x{va}'); score += 25
        if d.get('fixedMedia'): flags.append(f'{w}:fixed-media(mini?) {d["fixedMedia"][0]["rect"][2:]}'); score += 30
        if d.get('hotlinks'): flags.append(f'{w}:hotlinks {list(d["hotlinks"].items())[:1]}'); score += 5
        if d.get('diffTop', 0) > 25: flags.append(f'{w}:diffTop {d["diffTop"]}'); score += d['diffTop'] / 4
        pass
        if d.get('cloneNFailed', 0) > 3: flags.append(f'{w}:failed-req {d["cloneNFailed"]}'); score += 5
    rows.append((score, r['idx'], r['url'], flags))
rows.sort(reverse=True)
lim = int(sys.argv[1]) if len(sys.argv) > 1 else 60
for s, i, u, fl in rows[:lim]:
    print(f'{s:5.0f}  #{i:<3} {u[:52]:52}  ' + ' | '.join(fl[:6]))
print(len(rows), 'sites compared; clean:', sum(1 for r in rows if not r[3]))
