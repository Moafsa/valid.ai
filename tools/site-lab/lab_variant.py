#!/usr/bin/env python3
"""Plays an already-scanned lab site again with other conditions (desktop width, slow phone, full scroll).
usage: lab_variant.py <site> <tag> [--width 1280] [--slow] [--scroll] [--max 40]"""
import json, re, subprocess, sys
H = "/opt/funnelai/tools/site-lab"
site, tag = sys.argv[1], sys.argv[2]
flags = " ".join(sys.argv[3:])
first = open(f"{H}/lab/results_{site}.txt").readline()
m = re.search(r"project (\S+) slug (\S+)", first)
pid, slug = m.groups()
def dx(c): return subprocess.run(f"docker exec funnelai_scanner sh -c {json.dumps(c)}", shell=True, capture_output=True, text=True, timeout=3000)
url = f"http://172.18.0.1:8099/{site}/"
clone = f"http://web:3000/projects/{pid}/p/{slug}"
base = f"/tmp/lab_var/{site}_{tag}"
dx(f"rm -rf {base}; mkdir -p {base}")
dx(f"cd /tmp && timeout 1200 python3 lab_play.py {url} {base}/orig {flags}")
dx(f"cd /tmp && timeout 1200 python3 lab_play.py {clone} {base}/clone {flags}")
r = dx(f"cd /tmp && python3 lab_compare.py {base}/orig {base}/clone")
open(f"{H}/lab/variant_{site}_{tag}.txt", "w").write(r.stdout + r.stderr)
print(f"=== {site} [{tag}]"); print("\n".join(r.stdout.strip().splitlines()[-2:]))
