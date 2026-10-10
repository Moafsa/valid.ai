#!/usr/bin/env python3
"""One table from every lab result file: results_<site>.txt (screen-by-screen) and tl_<site>.txt (over time)."""
import glob, os, re
L = os.path.dirname(os.path.abspath(__file__))
rows = {}
for f in sorted(glob.glob(f"{L}/results_*.txt")):
    site = os.path.basename(f)[8:-4]
    t = open(f).read()
    m = re.search(r"SUMMARY screens (\d+)->(\d+) same-title (\d+)/(\d+) \| mean pixel diff ([\d.\-]+)%? max ([\d.\-]+)%? \| weight (\d+)KB -> (\d+)KB", t)
    lat = re.search(r"LATENCY click->new screen in DOM \(median ms\): original (\S+) \| clone (\S+)\s+click->fully visible: original (\S+) \| clone (\S+)", t)
    if m:
        rows[site] = dict(kind="screens", o=int(m[1]), c=int(m[2]), same=f"{m[3]}/{m[4]}", mean=m[5], mx=m[6], wo=int(m[7]), wc=int(m[8]), lat=lat.groups() if lat else None)
for f in sorted(glob.glob(f"{L}/tl_*.txt")):
    site = os.path.basename(f)[3:-4]
    t = open(f).read()
    m = re.search(r"worst diff ([\d.]+)", t)
    if m and site not in rows:
        rows[site] = dict(kind="time", worst=float(m[1]))
print(f"{'site':22} {'check':8} result")
for s, r in rows.items():
    if r["kind"] == "screens":
        ok = r["o"] == r["c"] and r["same"].split("/")[0] == r["same"].split("/")[1]
        print(f"{s:22} {'OK' if ok else 'PROBLEM':8} screens {r['o']}->{r['c']} titles {r['same']} pixel diff mean {r['mean']}% max {r['mx']}% weight {r['wo']}KB->{r['wc']}KB")
    else:
        print(f"{s:22} {'OK' if r['worst'] < 6 else 'CHECK':8} over time: worst pixel diff {r['worst']}%")
