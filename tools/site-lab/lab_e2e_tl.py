#!/usr/bin/env python3
"""Scan with the real pipeline, then compare original and clone over TIME (no clicks).
usage: lab_e2e_tl.py site[:t1,t2,..] ... [--width 390]"""
import json, re, subprocess, sys, time
H = "/opt/funnelai/tools/site-lab"
args = sys.argv[1:]
W = args[args.index("--width") + 1] if "--width" in args else "390"
items = [a for a in args if not a.startswith("--") and a != W]
def sh(c, t=3000): return subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t)
for it in items:
    site, _, times = it.partition(":")
    times = times or "0.6,2,4,7,11"
    t = time.time()
    url = f"http://172.18.0.1:8099/{site}/"
    r = sh(f"sh {H}/harness/run.sh '{url}' lab_{site}", 3000)
    out = r.stdout + "\n" + r.stderr
    m = re.search(r'\{"projectId":"([^"]+)","slug":"([^"]+)"\}', out)
    pages = [l for l in out.splitlines() if l.startswith("page ")]
    if not m:
        print(f"=== {site}: SCAN FAILED {round(time.time()-t)}s | {(r.stderr.strip().splitlines() or [''])[-1][:200]}"); sys.stdout.flush(); continue
    pid, slug = m.groups()
    clone = f"http://web:3000/projects/{pid}/p/{slug}"
    c = sh(f"docker exec funnelai_scanner sh -c {json.dumps(f'cd /tmp && mkdir -p /tmp/lab_tl/{site} && timeout 300 python3 lab_timeline.py {url} {clone} /tmp/lab_tl/{site} --times {times} --width {W}')}")
    res = c.stdout + c.stderr
    open(f"{H}/lab/tl_{site}.txt", "w").write(f"project {pid} slug {slug} scan {round(time.time()-t)}s pages={len(pages)}\n{res}")
    print(f"=== {site}: project {pid} scan {round(time.time()-t)}s pages={len(pages)}")
    print(res.strip()[-1500:]); sys.stdout.flush()
