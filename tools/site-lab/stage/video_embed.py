"""
Every video of a captured page becomes the clone's own light player.

The capture keeps whatever the original had: a plain <video>, an <iframe> of a
video host (YouTube, Vimeo, Wistia, Panda...). Left as they are they bring the
host's heavy player (and its rules) into the clone. This pass swaps each one for
a <div data-vai-player="..."> box that keeps the proportion, position and
responsiveness of the original, configured with what the original element says
about itself (autoplay, controls, loop, poster). public/vai-player.js mounts it.

Players the engine already replaced (custom elements like VTurb, marker present)
are left alone, and so are decorative background loops (muted + loop + autoplay,
no controls): those are not "the video" of the page.
"""
import html as _html
import json
import re
from typing import Optional
from urllib.parse import urlparse, parse_qs

VIDEO_TAG = re.compile(r"<video\b([^>]*)>(.*?)</video>", re.I | re.S)
IFRAME_TAG = re.compile(r"<iframe\b([^>]*)>(?:\s*</iframe>)?", re.I | re.S)
ATTR = re.compile(r'([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+)))?')
SOURCE_SRC = re.compile(r"<source\b[^>]*\ssrc=[\"']([^\"']+)[\"']", re.I)

VIDEO_HOSTS = re.compile(
    r"(youtube\.com/embed|youtube-nocookie\.com/embed|player\.vimeo\.com|fast\.wistia\.(net|com)|"
    r"pandavideo\.com|player-vz-|iframe\.mediadelivery\.net|scripts\.converteai\.net|vturb|loom\.com/embed|"
    r"dailymotion\.com/embed|streamable\.com/e/|play\.gumlet|player\.cloudinary|videodelivery\.net)",
    re.I,
)


def _attrs(raw: str) -> dict:
    out = {}
    for m in ATTR.finditer(raw or ""):
        name = m.group(1).lower()
        val = m.group(2) if m.group(2) is not None else (m.group(3) if m.group(3) is not None else (m.group(4) if m.group(4) is not None else ""))
        out.setdefault(name, _html.unescape(val))
    return out


def _youtube_poster(url: str) -> Optional[str]:
    m = re.search(r"(?:youtube(?:-nocookie)?\.com/embed/|youtu\.be/)([\w-]{6,})", url)
    return f"https://i.ytimg.com/vi/{m.group(1)}/hqdefault.jpg" if m else None


def _ratio(attrs: dict) -> float:
    """height / width * 100: from the box the capture measured, else the element's own size, else 16:9."""
    box = attrs.get("data-vai-box")
    if box:
        try:
            w, h = [float(x) for x in box.split(",")[:2]]
            if w > 0 and h > 0:
                return round(h / w * 100, 3)
        except Exception:
            pass
    try:
        w, h = float(attrs.get("width", "")), float(attrs.get("height", ""))
        if w > 0 and h > 0:
            return round(h / w * 100, 3)
    except Exception:
        pass
    return 56.25


def _box(attrs: dict) -> Optional[tuple]:
    """(width, height) in px of what the original element occupied, when the capture measured it."""
    box = attrs.get("data-vai-box")
    if box:
        try:
            w, h = [float(x) for x in box.split(",")[:2]]
            if w > 0 and h > 0:
                return w, h
        except Exception:
            pass
    return None


# smaller than this a "video" is a widget (a captcha badge, a chat bubble, a thumbnail), not the page's video
MIN_W, MIN_H = 200, 100


def _wrapper(cfg: dict, attrs: dict) -> str:
    ratio = _ratio(attrs)
    cfg = {**cfg, "ratio": ratio}
    payload = _html.escape(json.dumps(cfg, ensure_ascii=False, separators=(",", ":")), quote=True)
    klass = attrs.get("class", "")
    style = (attrs.get("style") or "").strip().rstrip(";")
    # the box keeps the element's own class/inline size; the proportion comes from padding
    style = (style + ";" if style else "") + f"position:relative;display:block;height:0;padding-top:{ratio}%;overflow:hidden;background:#000"
    box = _box(attrs)
    if box and box[0] < 1180:
        # a player that was 480px wide must not stretch to the whole column
        style += f";max-width:{int(box[0])}px"
    cls = f' class="{_html.escape(klass, quote=True)}"' if klass else ""
    return f'<div data-vai-player="{payload}"{cls} style="{_html.escape(style, quote=True)}"></div>'


def _is_decorative(attrs: dict) -> bool:
    return "loop" in attrs and "muted" in attrs and "autoplay" in attrs and "controls" not in attrs


# A picture with a play button that loads the real player only when clicked (data-video-player="wistia" data-video-id="..."):
# without the site's script it is a dead picture, so it becomes the clone's player for that video.
THUMB_OPEN = re.compile(r"<(button|div|a|span|figure)\b([^>]*\bdata-video-player\s*=\s*[\"'](wistia|youtube|vimeo)[\"'][^>]*)>", re.I)
EMBED_OF = {
    "wistia": "https://fast.wistia.net/embed/iframe/{id}",
    "youtube": "https://www.youtube-nocookie.com/embed/{id}",
    "vimeo": "https://player.vimeo.com/video/{id}",
}


def _element_end(html: str, start: int, tag: str) -> int:
    """Index just after the closing tag that matches the element opened at `start` (-1 when it never closes)."""
    pat = re.compile(rf"<(/?){tag}\b[^>]*>", re.I)
    depth = 0
    for m in pat.finditer(html, start):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return m.end()
    return -1


def _thumbnail_players(html: str, made: list) -> str:
    out, pos = [], 0
    for m in THUMB_OPEN.finditer(html):
        if m.start() < pos:
            continue                                                  # inside one already replaced
        attrs = _attrs(m.group(2))
        vid = attrs.get("data-video-id") or ""
        box = _box(attrs)
        if not re.fullmatch(r"[\w-]{5,40}", vid) or "data-vai-hidden" in attrs or box is None or box[0] < MIN_W or box[1] < MIN_H:
            continue
        end = _element_end(html, m.start(), m.group(1))
        if end < 0:
            continue
        kind = m.group(3).lower()
        cfg = {"embed": EMBED_OF[kind].format(id=vid), "start": "click", "bar": "none", "pause": "free", "resume": False}
        poster = _youtube_poster(cfg["embed"]) if kind == "youtube" else None
        if poster:
            cfg["poster"] = poster
        made.append(cfg)
        out.append(html[pos:m.start()])
        out.append(_wrapper(cfg, attrs))
        pos = end
    out.append(html[pos:])
    return "".join(out)


def convert_html(html: str, page_video: Optional[dict] = None) -> tuple[str, list]:
    """Returns (new html, [config of every player created])."""
    low = (html or "").lower()
    if not html or ("<video" not in low and "<iframe" not in low and "data-video-player" not in low):
        return html, []
    made: list = []
    page_video_used = [False]

    def video(m):
        attrs = _attrs(m.group(1))
        if _is_decorative(attrs) or "data-vai-hidden" in attrs:
            return m.group(0)
        box = _box(attrs)
        # not measured (a video that was never laid out) or too small: it was not "the video" of the page
        if box is None or box[0] < MIN_W or box[1] < MIN_H:
            return m.group(0)
        src = attrs.get("src") or ""
        if not src:
            s = SOURCE_SRC.search(m.group(2) or "")
            src = _html.unescape(s.group(1)) if s else ""
        if src.startswith("blob:") or not src:
            # the stream the capture sniffed from the network belongs to ONE video of the page, the main one
            if page_video_used[0]:
                return m.group(0)
            src = (page_video or {}).get("url") or ""
            if src:
                page_video_used[0] = True
        if not src or src.startswith("blob:") or src.startswith("data:"):
            return m.group(0)
        controls = "controls" in attrs
        cfg = {
            "src": src,
            "start": "auto" if "autoplay" in attrs else "click",
            "bar": "full" if controls else "plain",
            "pause": "free",
            "seek": controls,
            "fullscreen": controls and "nofullscreen" not in (attrs.get("controlslist") or "").lower(),
            "resume": False,
        }
        if attrs.get("poster"):
            cfg["poster"] = attrs["poster"]
        elif attrs.get("data-vai-vid") is not None:
            cfg["poster"] = "__VAI_VSHOT_" + attrs["data-vai-vid"] + "__"      # the first frame, uploaded by the orchestrator
        if "loop" in attrs:
            cfg["loop"] = True
        made.append(cfg)
        return _wrapper(cfg, attrs)

    def iframe(m):
        attrs = _attrs(m.group(1))
        src = attrs.get("src") or attrs.get("data-src") or ""
        if not src or not VIDEO_HOSTS.search(src):
            return m.group(0)
        box = _box(attrs)
        if "data-vai-hidden" in attrs or (box is not None and (box[0] < MIN_W or box[1] < MIN_H)):
            return m.group(0)
        if src.startswith("//"):
            src = "https:" + src
        auto = (parse_qs(urlparse(src).query).get("autoplay") or ["0"])[0] in ("1", "true")
        cfg = {"embed": src, "start": "auto" if auto else "click", "bar": "none", "pause": "free", "resume": False}
        poster = _youtube_poster(src)
        if poster:
            cfg["poster"] = poster
        made.append(cfg)
        return _wrapper(cfg, attrs)

    out = _thumbnail_players(html, made)
    out = VIDEO_TAG.sub(video, out)
    out = IFRAME_TAG.sub(iframe, out)
    return out, made
