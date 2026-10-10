#!/usr/bin/env python3
"""Compares the playthrough of an original lab site with its clone.
usage: lab_compare.py <origdir> <clonedir> [--sheet out.png]
Both dirs hold steps.json + s###.png from lab_play.py. Reports: same screens in the same order, per-screen
pixel difference, time to reach each screen, bytes, long tasks."""
import json, sys, os
args = sys.argv[1:]
A, B = args[0], args[1]
a = json.load(open(f"{A}/steps.json"))
b = json.load(open(f"{B}/steps.json"))
try:
    from PIL import Image, ImageChops, ImageStat
except Exception:
    Image = None


def norm(t):
    return " ".join((t or "").split()).lower()


def pixdiff(pa, pb):
    if not Image or not pa or not pb or not os.path.exists(pa) or not os.path.exists(pb):
        return None
    ia, ib = Image.open(pa).convert("RGB"), Image.open(pb).convert("RGB")
    if ia.size != ib.size:
        ib = ib.resize(ia.size)
    d = ImageChops.difference(ia, ib).convert("L")
    # share of pixels that differ visibly (>24/255): robust to tiny anti-aliasing noise
    hist = d.histogram()
    bad = sum(hist[25:])
    return round(bad / (ia.size[0] * ia.size[1]) * 100, 2)


ta = [norm(s["title"]) for s in a["steps"]]
tb = [norm(s["title"]) for s in b["steps"]]
rows = []
n = max(len(ta), len(tb))
same_titles = 0
for i in range(n):
    sa = a["steps"][i] if i < len(a["steps"]) else None
    sb = b["steps"][i] if i < len(b["steps"]) else None
    pd = pixdiff(sa and sa["shot"], sb and sb["shot"]) if sa and sb else None
    ok = bool(sa and sb and norm(sa["title"]) == norm(sb["title"]))
    same_titles += ok
    rows.append((i + 1, sa and sa["title"][:34], sb and sb["title"][:34], ok, pd, sa and sa["t"], sb and sb["t"]))
print(f"original: {len(a['steps'])} screens in {a['total_s']}s, {a['bytes']//1024}KB | clone: {len(b['steps'])} screens in {b['total_s']}s, {b['bytes']//1024}KB | exits {a['exits'][-1:]} vs {b['exits'][-1:]}")
print(f"{'#':>3}  {'original':34}  {'clone':34}  same  diff%  t_orig t_clone")
for r in rows[:60]:
    print(f"{r[0]:>3}  {str(r[1]):34}  {str(r[2]):34}  {'OK ' if r[3] else 'XX '}  {str(r[4]):>5}  {str(r[5]):>6} {str(r[6]):>6}")
if len(rows) > 60:
    print("   ...", len(rows) - 60, "more rows")
def med(xs):
    xs = sorted(xs)
    return xs[len(xs) // 2] if xs else None
la = a.get("lat") or []
lb = b.get("lat") or []
print(f"LATENCY click->new screen in DOM (median ms): original {med([x[0] for x in la])} | clone {med([x[0] for x in lb])}   click->fully visible: original {med([x[1] for x in la])} | clone {med([x[1] for x in lb])}")
pds = [r[4] for r in rows if r[4] is not None]
print(f"SUMMARY screens {len(a['steps'])}->{len(b['steps'])} same-title {same_titles}/{n} | mean pixel diff {round(sum(pds)/len(pds), 2) if pds else '-'}% max {max(pds) if pds else '-'}% | "
      f"weight {a['bytes']//1024}KB -> {b['bytes']//1024}KB | longtasks {max([s['longtasks'] for s in a['steps']] or [0])} -> {max([s['longtasks'] for s in b['steps']] or [0])}")
