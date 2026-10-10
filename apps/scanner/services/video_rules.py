"""
The RULES of a video player, read from the original instead of guessed.

A sales page's player is configured in its provider's dashboard: start on its own
or wait for a click, forbid pausing, hide the progress bar, show a fullscreen
button, reveal the offer at minute 11. VTurb publishes that configuration inside
the player script every visitor downloads (scripts.converteai.net/.../player.js),
so it can be read exactly. For every other kind of player the rules are worked
out from what the page does (attributes of a <video>, whether it was already
playing when the screen opened).

Output is the `cfg` of the clone's own player (public/vai-player.js).
"""
import json
import re
from typing import Optional

import httpx
from loguru import logger

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)

VTURB_PLAYER_RE = re.compile(r"scripts\.converteai\.net/[^/]+/players/([0-9a-f]+)/v\d+/player\.js", re.I)


def _bool(js: str, key: str, scope: Optional[str] = None) -> Optional[bool]:
    """`key:!0` / `key:true` -> True, `key:!1` / `key:false` -> False, inside `scope` when given."""
    text = scope if scope is not None else js
    m = re.search(r"[{,]%s:(!0|!1|true|false)" % re.escape(key), text)
    if not m:
        return None
    return m.group(1) in ("!0", "true")


def _block(js: str, key: str) -> str:
    """The `{...}` object that follows `key:` (balanced braces), or ''."""
    m = re.search(r"[{,]%s:\{" % re.escape(key), js)
    if not m:
        return ""
    i = m.end() - 1
    depth = 0
    for j in range(i, min(len(js), i + 20000)):
        c = js[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return js[i:j + 1]
    return ""


def _str(js: str, key: str, scope: Optional[str] = None) -> Optional[str]:
    text = scope if scope is not None else js
    m = re.search(r'[{,]%s:"((?:[^"\\]|\\.)*)"' % re.escape(key), text)
    if not m:
        return None
    try:
        return json.loads('"' + m.group(1) + '"')   # real escapes (\u00bf), UTF-8 text stays as it is
    except Exception:
        return m.group(1)


def _num(js: str, key: str, scope: Optional[str] = None) -> Optional[float]:
    text = scope if scope is not None else js
    m = re.search(r"[{,]%s:(-?\d+(?:\.\d+)?)" % re.escape(key), text)
    return float(m.group(1)) if m else None


def parse_vturb(js: str) -> dict:
    """Pulls the settings that change how a viewer experiences the video."""
    playback = _block(js, "playback")
    style = _block(js, "style")
    smart = _block(js, "smartAutoPlay")
    resume = _block(js, "resume")
    init = _block(js, "playerInit")
    out = {
        "smart_autoplay": bool(smart and _bool(smart, "active")),
        "disable_pause": bool(playback and _bool(playback, "disablePause")),
        "smart_pause": bool(playback and _bool(playback, "smartPause")),
        "after_finish_url": _str(_block(playback, "actionAfterFinish"), "url") if playback else None,
        "pitch": _num(js, "pitchTime"),
        "fullscreen": bool(style and _bool(style, "fullscreen")),
        "progress_bar": bool(style and _bool(style, "progressBar")),
        "video_time": bool(style and _bool(style, "videoTime")),
        "forward": bool(style and _bool(style, "forward")),
        "rewind": bool(style and _bool(style, "rewind")),
        "speed": bool(style and _bool(style, "speed")),
        "color": _str(style, "background") if style else None,
        "aspect": _num(init, "aspectRatio") if init else None,
        "vertical": bool(init and _bool(init, "verticalVideo")),
        "thumb_key": _str(init, "thumbnailKey") if init else None,
        "resume": bool(resume and _bool(resume, "active")),
        "resume_texts": {
            "title": _str(resume, "title") if resume else None,
            "play": _str(resume, "play") if resume else None,
            "replay": _str(resume, "replay") if resume else None,
        },
    }
    return out


def vturb_to_cfg(v: dict) -> dict:
    """VTurb settings -> the clone player's settings."""
    cfg: dict = {}
    cfg["start"] = "preview" if v.get("smart_autoplay") else "click"
    cfg["pause"] = "never" if v.get("disable_pause") else "free"
    if v.get("video_time"):
        cfg["bar"] = "full"
    elif v.get("progress_bar"):
        cfg["bar"] = "smart"
    else:
        cfg["bar"] = "none"
    cfg["fullscreen"] = bool(v.get("fullscreen"))
    cfg["seek"] = bool(v.get("forward") or v.get("rewind"))
    cfg["resume"] = bool(v.get("resume", True))
    texts = {k: t for k, t in (v.get("resume_texts") or {}).items() if t}
    if texts:
        cfg["resumeText"] = texts
    if v.get("color") and re.match(r"^#[0-9a-fA-F]{3,8}$", v["color"]):
        cfg["color"] = v["color"]
    if v.get("aspect"):
        cfg["ratio"] = round(float(v["aspect"]), 3)
    return cfg


async def fetch_vturb(player_js_url: str) -> Optional[dict]:
    """Downloads a VTurb player script and returns {"vturb": raw settings, "cfg": clone settings}."""
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True, headers={"User-Agent": _UA}) as client:
            r = await client.get(player_js_url)
            r.raise_for_status()
        v = parse_vturb(r.text)
        if not any(v.get(k) is not None for k in ("pitch", "aspect")) and not v.get("smart_autoplay"):
            return None
        m = VTURB_PLAYER_RE.search(player_js_url)
        if m and v.get("thumb_key"):
            acct = v["thumb_key"]
            v["poster"] = "https://images.converteai.net/" + acct
        return {"vturb": v, "cfg": vturb_to_cfg(v)}
    except Exception as e:
        logger.info(f"[video] could not read the VTurb settings at {player_js_url}: {e!r}")
        return None


def describe(cfg: dict, vturb: Optional[dict] = None) -> str:
    """One line for the scan notes, in the founder's language."""
    bits = []
    bits.append({"click": "começa ao clicar", "auto": "começa sozinho ao abrir", "preview": "começa mudo e o toque liga o som"}.get(cfg.get("start"), "começa ao clicar"))
    bits.append({"never": "não deixa pausar", "once": "deixa pausar uma vez só"}.get(cfg.get("pause"), "deixa pausar"))
    if cfg.get("bar") == "none":
        bits.append("sem barra de progresso")
    elif cfg.get("bar") == "full":
        bits.append("com controles completos")
    elif cfg.get("bar") == "smart":
        bits.append("barra esperta")
    if cfg.get("fullscreen"):
        bits.append("com tela cheia")
    if vturb and vturb.get("pitch"):
        m, s = divmod(int(vturb["pitch"]), 60)
        bits.append(f"a oferta aparece aos {m}:{s:02d}")
    return "Vídeo: " + ", ".join(bits) + "."
