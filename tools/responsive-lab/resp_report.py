#!/usr/bin/env python3
"""Regression of the clone against its own 1440 baseline, per site. usage: resp_report.py <dir> [<dir2> to compare]"""
import json, glob, os, sys, collections
def reg(r):
    w = r['widths']; b = w.get('1440', {})
    out = []
    for k, v in w.items():
        if k == '1440' or 'fail' in v or 'fail' in b: continue
        flags = []
        if v['bad'] - b['bad'] > 0.15: flags.append('moved')
        if b['matched'] - v['matched'] > 0.12: flags.append('lost')
        if v['overflowC'] and not v['overflowO']: flags.append('overflow')
        if v.get('menuBroken'): flags.append('menu')
        if abs(v['heightRatio'] - b['heightRatio']) > 0.3: flags.append('height')
        if flags: out.append((k, '+'.join(flags)))
    return out
def load(d):
    rows = {}
    for f in glob.glob(f'{d}/*/result.json'):
        r = json.load(open(f)); rows[r['idx']] = r
    return rows
A = load(sys.argv[1]); B = load(sys.argv[2]) if len(sys.argv) > 2 else None
kinds = collections.Counter(); bad = 0
ids = sorted(A if not B else set(A) & set(B))
for i in ids:
    a = reg(A[i]); b = reg(B[i]) if B else None
    if B is None:
        if a:
            bad += 1
            for _, fl in a:
                for x in fl.split('+'): kinds[x] += 1
            print(f"#{i:<4} {A[i]['url'][:50]:50} " + ' '.join(f'{k}:{v}' for k, v in a)[:90])
    else:
        fa = ' '.join(f'{k}:{v}' for k, v in a) or '-'; fb = ' '.join(f'{k}:{v}' for k, v in b) or '-'
        bad += bool(b)
        print(f"#{i:<4} {A[i]['url'][:46]:46} {fa[:34]:34} -> {fb[:60]}")
print(f"\n{len(ids)} sites; with a regression: {bad}" + (f"  kinds: {dict(kinds)}" if B is None else ''))
