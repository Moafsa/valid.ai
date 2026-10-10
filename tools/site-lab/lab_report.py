#!/usr/bin/env python3
"""Compares /tmp/lab_walk/<site>.json (what the cloner captured) with expected.json (ground truth)."""
import json, sys, re, os
exp = json.load(open('/tmp/lab_expected.json'))
sites = sys.argv[1:] or sorted(exp)
def norm(t): return ' '.join((t or '').split()).lower()
print(f"{'site':16} {'verdict':8} {'expect':>7} {'got':>5}  details")
for s in sites:
    p = f'/tmp/lab_walk/{s}.json'
    if not os.path.exists(p): continue
    d = json.load(open(p)); e = exp[s]
    if d.get('error'): print(f"{s:16} ERROR    {d['error'][:100]}"); continue
    if e['kind'] in ('quiz', 'multipage'):
        want = e['reachable'] if e['kind'] == 'quiz' else e['main_len']
        got = d.get('n_steps') or 0
        main_ok = [norm(t) for t in e['main_path']] == [norm(t) for t in (d.get('titles') or [])][:len(e['main_path'])]
        have = {norm(t) for t in (d.get('titles') or [])}
        missing = [t for t in e['main_path'] if norm(t) not in have]
        ok = d['kind'] == 'funnel' and got >= want and not missing
        det = f"kind={d['kind']} main-path-in-order={main_ok} missing={len(missing)} {missing[:3]} took={d.get('took')}s"
        if d['kind'] == 'funnel': det += f" css={d['css']//1024}KB html={d['html_bytes']//1024}KB attrs={ {k[9:]: v for k, v in d['attrs'].items() if v} }"
        print(f"{s:16} {'OK' if ok else 'PROBLEM':8} {want:>7} {got:>5}  {det}")
    else:
        print(f"{s:16} {'info':8} {'-':>7} {d.get('n_sections','-'):>5}  kind={d['kind']} html={d.get('html_bytes',0)//1024}KB css={d.get('css',0)//1024}KB images={d.get('images')} players={d.get('players')} video={d.get('video')} took={d.get('took')}s text={d.get('text','')[:60]!r}")
