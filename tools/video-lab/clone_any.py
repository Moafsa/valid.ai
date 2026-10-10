#!/usr/bin/env python3
"""Clones any address with the real scanner and prints what the clone ended up with (players, hidden-until-X elements, notes).
usage: clone_any.py <url> [label]"""
import re, sys
from lablib import clone_url, stored
url = sys.argv[1]; label = sys.argv[2] if len(sys.argv) > 2 else "any"
pid, st, secs = clone_url(url, label)
html, notes, slug = stored(pid)
print(f"{st} in {secs:.0f}s  project={pid} slug={slug}")
print("players:", len(re.findall(r"data-vai-player=", html)), "| iframes:", len(re.findall(r"<iframe", html)), "| <video>:", len(re.findall(r"<video", html)), "| custom video elements:", re.findall(r"<(?:youtube|vimeo|wistia|mux|hls|dash)[a-z-]*", html))
print("pitch-at:", re.findall(r'data-vai-pitch-at="[^"]+"', html), "| delay:", re.findall(r'data-vai-delay="[^"]+"', html)[:6])
print("cta text present:", [t for t in ("ADICIONAR AO MEU PEDIDO",) if t in html])
for m in re.findall(r'data-vai-player="([^"]+)"', html)[:4]: print("  player:", m.replace("&quot;", '"')[:240])
print("notes:", notes[:400])
