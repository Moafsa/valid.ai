#!/usr/bin/env python3
"""Clones the video fixtures (one per way of putting a video on a page) with the real scanner and checks what the clone ended up with.
usage: check_situations.py [fixture ...]   (needs the fixture server on :8099; takes ~10 minutes for all)"""
import re, sys, json
from concurrent.futures import ThreadPoolExecutor
from lablib import clone_url, stored
fails = 0
def ok(c, what, extra=""):
    global fails
    print(("PASS  " if c else "FAIL  ") + what + ("" if c else "   -> " + str(extra)[:260]), flush=True)
    if not c: fails += 1
def players(html): return [json.loads(m.replace("&quot;", '"').replace("&amp;", "&")) for m in re.findall(r'data-vai-player="([^"]+)"', html)]
def attr_of(html, text, name):
    m = re.search(r'<(?:a|button)\b[^>]*\b%s="([^"]+)"[^>]*>\s*%s' % (name, re.escape(text)), html) or re.search(r'<(?:a|button)\b[^>]*>\s*%s' % re.escape(text), html) and None
    return m.group(1) if m else None
def has_text(html, text): return text in html

def c_ytcomp(h, n):
    p = players(h)
    ok(len(p) == 1 and "dQw4w9WgXcQ" in (p[0].get("embed") or ""), "ytcomp: the web component became a YouTube player", p)
    ok("<youtube-video" not in h, "ytcomp: no dead custom element left")
    ok('class="cover"' not in h and "data-vai-cover" not in h, "ytcomp: the page's own click-to-play layer is gone")
    at = attr_of(h, "ADICIONAR AO MEU PEDIDO", "data-vai-pitch-at")
    ok(at and 42 <= int(at) <= 46, "ytcomp: the buy button is tied to second ~45 of the video", at)
    ok("só aparece aos 0:4" in n, "ytcomp: the project says so", n[:200])
def c_native_pitch(h, n):
    ok(len(players(h)) == 1, "native_pitch: one player", len(players(h)))
    at = attr_of(h, "QUERO MEU ACESSO", "data-vai-pitch-at")
    ok(at and 10 <= int(at) <= 12, "native_pitch: the button is tied to second ~12", at)
    ok("data-vai-cover" not in h and 'class="cover"' not in h, "native_pitch: the layer over the video is gone")
def c_nodur(h, n):
    at = attr_of(h, "GARANTIR MINHA VAGA", "data-vai-pitch-at")
    ok(at and 26 <= int(at) <= 30, "nodur: even without a known duration the button is tied to second ~30", at)
def c_multi(h, n):
    p = players(h)
    ok(len(p) >= 3, "multi: the three videos became players", [x.get("src") or x.get("embed") for x in p])
    ok(any("youtube.com/embed" in (x.get("embed") or "") for x in p) and any("vimeo.com" in (x.get("embed") or "") for x in p), "multi: YouTube and Vimeo kept")
    at = attr_of(h, "COMPRAR PELO VIDEO", "data-vai-pitch-at")
    ok(at and 8 <= int(at) <= 10, "multi: the button of the video clock is tied to second ~10", at)
    d = attr_of(h, "OFERTA POR TEMPO", "data-vai-delay")
    ok(d and 9 <= int(d) <= 12 and attr_of(h, "OFERTA POR TEMPO", "data-vai-pitch-at") is None, "multi: the timer button is a DELAY of ~12 s, not tied to the video", (d, attr_of(h, "OFERTA POR TEMPO", "data-vai-pitch-at")))
def c_components(h, n):
    p = players(h)
    emb = [x.get("embed") or "" for x in p]; src = [x.get("src") or "" for x in p]
    ok(any("youtube.com/embed/dQw4w9WgXcQ" in e for e in emb), "components: lite-youtube", emb)
    ok(any("wistia.net/embed/iframe/abc123xyz9" in e for e in emb), "components: wistia-player", emb)
    ok(any(".m3u8" in s for s in src), "components: mux-player became an HLS player", src)
    ok(not re.search(r"<(lite-youtube|wistia-player|mux-player)", h), "components: no dead custom element left")
def c_iframes(h, n):
    p = players(h); emb = " ".join(x.get("embed") or "" for x in p)
    for k in ("wistia.net", "pandavideo.com.br", "mediadelivery.net", "vidalytics.com", "videodelivery.net"):
        ok(k in emb, f"iframes: {k} became a player", emb[:200])
    ok("<iframe" not in h, "iframes: no raw video iframe left", re.findall(r"<iframe[^>]*", h)[:1])
def c_lazy(h, n):
    p = players(h)
    ok(len(p) == 1 and (p[0].get("src") or p[0].get("embed")), "lazy: the video that loads on scroll became a player", p)
    ok("data-src" not in " ".join(x.get("src", "") for x in p), "lazy: it points at a real file/stream")
def c_cover_text(h, n):
    ok(len(players(h)) >= 1, "cover_text: the video became a player")
    ok("data-vai-cover" not in h, "cover_text: no marker left behind")

def c_timer(h, n):
    d = attr_of(h, "LIBERAR MEU DESCONTO", "data-vai-delay"); p = attr_of(h, "LIBERAR MEU DESCONTO", "data-vai-pitch-at")
    ok(d and 17 <= int(d) <= 20, "timer: a button a 20 s timer shows comes up after ~20 s in the clone (not at once)", (d, p))
    ok(p is None, "timer: and it is not tied to the video", p)

CASES = {"vsl_timer": c_timer, "vsl_ytcomp": c_ytcomp, "vsl_native_pitch": c_native_pitch, "vsl_native_nodur": c_nodur, "vsl_multi": c_multi, "vsl_components": c_components, "vsl_iframes": c_iframes, "vsl_lazy": c_lazy, "vsl_cover_text": c_cover_text}
names = sys.argv[1:] or list(CASES)
def one(name):
    pid, st, secs = clone_url(f"http://172.18.0.1:8099/{name}/", name)
    h, n, slug = stored(pid)
    return name, pid, st, secs, h, n, slug
with ThreadPoolExecutor(3) as ex:
    results = list(ex.map(one, names))
made = {}
for name, pid, st, secs, h, n, slug in results:
    print(f"-- {name}: {st} in {secs:.0f}s  ({pid}, slug {slug})")
    made[name] = f"{pid}:{slug}"
    ok(st == "DONE", f"{name}: the clone finished")
    CASES[name](h, n)
open("/tmp/vsl_situations.json", "w").write(json.dumps(made))
print("\nALL PASSED" if fails == 0 else f"\n{fails} FAILED")
sys.exit(1 if fails else 0)
