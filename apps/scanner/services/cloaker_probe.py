"""
Is this link cloaked?  (version 2: find the CONDITION that changes the page)

A cloaker is a filter in front of a page: it looks at who is asking (the robot, the phone, the app the click came from, the
country, whether it has been here before...) and delivers a different page or behaviour to different askers.

The way to find it is an experiment, not a list of known tools:
  1. ask for the page as an ordinary visitor several times, independently, to learn how much the page changes on its own
     (caches, ads, rotating blocks): that is the noise;
  2. change ONE thing at a time from that ordinary visitor (the browser, the screen, the click's origin, the ad's parameters,
     the language, the time zone, the region headers, a robot's identity, the app's own browser, cookies and history) and ask again;
  3. compare each answer with the ordinary visitor's: final address, redirects, status, title, text, buttons, links, images,
     videos, scripts, frames, what appears after a few seconds or after scrolling;
  4. also ask the way a complete real visitor (phone + app + origin + ad parameters) asks, since many cloakers need several
     conditions at once.
A difference is not automatically cloaking: a phone getting a phone layout, a language getting its translation, a firewall turning
robots away are normal. What is flagged is a DELIBERATE-looking condition (origin, robot identity, ad parameters, first visit,
region) that changes the main content or the destination, reproducibly.

What cannot be seen from here: a decision made on the visitor's network address (country, data-center ranges). Region is only
simulated with the headers some filters trust; set PROXY_URL to a Brazilian residential/4G proxy to be asked as a customer.
"""
from __future__ import annotations

import asyncio
import html as htmllib
import io
import ipaddress
import re
import socket
import time
import uuid
from typing import Optional
from urllib.parse import parse_qsl, urljoin, urlsplit

import httpx
from loguru import logger

from config import settings
from services import personas as P

# ═══════════ safety: this server fetches addresses people type in, so it never fetches its own network ═══════════
BLOCKED_PORTS_OK = {80, 443, 8080, 8443, 8000, 3000, 5000}


def _is_public_ip(ip: str) -> bool:
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (a.is_private or a.is_loopback or a.is_link_local or a.is_multicast or a.is_reserved or a.is_unspecified)


_dns_cache: dict[str, bool] = {}


async def host_is_public(host: str) -> bool:
    host = (host or "").strip("[]").lower()
    if not host or host in ("localhost",) or host.endswith((".local", ".internal", ".lan", ".home")):
        return False
    if host in _dns_cache:
        return _dns_cache[host]
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
        ips = {i[4][0] for i in infos}
        ok = bool(ips) and all(_is_public_ip(ip) for ip in ips)
    except Exception:
        ok = False
    if len(_dns_cache) > 2000:
        _dns_cache.clear()
    _dns_cache[host] = ok
    return ok


async def url_is_allowed(url: str) -> bool:
    try:
        p = urlsplit(url)
    except Exception:
        return False
    if p.scheme not in ("http", "https") or not p.hostname:
        return False
    if p.port and p.port not in BLOCKED_PORTS_OK:
        return False
    return await host_is_public(p.hostname)


async def _guard(ctx) -> None:
    """The browser may follow redirects and load scripts, but never into this server's own network."""
    async def handler(route):
        try:
            if await url_is_allowed(route.request.url) or route.request.url.startswith(("data:", "blob:", "about:")):
                await route.fallback()
            else:
                await route.abort()
        except Exception:
            try:
                await route.abort()
            except Exception:
                pass
    await ctx.route("**/*", handler)


# ═══════════ reading a page ═══════════
_TAGS = re.compile(r"<[^>]+>")
_DROP = re.compile(r"<(script|style|noscript|template|svg)\b.*?</\1>", re.S | re.I)


def html_text(html: str) -> str:
    t = _TAGS.sub(" ", _DROP.sub(" ", html or ""))
    return re.sub(r"\s+", " ", htmllib.unescape(t)).strip()


def title_of(html: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", html or "", re.S | re.I)
    return re.sub(r"\s+", " ", htmllib.unescape(m.group(1))).strip()[:160] if m else ""


def words(text: str) -> set:
    return set(re.findall(r"[a-zà-ú0-9]{3,}", (text or "").lower())[:1200])


def similarity(a: str, b: str) -> float:
    wa, wb = words(a), words(b)
    if not wa and not wb:
        return 1.0
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def containment(small: str, big: str) -> float:
    """How much of `small` is still in `big` (a page replaced after loading keeps little of what it first showed)."""
    ws, wb = words(small), words(big)
    return len(ws & wb) / len(ws) if ws else 1.0


def jaccard(a, b) -> float:
    a, b = set(a), set(b)
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)


_SLD = {"com", "co", "org", "net", "gov", "edu", "ac"}


def site_of(url: str) -> str:
    """The registrable domain (a m. or www. subdomain is still the same site)."""
    h = (urlsplit(url).hostname or "").lower()
    parts = h.split(".")
    if len(parts) >= 3 and parts[-2] in _SLD:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else h


def host_of(url: str) -> str:
    return (urlsplit(url).hostname or "").lower().removeprefix("www.")


def hp(u: str) -> str:
    """host + path of an address (no scheme, no query): how pages are told apart in lists."""
    p = urlsplit(u)
    return (p.hostname or "") + (p.path.rstrip("/") or "")


# ═══════════ traffic tools and the scripts that decide who sees what ═══════════
MARKERS: list[tuple[str, re.Pattern, str]] = [
    ("Keitaro (roteador de tráfego)", re.compile(r"keitaro|_subid|/click\.php|kclick|keitaro_|tds\.php", re.I), "tds"),
    ("Binom", re.compile(r"binom|\bbn_?clid\b", re.I), "tds"),
    ("Voluum", re.compile(r"voluum|vlm-?clid|\bcpid=", re.I), "tds"),
    ("RedTrack", re.compile(r"redtrack|rtkclickid", re.I), "tds"),
    ("Adspect", re.compile(r"adspect", re.I), "cloaker"),
    ("Cloaker (nome na página ou nos scripts)", re.compile(r"cloak(?:er|up|ly|x|ing)\b|cloaking", re.I), "cloaker"),
    ("TrafficGuard / AdScore / filtro de fraude", re.compile(r"adscore|trafficguard|clickcease|fraudblocker|botd|fingerprintjs|datadome", re.I), "filter"),
    ("Roteador (/go/, /out/, /r/, /redirect)", re.compile(r"(?:^|/)(?:go|out|r|redirect|click|track|jump|goto)/[A-Za-z0-9_-]{3,}", re.I), "tds"),
]
SCRIPT_TELLS: list[tuple[str, re.Pattern]] = [
    ("Um script confere o navegador (userAgent) e manda a pessoa para outro lugar", re.compile(r"navigator\.userAgent[\s\S]{0,400}(?:location|href|replace)|(?:location|href|replace)[\s\S]{0,400}navigator\.userAgent", re.I)),
    ("Um script confere de onde a pessoa veio (document.referrer)", re.compile(r"document\.referrer[\s\S]{0,300}(?:facebook|instagram|fbclid|tiktok|google)|(?:facebook|instagram|fbclid)[\s\S]{0,300}document\.referrer", re.I)),
    ("Um script consulta o IP ou o país da pessoa", re.compile(r"ipapi\.co|ip-api\.com|ipinfo\.io|ipify|geoip|freegeoip|ipwho\.is|cloudflare\.com/cdn-cgi/trace|country_code", re.I)),
    ("Um script procura sinais de robô (webdriver, headless)", re.compile(r"navigator\.webdriver|headlesschrome|phantomjs|selenium|puppeteer|playwright", re.I)),
    ("Um script usa cookie ou armazenamento para decidir se é a primeira visita", re.compile(r"(?:localStorage|sessionStorage|document\.cookie)[\s\S]{0,300}(?:location|replace|href|display|innerHTML)", re.I)),
    ("A página tem redirecionamento automático escondido (meta refresh ou location)", re.compile(r"<meta[^>]+http-equiv=[\"']?refresh|window\.location\.(?:replace|href)\s*=|location\.replace\(", re.I)),
    ("Um script espera alguns segundos antes de trocar o conteúdo ou o endereço", re.compile(r"setTimeout\([\s\S]{0,200}(?:location|replace|innerHTML|document\.write|display)", re.I)),
]


def scan_markers(source: str, extra: str = "") -> dict:
    hay = (source or "")[:400_000]
    tech = []
    for name, rx, kind in MARKERS:
        if rx.search(hay) or (extra and rx.search(extra)):
            tech.append({"name": name, "kind": kind})
    return {"tech": tech, "tells": [name for name, rx in SCRIPT_TELLS if rx.search(hay)]}


CDN_HEADERS = [("cf-ray", "Cloudflare"), ("x-amz-cf-id", "Amazon CloudFront"), ("x-vercel-id", "Vercel"), ("x-served-by", "Fastly"), ("x-azure-ref", "Azure Front Door"), ("x-akamai-transformed", "Akamai"), ("x-sucuri-id", "Sucuri"), ("x-nf-request-id", "Netlify")]
KEEP_HEADERS = ["server", "via", "cache-control", "vary", "content-language", "x-robots-tag", "refresh", "location", "content-type", "cf-cache-status", "x-cache", "age"]
CHALLENGE = re.compile(r"captcha|verify you are human|checking your browser|access denied|just a moment|attention required|are you a robot|acesso negado|cf-chl|enable javascript and cookies", re.I)

# ═══════════ what is asked, and as whom ═══════════
GROUPS = {
    "baseline": "Visitante comum (referência)",
    "device": "Aparelho (celular, tablet, computador)",
    "browser": "Navegador",
    "crawler": "Robôs de busca e de anúncios",
    "social": "Robôs de redes sociais",
    "referer": "Origem do clique (referrer)",
    "params": "Parâmetros do anúncio (UTM, fbclid, gclid)",
    "inapp": "Navegador dentro do aplicativo",
    "real": "Visitante real de anúncio (tudo junto)",
    "lang": "Idioma",
    "tz": "Fuso horário",
    "region": "Região (simulada por cabeçalho)",
    "session": "Primeira visita × visitas seguintes",
}
# which groups are the sort of condition a deliberate filter looks at, and which are ordinary ways a site adapts
DELIBERATE = {"crawler", "social", "referer", "params", "inapp", "real", "region", "session"}
ADAPTIVE = {"device", "browser", "lang", "tz"}

DESK = P.DESKTOP
UA_FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0"
UA_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
UA_IPAD = "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
UA_BING = "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"
UA_TWITTER = "Twitterbot/1.0"
UA_LINKEDIN = "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)"
IG = "https://l.instagram.com/"
FB = "https://l.facebook.com/"
TT = "https://www.tiktok.com/"
GG = "https://www.google.com/"
FBCLID = "IwAR0kQz3vV2mJ5d8xYhLw9bN1cPqRtUoA7sGfE4nTzXiKjHy6MaDcB"
GCLID = "Cj0KCQjwx4a1BhDOARIsAI8aMBhZxCvBnMqWeRtYuIoPaSdFgHjKl"
BR_IP = "177.71.128.10"
US_IP = "8.8.8.8"


def _sc(id, label, group, ua=P.CHROME_DESKTOP, mobile=False, viewport=None, referer=None, params=None, headers=None, lang="pt-BR", tz="America/Sao_Paulo", bot=False, http_only=False, accept_lang=None, changes=""):
    return dict(id=id, label=label, group=group, ua=ua, mobile=mobile, viewport=viewport or (P.PHONE_ANDROID if mobile else DESK), referer=referer, params=params or {},
                headers=headers or {}, lang=lang, tz=tz, bot=bot, http_only=http_only, accept_lang=accept_lang, changes=changes)


def scenarios() -> list[dict]:
    S = _sc
    p = P.PERSONAS
    out = [
        S("base#1", "Visitante comum no computador (1º acesso independente)", "baseline", changes="nada: é a referência"),
        S("base#2", "Visitante comum no computador (2º acesso independente)", "baseline", changes="nada: repete a referência"),
        S("base#3", "Visitante comum no computador (3º acesso independente)", "baseline", changes="nada: repete a referência"),
        S("mobile_android", "Celular Android (Chrome)", "device", ua=P.CHROME_ANDROID, mobile=True, changes="aparelho e tela"),
        S("mobile_ios", "iPhone (Safari)", "device", ua=UA_IPHONE, mobile=True, viewport=P.PHONE, changes="aparelho e tela"),
        S("tablet", "iPad (Safari)", "device", ua=UA_IPAD, mobile=True, viewport={"width": 820, "height": 1180}, changes="aparelho e tela"),
        S("firefox", "Firefox no computador", "browser", ua=UA_FIREFOX, changes="navegador"),
        S("safari", "Safari no Mac", "browser", ua=UA_SAFARI, changes="navegador"),
        S("googlebot", "Googlebot (busca)", "crawler", ua=P.GOOGLE_BOT, bot=True, changes="identidade de robô"),
        S("adsbot", "Robô do Google Ads", "crawler", ua=P.GOOGLE_ADSBOT, mobile=True, bot=True, changes="identidade de robô"),
        S("bingbot", "Bingbot", "crawler", ua=UA_BING, bot=True, changes="identidade de robô"),
        S("plain_http", "Programa sem navegador (HTML puro)", "crawler", ua=P.PY_HTTP, bot=True, http_only=True, changes="sem navegador"),
        S("bot_facebook", "Robô do Facebook / Instagram (revisão de anúncios)", "social", ua=P.FACEBOOK_BOT, bot=True, changes="identidade de robô"),
        S("bot_tiktok", "Robô do TikTok", "social", ua=P.TIKTOK_BOT, mobile=True, bot=True, changes="identidade de robô"),
        S("twitterbot", "Robô do X / Twitter", "social", ua=UA_TWITTER, bot=True, changes="identidade de robô"),
        S("linkedinbot", "Robô do LinkedIn", "social", ua=UA_LINKEDIN, bot=True, changes="identidade de robô"),
        S("ref_instagram", "Veio do Instagram (só a origem do clique)", "referer", referer=IG, changes="referrer"),
        S("ref_facebook", "Veio do Facebook (só a origem do clique)", "referer", referer=FB, changes="referrer"),
        S("ref_tiktok", "Veio do TikTok (só a origem do clique)", "referer", referer=TT, changes="referrer"),
        S("ref_google", "Veio do Google (só a origem do clique)", "referer", referer=GG, changes="referrer"),
        S("utm", "Com utm_source=ig&utm_medium=paid", "params", params={"utm_source": "ig", "utm_medium": "paid", "utm_campaign": "teste"}, changes="parâmetros UTM"),
        S("fbclid", "Com fbclid (clique de anúncio do Facebook/Instagram)", "params", params={"fbclid": FBCLID}, changes="fbclid"),
        S("gclid", "Com gclid (clique de anúncio do Google)", "params", params={"gclid": GCLID}, changes="gclid"),
        S("inapp_instagram", "Navegador interno do Instagram (Android)", "inapp", ua=p["ig_android"]["ua"], mobile=True, headers={"X-Requested-With": "com.instagram.android"}, changes="aplicativo"),
        S("inapp_facebook", "Navegador interno do Facebook (Android)", "inapp", ua=p["fb_android"]["ua"], mobile=True, headers={"X-Requested-With": "com.facebook.katana"}, changes="aplicativo"),
    ]
    for pid in ("ig_ios", "ig_android", "fb_android", "tiktok", "google_mobile"):
        q = p[pid]
        out.append(S(pid, q["label"], "real", ua=q["ua"], mobile=True, viewport=q["viewport"], referer=q["referer"], params=q["params"], headers=q.get("headers") or {}, changes="celular + aplicativo + origem + parâmetros"))
    out += [
        S("ig_ios#2", "Visitante do Instagram (iPhone), outra visita independente", "real", ua=p["ig_ios"]["ua"], mobile=True, viewport=P.PHONE, referer=IG, params=p["ig_ios"]["params"], changes="repetição"),
        S("lang_en", "Idioma inglês (Accept-Language en-US)", "lang", lang="en-US", accept_lang="en-US,en;q=0.9", changes="idioma"),
        S("lang_es", "Idioma espanhol (Accept-Language es)", "lang", lang="es-ES", accept_lang="es-ES,es;q=0.9", changes="idioma"),
        S("tz_ny", "Fuso horário de Nova York", "tz", tz="America/New_York", changes="fuso horário"),
        S("region_br", "Região Brasil (cabeçalhos CF-IPCountry / X-Forwarded-For)", "region", headers={"CF-IPCountry": "BR", "X-Forwarded-For": BR_IP, "X-Real-IP": BR_IP, "X-Geo-Country": "BR"}, changes="cabeçalhos de região"),
        S("region_us", "Região Estados Unidos (cabeçalhos CF-IPCountry / X-Forwarded-For)", "region", headers={"CF-IPCountry": "US", "X-Forwarded-For": US_IP, "X-Real-IP": US_IP, "X-Geo-Country": "US"}, changes="cabeçalhos de região"),
    ]
    return out


SEQ_LABELS = {
    "seq1": "Instagram (iPhone): 1ª visita", "seq2": "Instagram (iPhone): 2ª visita, mesmos cookies",
    "seq3": "Instagram (iPhone): após apagar os cookies", "seq4": "Instagram (iPhone): após apagar cookies e armazenamento",
    "base_2nd": "Visitante comum: 2ª visita, mesmos cookies",
}


def _persona(sc: dict) -> dict:
    return {"ua": sc["ua"], "viewport": sc["viewport"], "mobile": sc["mobile"], "referer": sc["referer"], "bot": sc["bot"], "headers": dict(sc["headers"]), "params": sc["params"], "label": sc["label"]}


# ═══════════ one question, asked as one person ═══════════
DOM_JS = r"""
async () => {
  const hp = u => { try { const x = new URL(u, location.href); return x.hostname + x.pathname.replace(/\/$/, ''); } catch (e) { return ''; } };
  const uniq = a => [...new Set(a.filter(Boolean))];
  const txt = e => (e.innerText || e.value || '').replace(/\s+/g, ' ').trim();
  const CTA = /compr|garant|quero|agora|assin|cadastr|inscrev|saiba|baixar|comece|teste gr|buy|order|checkout|get |start|join|sign ?up|subscribe|download|claim|add to cart|adicionar|resgat|continuar|entrar/i;
  const btn = [...document.querySelectorAll('a,button,[role=button],input[type=submit]')];
  const cta = uniq(btn.map(txt).filter(t => t && t.length <= 60 && CTA.test(t))).slice(0, 14);
  const vw = innerWidth, vh = innerHeight;
  const frames = [...document.querySelectorAll('iframe')].map(f => { const r = f.getBoundingClientRect(); return { host: (() => { try { return new URL(f.src, location.href).hostname; } catch (e) { return ''; } })(), big: r.width * r.height >= 0.6 * vw * vh }; });
  const meta = document.querySelector('meta[http-equiv="refresh" i]');
  let sw = 0; try { sw = (await navigator.serviceWorker.getRegistrations()).length; } catch (e) {}
  const h1 = document.querySelector('h1');
  return {
    h1: h1 ? txt(h1).slice(0, 140) : '',
    n: { img: document.images.length, video: document.querySelectorAll('video,[data-vai-player]').length, iframe: frames.length, script: document.scripts.length, a: document.links.length, form: document.forms.length, button: btn.length, all: document.getElementsByTagName('*').length },
    scripts: uniq([...document.scripts].map(s => s.src).filter(Boolean).map(hp)).slice(0, 60),
    inlineScripts: [...document.scripts].filter(s => !s.src).length,
    images: uniq([...document.images].map(i => hp(i.currentSrc || i.src))).slice(0, 50),
    videos: uniq([...document.querySelectorAll('video')].map(v => hp(v.currentSrc || v.src)).concat(frames.filter(f => /youtu|vimeo|wistia|vturb|panda|bunny|mux/i.test(f.host)).map(f => f.host))).slice(0, 12),
    links: uniq([...document.querySelectorAll('a[href]')].map(a => a.href).filter(h => /^https?:/.test(h)).map(hp)).slice(0, 80),
    cta, frames: frames.slice(0, 8), metaRefresh: meta ? meta.getAttribute('content') : '', sw,
    all_links: [...document.querySelectorAll('a[href],form[action]')].map(e => e.href || e.action).slice(0, 300),
  };
}
"""

EMPTY_DOM = {"n": {}, "scripts": [], "images": [], "videos": [], "links": [], "cta": [], "frames": [], "metaRefresh": "", "sw": 0, "h1": "", "all_links": []}


def _shot_b64(raw: bytes, width: int) -> str:
    import base64
    from PIL import Image
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    if im.width > width:
        im = im.resize((width, max(1, int(im.height * width / im.width))))
    out = io.BytesIO()
    im.save(out, "JPEG", quality=52, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()


async def _safe_close(x) -> None:
    """Closing a page, context or browser that the site (or the network) already took down must never fail a whole check."""
    try:
        await x.close()
    except Exception:
        pass


async def _fetch_http(url: str, sc: dict) -> dict:
    """What a program gets: the HTML the server hands over, no scripts run. Redirects are followed one at a time and each is checked."""
    chain = []
    lang = sc.get("lang") or "pt-BR"
    headers = {"User-Agent": sc["ua"], "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": sc.get("accept_lang") or f"{lang},{lang[:2]};q=0.9"}
    if sc.get("referer"):
        headers["Referer"] = sc["referer"]
    cur = P.with_params(url, sc.get("params") or {})
    body, status, hdr = "", 0, {}
    cookies: list[str] = []
    async with httpx.AsyncClient(timeout=15, follow_redirects=False, headers=headers, proxy=settings.PROXY_URL or None, verify=False) as c:
        for _ in range(10):
            if not await url_is_allowed(cur):
                raise RuntimeError("endereço não permitido")
            r = await c.get(cur)
            chain.append({"url": cur, "status": r.status_code, "via": "http"})
            cookies += list(r.cookies.keys())
            hdr = {k.lower(): v for k, v in r.headers.items()}
            if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                cur = urljoin(cur, r.headers["location"])
                continue
            status = r.status_code
            body = r.text[:600_000]
            break
    return {"status": status, "chain": chain, "finalUrl": cur, "html": body, "cookies": cookies, "headers": hdr}


async def _read_page(ctx, url: str, sc: dict) -> dict:
    """Opens `url` in a context and reads everything that matters from what came back."""
    pg = await ctx.new_page()
    chain: list[dict] = []
    first_body: dict = {}
    hdrs: dict = {}

    async def on_response(r):
        try:
            if r.request.resource_type == "document" and r.request.frame == pg.main_frame:
                chain.append({"url": r.url, "status": r.status, "via": "http"})
                if "html" not in first_body and r.status < 400:
                    first_body["html"] = (await r.text())[:400_000]
                if not hdrs:
                    hdrs.update({k.lower(): v for k, v in (await r.all_headers()).items()})
        except Exception:
            pass

    pg.on("response", lambda r: asyncio.ensure_future(on_response(r)))
    target = P.with_params(url, sc.get("params") or {})
    resp = await pg.goto(target, wait_until="domcontentloaded", timeout=30000)
    start_url = pg.url
    await pg.wait_for_timeout(1300)
    early = await pg.evaluate("document.body ? document.body.innerText : ''")
    try:
        await pg.wait_for_load_state("load", timeout=9000)
    except Exception:
        pass
    await pg.wait_for_timeout(3200)                               # scripts that decide late (and then swap the page or send the visitor elsewhere)
    try:
        await pg.wait_for_load_state("networkidle", timeout=3000)
    except Exception:
        pass
    final = pg.url
    body = await pg.evaluate("document.body ? document.body.innerText : ''")
    dom = await pg.evaluate(DOM_JS)
    cookies = [c["name"] for c in await ctx.cookies()]
    rendered = await pg.content()
    shot = await pg.screenshot(type="jpeg", quality=55)
    # whatever only shows up when the visitor scrolls
    try:
        await pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await pg.wait_for_timeout(1100)
        scrolled = await pg.evaluate("document.body ? document.body.innerText : ''")
    except Exception:
        scrolled = body
    title = (await pg.title())[:160]
    await _safe_close(pg)
    path = list(chain) or [{"url": target, "status": resp.status if resp else 0, "via": "http"}]
    if start_url.split("#")[0] != final.split("#")[0]:
        path.append({"url": final, "status": 200, "via": "js"})
    if dom.get("metaRefresh"):
        path.append({"url": "meta refresh: " + str(dom["metaRefresh"])[:120], "status": 0, "via": "meta"})
    norm = lambda t: re.sub(r"\s+", " ", t or "").strip()
    return dict(status=resp.status if resp else 0, chain=path, finalUrl=final, title=title, text=norm(body)[:6000], textEarly=norm(early)[:4000], textScrolled=norm(scrolled)[:6000],
                static=html_text(first_body.get("html") or "")[:6000], source=(first_body.get("html") or rendered)[:400_000], rendered=rendered[:150_000], cookies=cookies,
                dom=dom, headers=hdrs, jsRedirect=start_url.split("#")[0] != final.split("#")[0], shot=_shot_b64(shot, 320 if sc.get("mobile") else 520), ok=True)


def _result(sc: dict, got: dict, ms: int) -> dict:
    r = {"id": sc["id"], "label": sc["label"], "group": sc["group"], "bot": sc.get("bot", False), "mobile": sc.get("mobile", False), "changes": sc.get("changes", ""), "ok": bool(got.get("ok")), "ms": ms}
    r.update(got)
    return r


def _failed(e: Exception | str) -> dict:
    msg = str(e).splitlines()[0][:200] if str(e) else (e.__class__.__name__ if isinstance(e, Exception) else "erro")
    return {"ok": False, "error": msg, "status": 0, "chain": [], "finalUrl": "", "title": "", "text": "", "dom": dict(EMPTY_DOM)}


async def run_scenario(browser, sc: dict, url: str) -> dict:
    t0 = time.monotonic()
    try:
        if sc["http_only"]:
            got = await _fetch_http(url, sc)
            txt = html_text(got["html"])[:6000]
            got.update(title=title_of(got["html"]), text=txt, static=txt, textEarly=txt, textScrolled=txt, source=got["html"][:400_000], httpOnly=True, ok=got["status"] > 0, dom=dict(EMPTY_DOM))
            got.pop("html", None)
            return _result(sc, got, int((time.monotonic() - t0) * 1000))
        if sc.get("accept_lang"):
            sc = {**sc, "headers": {**sc["headers"], "Accept-Language": sc["accept_lang"]}}
        ctx = await P.open_context(browser, _persona(sc), locale=sc["lang"], timezone_id=sc["tz"])
        try:
            await _guard(ctx)
            got = await _read_page(ctx, url, sc)
        finally:
            await _safe_close(ctx)
        return _result(sc, got, int((time.monotonic() - t0) * 1000))
    except Exception as e:
        return _result(sc, _failed(e), int((time.monotonic() - t0) * 1000))


async def run_sequence(browser, url: str) -> list[dict]:
    """The same visitor coming back: first visit, second visit with the same cookies, after clearing cookies, after clearing everything;
    and an ordinary visitor's second visit. A filter that works on 'first time here' shows itself as a difference between the steps."""
    out: list[dict] = []
    ig = next(s for s in scenarios() if s["id"] == "ig_ios")
    t0 = time.monotonic()
    ctx = None
    try:
        ctx = await P.open_context(browser, _persona(ig), locale=ig["lang"], timezone_id=ig["tz"])
        await _guard(ctx)
        for sid in ("seq1", "seq2", "seq3", "seq4"):
            if sid == "seq3":
                await ctx.clear_cookies()
            if sid == "seq4":
                await ctx.clear_cookies()
                px = await ctx.new_page()
                try:
                    await px.goto(P.with_params(url, {}), wait_until="domcontentloaded", timeout=20000)
                    await px.evaluate("try{localStorage.clear();sessionStorage.clear()}catch(e){}")
                except Exception:
                    pass
                await _safe_close(px)
                await ctx.clear_cookies()
            sc = {**ig, "id": sid, "label": SEQ_LABELS[sid], "group": "session", "changes": "histórico do visitante"}
            try:
                got = await _read_page(ctx, url, sc)
            except Exception as e:
                got = _failed(e)
            out.append(_result(sc, got, int((time.monotonic() - t0) * 1000)))
    except Exception as e:
        for sid in ("seq1", "seq2", "seq3", "seq4"):
            if not any(r["id"] == sid for r in out):
                out.append(_result({"id": sid, "label": SEQ_LABELS[sid], "group": "session", "bot": False, "mobile": True, "changes": ""}, _failed(e), 0))
    finally:
        if ctx:
            await _safe_close(ctx)
    base = next(s for s in scenarios() if s["id"] == "base#1")
    ctx = None
    sc = {**base, "id": "base_2nd", "label": SEQ_LABELS["base_2nd"], "group": "session", "changes": "histórico do visitante"}
    try:
        ctx = await P.open_context(browser, _persona(base), locale=base["lang"], timezone_id=base["tz"])
        await _guard(ctx)
        await _read_page(ctx, url, sc)                      # the first visit (not reported: it is base#1's twin)
        out.append(_result(sc, await _read_page(ctx, url, sc), int((time.monotonic() - t0) * 1000)))
    except Exception as e:
        out.append(_result(sc, _failed(e), 0))
    finally:
        if ctx:
            await _safe_close(ctx)
    return out


# ═══════════ comparing ═══════════
def is_blocked(r: dict) -> bool:
    """The site turned this visitor away (error status, firewall or challenge page): that is a refusal, not a different page."""
    return (not r.get("ok")) or r.get("status", 0) >= 400 or bool(CHALLENGE.search((r.get("text") or "")[:1500]))


def _count(r: dict, k: str) -> int:
    return int(((r.get("dom") or {}).get("n") or {}).get(k, 0) or 0)


def _set(r: dict, k: str) -> list:
    return list((r.get("dom") or {}).get(k) or [])


CORE_KINDS = ("status", "url", "text", "iframe", "meta", "jsredirect")


def diff(a: dict, b: dict, floor: float = 0.78) -> dict:
    """What changed between page `a` (the reference) and page `b`: a list of changes and how significant they are together (0 to 1)."""
    if not b.get("ok"):
        return {"sig": 0.0, "changes": [], "failed": True, "same": False, "sameSite": True, "blocked": False, "sim": 0}
    ch: list[dict] = []

    def add(kind, label, detail, w):
        ch.append({"kind": kind, "label": label, "detail": detail, "w": w})

    if a.get("status") != b.get("status"):
        add("status", "Resposta HTTP", f"{a.get('status')} → {b.get('status')}", 0.55 if (b.get("status", 0) >= 400) != (a.get("status", 0) >= 400) else 0.1)
    ua_, ub_ = a.get("finalUrl", ""), b.get("finalUrl", "")
    same_site = site_of(ua_) == site_of(ub_)
    if not same_site:
        add("url", "Endereço final", f"{hp(ua_)} → {hp(ub_)} (outro site)", 1.0)
    elif host_of(ua_) != host_of(ub_):
        add("url", "Endereço final", f"{hp(ua_)} → {hp(ub_)} (outro subdomínio)", 0.3)
    elif urlsplit(ua_).path.rstrip("/") != urlsplit(ub_).path.rstrip("/"):
        add("url", "Endereço final", f"{hp(ua_)} → {hp(ub_)} (outro caminho)", 0.5)
    ha = [host_of(c["url"]) if c["via"] == "http" else c["via"] for c in a.get("chain", [])]
    hb = [host_of(c["url"]) if c["via"] == "http" else c["via"] for c in b.get("chain", [])]
    if ha != hb:
        extra = "; passa por script ou meta refresh" if any(c["via"] != "http" for c in b.get("chain", [])) and not any(c["via"] != "http" for c in a.get("chain", [])) else ""
        add("redirect", "Redirecionamentos", f"{max(0, len(ha) - 1)} → {max(0, len(hb) - 1)} salto(s){extra}", 0.35 if same_site else 0.2)
    field = "static" if (a.get("httpOnly") or b.get("httpOnly")) else "text"
    sim = similarity(a.get(field, ""), b.get(field, ""))
    if sim < floor:
        add("text", "Texto principal", f"similaridade de {round(sim * 100)}%", 0.9 if sim < 0.5 else 0.7 if sim < 0.68 else 0.35)
    if (a.get("title") or "").strip().lower() != (b.get("title") or "").strip().lower():
        add("title", "Título", f"«{(a.get('title') or '—')[:60]}» → «{(b.get('title') or '—')[:60]}»", 0.25 if sim >= 0.85 else 0.2)
    h1a, h1b = (a.get("dom") or {}).get("h1", ""), (b.get("dom") or {}).get("h1", "")
    if h1a and h1b and h1a.lower() != h1b.lower() and sim < 0.9:
        add("h1", "Título principal da página (H1)", f"«{h1a[:60]}» → «{h1b[:60]}»", 0.2)
    ca, cb = set(_set(a, "cta")), set(_set(b, "cta"))
    if (ca or cb) and jaccard(ca, cb) < 0.5:
        only_b = sorted(cb - ca)[:3]
        add("cta", "Botões de ação (CTA)", ("só nesta versão: " + ", ".join(f"«{x}»" for x in only_b)) if only_b else "somem os botões da referência", 0.4)
    ia, ib = _set(a, "images"), _set(b, "images")
    if (ia or ib) and jaccard(ia, ib) < 0.4:
        add("images", "Imagens", f"{len(ia)} → {len(ib)} (poucas em comum)", 0.3)
    va, vb = _set(a, "videos"), _set(b, "videos")
    if bool(va) != bool(vb):
        add("videos", "Vídeos", f"{len(va)} → {len(vb)}", 0.35)
    sa, sb = _set(a, "scripts"), _set(b, "scripts")
    if (sa or sb) and jaccard(sa, sb) < 0.6:
        add("scripts", "Scripts externos", f"{len(set(sb) - set(sa))} só nesta versão, {len(set(sa) - set(sb))} só na referência", 0.15)
    la, lb = _set(a, "links"), _set(b, "links")
    if (la or lb) and jaccard(la, lb) < 0.5:
        add("links", "Links", f"{len(set(lb) - set(la))} novos, {len(set(la) - set(lb))} a menos", 0.25)
    for k, lab in (("all", "Elementos na página"), ("img", "Quantidade de imagens"), ("form", "Formulários")):
        na, nb = _count(a, k), _count(b, k)
        if max(na, nb) >= 5 and abs(na - nb) / max(na, nb, 1) > 0.5:
            add("elements", lab, f"{na} → {nb}", 0.12)
    if any(f.get("big") for f in _set(b, "frames")) and not any(f.get("big") for f in _set(a, "frames")):
        add("iframe", "Iframe de tela cheia", "a página é só uma moldura que mostra outro endereço", 0.6)
    if (b.get("dom") or {}).get("metaRefresh") and not (a.get("dom") or {}).get("metaRefresh"):
        add("meta", "Meta refresh", "troca de página automática por meta refresh", 0.4)
    if b.get("jsRedirect") and not a.get("jsRedirect"):
        add("jsredirect", "Redirecionamento por JavaScript", "o script manda para outro endereço depois que a página abre", 0.4)
    ha_, hb_ = a.get("headers") or {}, b.get("headers") or {}
    for h in ("x-robots-tag", "content-language", "refresh"):
        if ha_.get(h) != hb_.get(h) and (ha_.get(h) or hb_.get(h)):
            add("headers", f"Cabeçalho {h}", f"{ha_.get(h, '—')} → {hb_.get(h, '—')}", 0.15)
    new_cookies = set(b.get("cookies") or []) - set(a.get("cookies") or [])
    if new_cookies:
        add("cookies", "Cookies definidos", "só nesta versão: " + ", ".join(sorted(new_cookies)[:4]), 0.1)
    if (b.get("dom") or {}).get("sw", 0) and not (a.get("dom") or {}).get("sw", 0):
        add("sw", "Service Worker", "só esta versão registra um service worker", 0.2)
    core = max([c["w"] for c in ch if c["kind"] in CORE_KINDS] or [0])
    rest = sorted([c["w"] for c in ch if c["kind"] not in CORE_KINDS], reverse=True)
    sig = min(1.0, core + 0.5 * sum(rest[:3]) * (0.5 if core == 0 else 1.0))
    if core == 0:
        sig = min(sig, 0.34)                                   # nothing about the page itself changed: only small, incidental differences
    return {"sig": round(sig, 2), "changes": [{k: v for k, v in c.items() if k != "w"} for c in ch], "same": sig < 0.35, "sameSite": same_site, "blocked": is_blocked(b), "sim": round(sim, 2), "failed": False}


def late_change(r: dict) -> Optional[dict]:
    """A page that shows one thing and, a few seconds later, something else (the safe page first, the offer after the check)."""
    e, f = r.get("textEarly", ""), r.get("text", "")
    if len(words(e)) >= 12 and len(words(f)) >= 8 and containment(e, f) < 0.4:
        return {"early": e[:240], "final": f[:240], "kept": round(containment(e, f), 2)}
    return None


def stability(rows: list[dict]) -> float:
    """How much independent visits of the same kind disagree with each other (0 = identical, 1 = unrelated)."""
    ok = [r for r in rows if r.get("ok") and not is_blocked(r)]
    if len(ok) < 2:
        return 0.0
    return round(max(diff(ok[0], r)["sig"] for r in ok[1:]), 2)


CAUSES = {
    "device": "Sites responsivos entregam versões diferentes para celular, tablet e computador; isso é normal.",
    "browser": "Alguns sites adaptam o layout ao navegador; isso costuma ser normal.",
    "lang": "Sites multilíngues traduzem o conteúdo conforme o idioma do navegador; isso é personalização legítima.",
    "tz": "Fuso horário raramente muda uma página; pode ser horário comercial ou promoção por horário.",
    "crawler": "Firewalls e CDNs (Cloudflare etc.) barram robôs por segurança; isso não é, por si só, cloaking.",
    "social": "Robôs de redes sociais costumam receber uma versão leve da página (para a pré-visualização do link).",
    "referer": "Páginas de campanha podem personalizar o conteúdo pela origem do clique; só vira cloaking quando a oferta ou o destino muda para esconder algo.",
    "params": "Parâmetros de anúncio podem ativar bônus ou rastreamento; só é suspeito se a página principal mudar.",
    "inapp": "Navegadores dentro de aplicativos têm limitações e alguns sites os tratam à parte.",
    "real": "A combinação celular + aplicativo + origem + parâmetros é exatamente o que um filtro de anúncios procura.",
    "region": "Sites podem mudar moeda e idioma pela região; aqui a região é só simulada por cabeçalhos.",
    "session": "Avisos de cookies, pop-ups de primeira visita e páginas de boas-vindas mudam entre a 1ª e a 2ª visita sem ser cloaking.",
}


def _vs_phone(r: dict, dd: dict, phones: list[dict], floor: float) -> dict:
    """A phone visitor is judged against a plain phone as well as against the desktop reference: the page it gets only counts as
    different when it differs from BOTH (a mobile layout is the device, not a filter)."""
    if not r.get("mobile") or not r.get("ok"):
        return dd
    best = dd
    for ph in phones:
        if ph is r:
            continue
        x = diff(ph, r, floor)
        if not x.get("failed") and x["sig"] < best["sig"]:
            best = {**x, "viaPhone": True}
    return best


def analyze(results: list[dict], url: str) -> dict:
    by = {r["id"]: r for r in results}
    base_rows = [by[i] for i in ("base#1", "base#2", "base#3") if i in by]
    ok_all = [r for r in results if r.get("ok")]
    n_ok = len(ok_all)
    reference = next((r for r in base_rows if r.get("ok") and not is_blocked(r)), None)
    if reference is None or n_ok < max(6, len(results) // 3):
        return {"status": "gray", "confidence": None, "headline": "Não foi possível determinar",
                "explanation": "O visitante comum não conseguiu abrir a página (ou quase nenhum teste funcionou), então não há referência para comparar. O site pode estar fora do ar, barrando este servidor ou exigindo verificação.",
                "counts": {"scenarios": len(results), "ok": n_ok, "failed": len(results) - n_ok, "different": 0, "groups": len({r["group"] for r in results})}, "scenarios": [_public_sc(r, None, "—") for r in results], "findings": [], "evidence": [], "alternatives": [],
                "versions": [], "matrix": _matrix(results), "pair": None, "consistency": {}, "tech": [], "tells": [], "paramsKept": {}, "rotation": False, "redirects": {"divergent": False, "roads": []}, "late": [],
                "infra": {}, "caveat": _caveat(), "clonePersona": None, "cloneUrl": None, "reference": None, "noise": 0}

    noise = stability(base_rows)
    floor = min(0.78, max(0.5, 1 - noise - 0.05)) if noise < 0.34 else 0.5
    d: dict[str, dict] = {r["id"]: diff(reference, r, floor) for r in results if r is not reference}
    phones = [by[i] for i in ("mobile_android", "mobile_ios") if i in by and by[i].get("ok") and not is_blocked(by[i])]
    for r in results:
        r["late"] = late_change(r) if r.get("ok") else None

    # versions: pages that are the same page get the same letter (the reference is A)
    letters: dict[str, str] = {reference["id"]: "A"}
    reps: list[tuple[str, dict]] = [("A", reference)]
    for r in results:
        if r["id"] in letters or not r.get("ok"):
            continue
        if is_blocked(r) and r.get("status", 0) >= 400:
            letters[r["id"]] = "—"
            continue
        for L, rep in reps:
            if diff(rep, r, floor)["sig"] < 0.35:
                letters[r["id"]] = L
                break
        else:
            L = chr(ord("A") + len(reps))
            reps.append((L, r))
            letters[r["id"]] = L
    for r in results:
        letters.setdefault(r["id"], "—")

    # the findings: which CONDITION changes the page, and is it the deliberate kind
    findings: list[dict] = []
    for g in GROUPS:
        if g in ("baseline", "session"):                       # the session group is judged against the same visitor's own first visit, below
            continue
        rows = [r for r in results if r["group"] == g and r["id"] in d]
        diffs = [(r, d[r["id"]]) for r in rows if not d[r["id"]].get("failed")]
        if g in DELIBERATE:                                     # a phone is compared with a plain phone too: a phone layout is not a filter
            diffs = [(r, _vs_phone(r, dd, phones, floor)) for r, dd in diffs]
        diffs = [(r, dd) for r, dd in diffs if not dd["blocked"]]   # a refusal (firewall, error page) says nothing about a different page
        if not diffs:
            continue
        worst_r, worst_d = max(diffs, key=lambda x: x[1]["sig"])
        late = [r for r in rows if r.get("late") and not is_blocked(r)]
        sig = worst_d["sig"]
        kind = "deliberate" if g in DELIBERATE else "adaptive"
        explained = None
        if g in ADAPTIVE and worst_d["sameSite"] and worst_d.get("sim", 0) >= 0.3 and not any(c["kind"] in ("iframe", "jsredirect", "meta") for c in worst_d["changes"]):
            explained = "versão adaptada ao " + {"device": "aparelho", "browser": "navegador", "lang": "idioma", "tz": "fuso horário"}[g] + " (mesmo site e mesma mensagem)"
            sig = min(sig, 0.3)
        if g == "crawler" and not explained and worst_r["id"] == "plain_http" and not any(dd["sig"] >= 0.35 for r, dd in diffs if r["id"] != "plain_http"):
            # only the program without a browser gets another page, the real robots get the same one: cookies, scripts or language negotiation
            explained = "só o programa sem navegador recebe outra página; os robôs de busca recebem a mesma que o visitante comum"
            sig = min(sig, 0.3)
        lat = late[0]["late"] if late else None
        if lat and sig < 0.6:
            sig = 0.6
        if sig < 0.35 and not lat:
            continue
        agree = [r for r, dd in diffs if dd["sig"] >= 0.55]
        reproducible = len(agree) >= 2 or g not in ("real", "session")
        ev = [f"{c['label']}: {c['detail']}" for c in worst_d["changes"][:6]]
        if worst_d.get("viaPhone"):
            ev.insert(0, "Comparado com um celular comum (sem anúncio e sem aplicativo), não só com o computador.")
        if lat:
            ev.append(f"o conteúdo trocou depois de carregar: só {round(lat['kept'] * 100)}% do que apareceu primeiro continua na página")
        findings.append({
            "group": g, "groupLabel": GROUPS[g], "kind": "adaptive" if explained else kind, "condition": worst_r["label"], "scenario": worst_r["id"], "version": letters.get(worst_r["id"], "—"),
            "sig": round(sig, 2), "explained": explained, "reproducible": reproducible, "evidence": ev, "scenarios": [r["id"] for r, dd in diffs if dd["sig"] >= 0.35] or [r["id"] for r in late],
            "changes": worst_d["changes"], "alternatives": [CAUSES[g]], "late": lat, "domainDiffers": any(c["kind"] == "url" and "outro site" in c["detail"] for c in worst_d["changes"]),
        })
    # the same visitor coming back: each later visit against that visitor's OWN first visit (a "first time here" filter), and an ordinary
    # visitor's second visit against the reference
    seq = [by[i] for i in ("seq1", "seq2", "seq3", "seq4") if i in by and by[i].get("ok")]
    cands: list[tuple[dict, dict]] = []
    if len(seq) >= 2:
        cands += [(r, diff(seq[0], r, floor)) for r in seq[1:]]
    if by.get("base_2nd") and by["base_2nd"].get("ok"):
        cands.append((by["base_2nd"], diff(reference, by["base_2nd"], floor)))
    cands = [(r, dd) for r, dd in cands if not dd.get("failed")]
    if cands:
        r, dd = max(cands, key=lambda x: x[1]["sig"])
        agreeing = len([1 for _, x in cands if x["sig"] >= 0.55])
        core = any(c["kind"] in ("url", "iframe", "meta", "jsredirect", "status") for c in dd["changes"])
        if dd["sig"] >= 0.55 and not dd["blocked"] and (agreeing >= 2 or (dd["sig"] >= 0.85 and core)):
            findings.append({"group": "session", "groupLabel": GROUPS["session"], "kind": "deliberate", "condition": f"{r['label']} (diferente da 1ª visita)", "scenario": r["id"], "version": letters.get(r["id"], "—"), "sig": dd["sig"], "explained": None,
                             "reproducible": len([1 for _, x in cands if x["sig"] >= 0.55]) >= 2, "evidence": [f"{c['label']}: {c['detail']}" for c in dd["changes"][:5]], "scenarios": [r["id"] for r, x in cands if x["sig"] >= 0.55],
                             "changes": dd["changes"], "alternatives": [CAUSES["session"]], "late": None, "domainDiffers": any("outro site" in c["detail"] for c in dd["changes"])})
    # a repeat visit of the ordinary visitor against its first one (cookie banners are normal: only a change of the page itself counts)
    # consistency: the same condition asked several times
    real_rows = [by[i] for i in ("ig_ios", "ig_ios#2", "seq1", "seq4") if i in by]
    stab_real = stability(real_rows)
    rotation = stab_real >= 0.55 and noise < 0.34
    consistency = {"baseline": {"samples": len([r for r in base_rows if r.get("ok")]), "maxDifference": noise, "stable": noise < 0.34},
                   "realVisitor": {"samples": len([r for r in real_rows if r.get("ok")]), "maxDifference": stab_real, "stable": stab_real < 0.34}}

    deliberate = [f for f in findings if f["kind"] == "deliberate" and f["sig"] >= 0.55]
    strong = [f for f in deliberate if f["sig"] >= 0.8]
    tech: dict[str, dict] = {}
    tells: set = set()
    for r in results:
        found = scan_markers(r.get("source", ""), " ".join(c["url"] for c in r.get("chain", [])) + " " + " ".join(r.get("cookies", [])))
        for t in found["tech"]:
            tech[t["name"]] = t
        tells.update(found["tells"])
    robots_blocked = [r for r in results if r["group"] in ("crawler", "social") and r.get("ok") and is_blocked(r)]

    if deliberate and (strong or len(deliberate) >= 2) and noise < 0.34:
        status, headline = "red", "Cloaking altamente provável"
        conf = 72 + min(15, 5 * (len(deliberate) - 1)) + (8 if any(f["domainDiffers"] for f in deliberate) else 0) + (4 if all(f["reproducible"] for f in deliberate) else 0)
        conf = min(97, conf - (12 if rotation else 0))
        explanation = "Encontramos diferenças relevantes entre a versão recebida por um visitante comum e a recebida quando a condição abaixo muda. Mudar só essa condição já muda a página, que é o comportamento de um filtro deliberado."
    elif deliberate or rotation or noise >= 0.34 or any(f["late"] for f in findings):
        status = "yellow"
        top = max([f["sig"] for f in deliberate] or [0.5])
        conf = int(min(69, 35 + 25 * top + 4 * len(deliberate) + (6 if rotation else 0)))
        headline = "Possível cloaking detectado" if (deliberate or any(f["late"] for f in findings)) else "Comportamento suspeito"
        if rotation:
            explanation = "A mesma condição recebeu páginas diferentes em momentos diferentes. Pode ser um teste A/B, cache ou rotação de ofertas; também é como alguns cloakers distribuem o tráfego."
        elif noise >= 0.34:
            explanation = "Até o visitante comum recebe páginas diferentes entre uma visita e outra, então as diferenças entre cenários são pouco confiáveis."
        else:
            explanation = "Há uma diferença que parece intencional, mas ela apareceu em poucos testes ou não pôde ser confirmada. Veja as evidências e as causas alternativas."
    else:
        status, headline = "green", "Nenhum sinal de cloaking"
        coverage = n_ok / max(1, len(results))
        conf = int(min(92, 62 + 22 * coverage + (6 if noise < 0.2 else 0) - (8 if tech else 0) - (6 if tells else 0)))
        explanation = ("Nos testes feitos a partir daqui, mudar o aparelho, o navegador, o idioma, a origem do clique, os parâmetros do anúncio, a identidade de robô ou o histórico do visitante não mudou a página de forma relevante."
                       + (" O site barra alguns robôs, o que é comum em sites com firewall e não indica cloaking." if robots_blocked else ""))
    evidence: list[str] = []
    for f in sorted(findings, key=lambda x: -x["sig"]):
        if f["kind"] == "deliberate" and f["sig"] >= 0.55:
            evidence.append(f"{f['groupLabel']}: «{f['condition']}» recebe a versão {f['version']} (a referência é A). " + "; ".join(f["evidence"][:3]))
        elif f.get("explained"):
            evidence.append(f"{f['groupLabel']}: diferença explicada ({f['explained']}).")
    if rotation:
        evidence.append("Teste de consistência: visitas independentes do mesmo visitante de anúncio receberam páginas diferentes entre si.")
    if tech:
        evidence.append("Ferramentas de roteamento encontradas: " + ", ".join(sorted(tech)) + " (por si só isso não prova nada).")
    if robots_blocked and status == "green":
        evidence.append("O site barrou: " + ", ".join(r["label"] for r in robots_blocked[:4]) + ".")
    alts: list[str] = []
    for f in findings:
        if f["kind"] == "deliberate" and f["sig"] >= 0.35:
            alts += f["alternatives"]
    if rotation or noise >= 0.34:
        alts.append("Cache, teste A/B, anúncios ou blocos que mudam sozinhos podem explicar variações entre visitas.")
    alts = list(dict.fromkeys(alts))

    top_f = max(deliberate or findings, key=lambda f: f["sig"]) if (deliberate or findings) else None
    pair = {"a": reference["id"], "b": top_f["scenario"] if top_f else None}
    versions = []
    for L, rep in reps:
        versions.append({"letter": L, "probes": [i for i, l in letters.items() if l == L], "rep": rep["id"], "finalUrl": shown_url(rep), "title": rep.get("title", ""), "shot": rep.get("shot"), "text": (rep.get("text") or "")[:400]})

    real_ok = [r for r in results if r["group"] == "real" and r.get("ok") and not is_blocked(r)]
    real_ver = max(({letters[r["id"]] for r in real_ok} or {"A"}), key=lambda L: sum(1 for r in real_ok if letters[r["id"]] == L))
    clone_persona = next((pid for pid in P.CLONE_PERSONAS if pid in by and by[pid].get("ok") and letters.get(pid) == real_ver), None)
    real_rep = next((rep for L, rep in reps if L == real_ver), None)

    params: dict = {}
    probe = by.get("ig_ios")
    if probe and probe.get("ok"):
        sent = P.PERSONAS["ig_ios"].get("params") or {}
        hay = probe.get("finalUrl", "") + "\n" + "\n".join((probe.get("dom") or {}).get("all_links") or [])
        for k in sent:
            params[k] = {"inFinalUrl": k in dict(parse_qsl(urlsplit(probe["finalUrl"]).query)), "inLinks": f"{k}=" in hay}

    roads: dict[str, list[str]] = {}
    for r in results:
        if r.get("ok") and r.get("chain"):
            roads.setdefault(" → ".join(["início"] + [(c["via"] if c["via"] != "http" else f"{host_of(c['url'])} ({c['status']})") for c in r["chain"]]), []).append(r["id"])
    redirects = {"divergent": len(roads) > 1, "roads": [{"road": k, "scenarios": v} for k, v in sorted(roads.items(), key=lambda kv: -len(kv[1]))[:6]]}

    cdn = next((name for r in ok_all for hk, name in CDN_HEADERS if hk in (r.get("headers") or {})), None)
    ips: list[str] = []
    try:
        ips = sorted({i[4][0] for i in socket.getaddrinfo(urlsplit(url).hostname, None, type=socket.SOCK_STREAM)})[:6]
    except Exception:
        pass
    counts = {"scenarios": len(results), "ok": n_ok, "failed": len(results) - n_ok, "different": sum(1 for r in results if r["id"] in d and not d[r["id"]].get("failed") and not d[r["id"]]["same"]), "groups": len({r["group"] for r in results})}
    return {
        "status": status, "confidence": conf, "headline": headline, "explanation": explanation, "counts": counts,
        "scenarios": [_public_sc(r, d.get(r["id"]), letters.get(r["id"])) for r in results], "findings": sorted(findings, key=lambda f: -f["sig"]),
        "evidence": evidence, "alternatives": alts, "versions": versions, "matrix": _matrix(results), "pair": pair, "consistency": consistency, "noise": noise,
        "tech": list(tech.values()), "tells": sorted(tells), "paramsKept": params, "rotation": rotation, "redirects": redirects, "late": [{"scenario": r["id"], **r["late"]} for r in results if r.get("late")],
        "infra": {"ips": ips, "cdn": cdn, "serviceWorkers": any((r.get("dom") or {}).get("sw") for r in ok_all)},
        "caveat": _caveat() if status != "red" else None, "clonePersona": clone_persona if status in ("red", "yellow") else None,
        "cloneUrl": shown_url(real_rep) if real_rep and status in ("red", "yellow") else None, "reference": reference["id"],
    }


def _caveat() -> str:
    return ("Este teste sai de um servidor em data center. Um cloaker que decide pelo país ou pela operadora (IP) sempre nos vê como 'não é cliente', e a região aqui é só simulada por cabeçalhos. "
            + ("Há um proxy configurado: o resultado vale para aquela rede." if settings.PROXY_URL else "Para testar de verdade, configure um proxy brasileiro residencial ou 4G (PROXY_URL)."))


_SENT = {s["id"]: s["params"] for s in scenarios()}


def shown_url(r: dict) -> str:
    """The address as the visitor landed on it, minus the tracking parameters this check made up (they would only be noise)."""
    from urllib.parse import urlencode, urlunsplit
    u = r.get("finalUrl", "")
    sent = _SENT.get(r.get("id", ""), {})
    p = urlsplit(u)
    keep = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if sent.get(k) != v]
    return urlunsplit((p.scheme, p.netloc, p.path, urlencode(keep), p.fragment))


def _matrix(results: list[dict]) -> list[dict]:
    out = []
    for g, label in GROUPS.items():
        rows = [r for r in results if r["group"] == g]
        if rows:
            out.append({"group": g, "label": label, "tested": len(rows), "ok": sum(1 for r in rows if r.get("ok"))})
    return out


def _public_sc(r: dict, dd: Optional[dict], letter: Optional[str] = None) -> dict:
    return {"id": r["id"], "label": r["label"], "group": r["group"], "groupLabel": GROUPS.get(r["group"], r["group"]), "ok": r.get("ok", False), "status": r.get("status"), "version": letter or "—",
            "finalUrl": shown_url(r) if r.get("finalUrl") else "", "title": r.get("title", ""), "blocked": is_blocked(r) if r.get("ok") else False, "error": r.get("error"), "changes": (dd or {}).get("changes", []),
            "sig": (dd or {}).get("sig", 0), "same": (dd or {}).get("same", True), "chain": r.get("chain", []), "ms": r.get("ms"), "bot": r.get("bot"), "mobile": r.get("mobile"), "how": r.get("changes", "")}


# ═══════════ jobs ═══════════
JOBS: dict[str, dict] = {}
_sem = asyncio.Semaphore(1)


def _clean_old() -> None:
    cut = time.time() - 3600
    for k in [k for k, v in JOBS.items() if v["createdAt"] < cut]:
        JOBS.pop(k, None)


def start(url: str) -> str:
    _clean_old()
    jid = uuid.uuid4().hex[:16]
    JOBS[jid] = {"id": jid, "url": url, "status": "queued", "done": 0, "total": len(scenarios()) + len(SEQ_LABELS), "probes": [], "createdAt": time.time()}
    asyncio.create_task(_run(jid))
    return jid


def public(job: dict, brief: bool = False) -> dict:
    """What the browser gets. While running: only the progress. When done: the analysis plus, per scenario, what the side-by-side view needs."""
    out = {k: v for k, v in job.items() if k not in ("probes",)}
    if brief or job["status"] in ("queued", "running"):
        out["probes"] = [{"id": r["id"], "label": r["label"], "group": r["group"], "ok": r.get("ok", False)} for r in job["probes"]]
        out.pop("analysis", None)
        return out
    probes = []
    for r in job["probes"]:
        dom = r.get("dom") or {}
        probes.append({"id": r["id"], "label": r["label"], "group": r["group"], "ok": r.get("ok", False), "status": r.get("status"), "finalUrl": shown_url(r) if r.get("finalUrl") else "", "title": r.get("title", ""),
                       "text": (r.get("text") or "")[:4000], "shot": r.get("shot"), "chain": r.get("chain", []), "headers": {k: v for k, v in (r.get("headers") or {}).items() if k in KEEP_HEADERS},
                       "cookies": r.get("cookies", []), "late": r.get("late"),
                       "dom": {"n": dom.get("n", {}), "scripts": dom.get("scripts", [])[:40], "images": dom.get("images", [])[:30], "videos": dom.get("videos", []), "links": dom.get("links", [])[:50], "cta": dom.get("cta", []), "frames": dom.get("frames", []), "h1": dom.get("h1", ""), "sw": dom.get("sw", 0)}})
    out["probes"] = probes
    return out


async def _run(jid: str) -> None:
    from playwright.async_api import async_playwright
    job = JOBS[jid]
    async with _sem:
        job["status"] = "running"
        try:
            if not await url_is_allowed(job["url"]):
                raise RuntimeError("Esse endereço não pode ser testado (precisa ser um site público, http ou https).")
            async with async_playwright() as pw:
                launch = {"headless": True, "args": ["--disable-blink-features=AutomationControlled"]}
                if settings.PROXY_URL:
                    launch["proxy"] = {"server": settings.PROXY_URL}
                browser = await pw.chromium.launch(**launch)
                try:
                    q: asyncio.Queue = asyncio.Queue()
                    q.put_nowait(("seq", None))
                    for sc in scenarios():
                        q.put_nowait(("one", sc))

                    async def worker():
                        while True:
                            try:
                                kind, sc = q.get_nowait()
                            except asyncio.QueueEmpty:
                                return
                            if kind == "seq":
                                for r in await run_sequence(browser, job["url"]):
                                    job["probes"].append(r)
                                    job["done"] += 1
                            else:
                                job["probes"].append(await run_scenario(browser, sc, job["url"]))
                                job["done"] += 1

                    await asyncio.gather(*[worker() for _ in range(4)])
                finally:
                    await _safe_close(browser)
            order = {s["id"]: i for i, s in enumerate(scenarios())}
            for i, sid in enumerate(SEQ_LABELS):
                order[sid] = 100 + i
            job["probes"].sort(key=lambda r: order.get(r["id"], 999))
            job["analysis"] = analyze(job["probes"], job["url"])
            job["status"] = "done"
        except Exception as e:
            logger.warning(f"cloaker job {jid} failed: {e!r}")
            job["status"] = "error"
            job["error"] = str(e)[:300] or "Não consegui testar esse endereço."
