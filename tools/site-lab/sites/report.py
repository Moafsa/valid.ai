#!/usr/bin/env python3
"""Before/after summary of the real-site lab: v1 (old scanner, out_v1) vs v2 (new code, out)."""
import json, glob, os, sys, statistics as st
def load(d):
    out = {}
    for f in glob.glob(f'/opt/funnelai/tools/site-lab/sites/{d}/*/result.json'):
        r = json.load(open(f))
        if 'widths' in r: out[r['idx']] = r
    return out
A, B = load('out_v1'), load('out')
def flags(r):
    f = {'texto': 0, 'celular_largo': 0, 'imagem_quebrada': 0, 'video': 0, 'primeira_tela': 0, 'altura': 0, 'mini_player': 0}
    for w, d in r['widths'].items():
        if d.get('fail'): continue
        if d.get('recall', 1) < 0.9: f['texto'] = 1
        if d.get('overflowX'): f['celular_largo'] = 1
        if d.get('broken', [0, 0])[1] > d.get('broken', [0, 0])[0] + 1: f['imagem_quebrada'] = 1
        va = d.get('videoArea')
        if d.get('videoMissing') or (va is not None and (va < 0.6 or va > 1.6)): f['video'] = 1
        if d.get('diffTop', 0) > 30: f['primeira_tela'] = 1
        hr = d.get('heightRatio', 1)
        if hr < 0.8 or hr > 1.25: f['altura'] = 1
        if d.get('fixedMedia'): f['mini_player'] = 1
    return f
def kb(r):
    raw = f"/opt/funnelai/tools/site-lab/sites/{'out'}/{r['idx']:03d}/raw_1440.json"
    return None
both = sorted(set(A) & set(B))
print(f"v1 compared: {len(A)}  v2 compared: {len(B)}  in both: {len(both)}")
cats = ['texto', 'celular_largo', 'imagem_quebrada', 'video', 'primeira_tela', 'altura', 'mini_player']
for name, S in (('v1 (antes)', A), ('v2 (depois)', B)):
    ids = both if both else list(S)
    tot = {c: sum(flags(S[i])[c] for i in ids) for c in cats}
    clean = sum(1 for i in ids if not any(flags(S[i]).values()))
    print(name, 'limpos:', clean, '/', len(ids), tot)
def sumkb(S, d, ids):
    o = c = 0
    for i in ids:
        p = f'/opt/funnelai/tools/site-lab/sites/{d}/{i:03d}/raw_1440.json'
        if not os.path.exists(p): continue
        raw = json.load(open(p))
        if raw['orig'].get('ok') and raw['clone'].get('ok'):
            o += raw['orig'].get('kb', 0); c += raw['clone'].get('kb', 0)
    return o, c
for name, d, S in (('v1', 'out_v1', A), ('v2', 'out', B)):
    o, c = sumkb(S, d, both or list(S))
    print(name, 'peso total original', o // 1024, 'MB -> clone', c // 1024, 'MB', f'({round(100 * c / max(1, o))}%)')
