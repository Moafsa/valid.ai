#!/usr/bin/env python3
"""Side-by-side original | clone for one site/width. usage: sheet.py <idx> [width=1440] [y0=0] [h=2400] [out]"""
import sys
from PIL import Image, ImageDraw
idx = int(sys.argv[1]); w = int(sys.argv[2]) if len(sys.argv) > 2 else 1440
y0 = int(sys.argv[3]) if len(sys.argv) > 3 else 0; h = int(sys.argv[4]) if len(sys.argv) > 4 else 2400
import os
d = f"/lab/sites/{os.environ.get('OUTD', 'out')}/{idx:03d}"
out = sys.argv[5] if len(sys.argv) > 5 else f"/tmp/sheet_{idx:03d}_{w}_{y0}.png"
a, b = Image.open(f"{d}/orig_{w}.png").convert("RGB"), Image.open(f"{d}/clone_{w}.png").convert("RGB")
a = a.crop((0, y0, a.width, min(a.height, y0 + h))); b = b.crop((0, y0, b.width, min(b.height, y0 + h)))
H = max(a.height, b.height); gap = 16
sheet = Image.new("RGB", (a.width + b.width + gap, H + 22), (255, 0, 255))
sheet.paste(a, (0, 22)); sheet.paste(b, (a.width + gap, 22))
dr = ImageDraw.Draw(sheet); dr.text((6, 5), f"ORIGINAL #{idx} w{w} y{y0}", fill=(255, 255, 255)); dr.text((a.width + gap + 6, 5), "CLONE", fill=(255, 255, 255))
scale = min(1.0, 1900 / sheet.width)
if scale < 1: sheet = sheet.resize((int(sheet.width * scale), int(sheet.height * scale)), Image.LANCZOS)
sheet.save(out); print(out, sheet.size)
