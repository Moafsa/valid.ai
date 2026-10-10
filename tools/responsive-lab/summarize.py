#!/usr/bin/env python3
"""Reads responsive_compare results and fails when a fixture is not faithful at some screen size."""
import glob, json, sys
d = sys.argv[1]
names = {}
for l in open('/opt/funnelai/tools/site-lab/sites/resp_fixtures.tsv'):
    p = l.rstrip('\n').split('\t'); names[int(p[0]) % 100] = p[2].rsplit('/', 1)[-1]
bad = 0
for f in sorted(glob.glob(f'{d}/*/result.json')):
    r = json.load(open(f))
    fx = names.get(r['idx'] % 100, r['url'])
    miss = {w: v for w, v in r['widths'].items() if not v.get('faithful')}
    if miss:
        bad += 1
        print(f"FAIL  {fx}: not faithful at", {w: (v.get('fail') or {k: v.get(k) for k in ('matched', 'bad', 'overflowC', 'menuBroken')}) for w, v in miss.items()})
    else:
        print(f"PASS  {fx}: faithful at all {len(r['widths'])} sizes")
print(f"\n{bad} fixture(s) failing")
sys.exit(1 if bad else 0)
