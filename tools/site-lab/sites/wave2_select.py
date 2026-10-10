#!/usr/bin/env python3
"""Which sites go through a second scan after the generic fixes: the worst triage scores, the categories whose DOM the
fixes change (Wix / Framer / Carrd, phone variants), and clones with mangled or external-sprite markup."""
import json, re, subprocess, sys
S = '/opt/funnelai/tools/site-lab/sites'
rows = {int(l.split('\t')[0]): l.rstrip('\n').split('\t') for l in open(f'{S}/sites.tsv')}
latest = {}
for l in open(f'{S}/scan_v2.jsonl'):
    j = json.loads(l)
    if j.get('status') == 'ok': latest[j['idx']] = j
want = {}
tri = subprocess.run(['python3', f'{S}/triage.py', '9999', 'out'], capture_output=True, text=True, cwd=S).stdout
for line in tri.splitlines():
    m = re.match(r'\s*(\d+)\s+#(\d+)\s', line)
    if m and int(m.group(1)) >= int(sys.argv[1] if len(sys.argv) > 1 else 35): want.setdefault(int(m.group(2)), 'triage ' + m.group(1))
for idx, r in rows.items():
    if idx in latest and re.match(r'(framer|wix|carrd)', r[1]): want.setdefault(idx, 'category ' + r[1])
# markup problems straight from the database
ids = {j['projectId']: idx for idx, j in latest.items()}
if ids:
    plist = ",".join(f"'{p}'" for p in ids)
    q = f"""select p."projectId" from pages p where p."projectId" in ({plist}) and (
        p.blocks::text ~ 's3[.]be-vallid[.]com/[^"'' ]*[.](png|jpe?g|webp|avif|gif)/' or p.blocks::text ~ '<use[^>]*href=..https://s3[.]be-vallid[.]com[^"]*[.]svg#' ) group by 1"""
    out = subprocess.run(['docker', 'exec', 'funnelai_postgres', 'psql', '-U', 'funnelai_app', '-d', 'funnelai', '-tAc', q], capture_output=True, text=True).stdout
    for pid in out.split():
        if pid in ids: want.setdefault(ids[pid], 'markup')
for idx in sorted(want):
    print(f'{idx}\t{rows[idx][1]}\t{rows[idx][2]}\t{want[idx]}')
