#!/usr/bin/env python3
"""End to end for lab sites, from the host: real scan (harness) -> play original and clone -> compare.
usage: lab_e2e.py <site> [<site> ...] [--width 390] [--max 40] [--slow]"""
import json, os, re, subprocess, sys, time
H = "/opt/funnelai/tools/site-lab"
args = sys.argv[1:]
sites = [a for a in args if not a.startswith("--") and not re.fullmatch(r"\d+", a)]
def opt(n, d): return args[args.index(n) + 1] if n in args else d
W, MAX = opt("--width", "390"), opt("--max", "40")
SLOW = (["--slow"] if "--slow" in args else []) + (["--scroll"] if "--scroll" in args else [])
def sh(cmd, timeout=3000):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
def dx(cmd, timeout=3000):
    return sh(f"docker exec funnelai_scanner sh -c {json.dumps(cmd)}", timeout)
for site in sites:
    t = time.time()
    url = f"http://172.18.0.1:8099/{site}/"
    r = sh(f"sh {H}/harness/run.sh '{url}' lab_{site}", 3000)
    m = re.search(r'\{"projectId":"([^"]+)","slug":"([^"]+)"\}', r.stdout)
    notes = [l for l in (r.stdout + "\n" + r.stderr).splitlines() if l.startswith("page ")]
    if not m:
        print(f"{site}: SCAN FAILED {round(time.time()-t)}s | {(r.stderr.strip().splitlines() or [''])[-1][:200]}"); continue
    pid, slug = m.group(1), m.group(2)
    scan_s = round(time.time() - t)
    clone = f"http://web:3000/projects/{pid}/p/{slug}"
    dx(f"rm -rf /tmp/lab_e2e/{site}; mkdir -p /tmp/lab_e2e/{site}")
    o = dx(f"cd /tmp && timeout 900 python3 lab_play.py {url} /tmp/lab_e2e/{site}/orig --width {W} --max {MAX} {' '.join(SLOW)}")
    c = dx(f"cd /tmp && timeout 900 python3 lab_play.py {clone} /tmp/lab_e2e/{site}/clone --width {W} --max {MAX} {' '.join(SLOW)}")
    cmp_ = dx(f"cd /tmp && python3 lab_compare.py /tmp/lab_e2e/{site}/orig /tmp/lab_e2e/{site}/clone")
    open(f"{H}/lab/results_{site}.txt", "w").write(f"project {pid} slug {slug} scan {scan_s}s pages {len(notes)}\n{o.stdout}\n{c.stdout}\n{cmp_.stdout}\n{cmp_.stderr}")
    print(f"=== {site}: project {pid} scan {scan_s}s pages={len(notes)}")
    print("\n".join(cmp_.stdout.strip().splitlines()[-2:]) if cmp_.stdout.strip() else cmp_.stderr[-300:])
    sys.stdout.flush()
