#!/usr/bin/env python3
"""Side by side: original screens on top, clone screens below. usage: lab_sheet.py <site> [first_n] -> /tmp/lab_e2e/<site>/sheet.png (inside the scanner)"""
import sys, glob
from PIL import Image
site = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 6
base = f"/tmp/lab_e2e/{site}"
def load(d):
    fs = sorted(glob.glob(f"{base}/{d}/s*.png"))[:n]
    return [Image.open(f).convert("RGB") for f in fs]
a, b = load("orig"), load("clone")
w = 300
def thumb(i): return i.resize((w, int(i.height * w / i.width)))
rows = [[thumb(i) for i in a], [thumb(i) for i in b]]
H = max([i.height for r in rows for i in r] or [10])
cols = max(len(rows[0]), len(rows[1]))
out = Image.new("RGB", (cols * (w + 6), 2 * (H + 6)), "#888")
for r, row in enumerate(rows):
    for c, im in enumerate(row):
        out.paste(im, (c * (w + 6), r * (H + 6)))
out.save(f"{base}/sheet.png"); print(out.size)
