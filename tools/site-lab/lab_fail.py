#!/usr/bin/env python3
"""Hostile / broken sites through the real pipeline: must end (READY or a clear ERROR), never hang, never lie.
usage: lab_fail.py name=path [...]   e.g. err500=/x/err500 block=/x/block"""
import re, subprocess, sys, time
H = "/opt/funnelai/tools/site-lab"
for arg in sys.argv[1:]:
    name, path = arg.split("=", 1)
    t = time.time()
    r = subprocess.run(f"sh {H}/harness/run.sh 'http://172.18.0.1:8099{path}' labx_{name}", shell=True, capture_output=True, text=True, timeout=3300)
    out = r.stdout + "\n" + r.stderr
    status = re.search(r"project status (\w+)", out)
    pages = [l for l in out.splitlines() if l.startswith("page ")]
    err = [l for l in out.splitlines() if "rror" in l or "FAILED" in l or "falh" in l.lower()]
    print(f"{name:12} {path:18} -> {status.group(1) if status else 'NO STATUS'} in {round(time.time()-t)}s, pages={len(pages)} | {(err[-1] if err else '')[:160]}", flush=True)
