#!/usr/bin/env python3
"""pairs.tsv (idx, original url, clone url) from a batch result file. usage: build_pairs.py scan_x.jsonl out.tsv"""
import json, sys
best = {}
for l in open(sys.argv[1]):
    j = json.loads(l)
    if j.get('status') == 'ok': best[j['idx']] = j
with open(sys.argv[2], 'w') as f:
    for i, j in sorted(best.items()):
        f.write(f"{i}\t{j['url']}\thttp://web:3000/projects/{j['projectId']}/p/{j['slug']}\n")
print(len(best), 'pairs')
