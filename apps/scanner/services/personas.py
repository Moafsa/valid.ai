"""
Who is asking for a page.

Some sites answer differently depending on who opens them: a visitor who clicked an ad on Instagram gets the real page, while the
ad platform's reviewers, search robots and curious people get something else (a "clean" page). That is what a link cloaker does.
Seeing what a real visitor sees means asking the way a real visitor asks: the in-app browser of the app the link was clicked in,
the page the click came from (the referrer), the language and the time zone of the audience the ad targets, a phone-sized screen,
and a browser that does not announce itself as automation.

Nothing here opens anything that a person could not open: it is the same request a visitor makes, with the same identity details.
What it cannot change is the network address: a site that decides by the visitor's IP (country, data-center ranges) still sees
this server; a Brazilian residential or mobile proxy (PROXY_URL) is what answers that.
"""
from __future__ import annotations

import weakref
from typing import Optional

# ── identities ───────────────────────────────────────────────────────────────
IOS_VER = "17_4"
IG_IOS = (
    f"Mozilla/5.0 (iPhone; CPU iPhone OS {IOS_VER} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E219 "
    "Instagram 345.0.0.31.123 (iPhone15,3; iOS 17_4; pt_BR; pt-BR; scale=3.00; 1290x2796; 600986435)"
)
IG_ANDROID = (
    "Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 "
    "Chrome/125.0.6422.165 Mobile Safari/537.36 Instagram 345.0.0.34.108 Android (33/13; 480dpi; 1080x2340; samsung; SM-A546E; a54x; exynos1380; pt_BR; 606388439)"
)
FB_ANDROID = (
    "Mozilla/5.0 (Linux; Android 12; moto g(60) Build/S1SR32.38-79-3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 "
    "Chrome/125.0.6422.165 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0.0.45.108;]"
)
FB_IOS = (
    f"Mozilla/5.0 (iPhone; CPU iPhone OS {IOS_VER} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E219 "
    "[FBAN/FBIOS;FBAV/459.0.0.30.113;FBBV/589203312;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.4;FBSS/3;FBID/phone;FBLC/pt_BR;FBOP/5]"
)
TIKTOK_ANDROID = (
    "Mozilla/5.0 (Linux; Android 13; SM-A346E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 "
    "Chrome/125.0.6422.165 Mobile Safari/537.36 musical_ly_34.9.0 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly "
    "app_version/34.9.0 ByteLocale/pt-BR ByteFullLocale/pt-BR Region/BR"
)
CHROME_ANDROID = (
    "Mozilla/5.0 (Linux; Android 13; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
)
CHROME_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
FACEBOOK_BOT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
GOOGLE_BOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
GOOGLE_ADSBOT = "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 (compatible; AdsBot-Google-Mobile; +http://www.google.com/mobile/adsbot.html)"
TIKTOK_BOT = "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)"
PY_HTTP = "python-requests/2.31.0"

PHONE = {"width": 390, "height": 844}
PHONE_ANDROID = {"width": 412, "height": 915}
DESKTOP = {"width": 1366, "height": 768}

# the way a link in an ad is opened, per app: (ua, referrer, screen, phone?, the app's own header, parameters its links carry)
PERSONAS: dict[str, dict] = {
    "ig_ios": dict(label="Visitante vindo do Instagram (iPhone)", ua=IG_IOS, referer="https://l.instagram.com/", viewport=PHONE, mobile=True,
                   params={"utm_source": "ig", "utm_medium": "paid", "fbclid": "IwAR0kQz3vV2mJ5d8xYhLw9bN1cPqRtUoA7sGfE4nTzXiKjHy6MaDcB"}),
    "ig_android": dict(label="Visitante vindo do Instagram (Android)", ua=IG_ANDROID, referer="https://l.instagram.com/", viewport=PHONE_ANDROID, mobile=True,
                       headers={"X-Requested-With": "com.instagram.android"},
                       params={"utm_source": "ig", "utm_medium": "paid", "fbclid": "IwAR1pLm8wQ4eT7yUiOa5sDfGhJkLzXcVbNm2QwErTyUiOpAsDfGhJk"}),
    "fb_android": dict(label="Visitante vindo do Facebook (Android)", ua=FB_ANDROID, referer="https://l.facebook.com/", viewport=PHONE_ANDROID, mobile=True,
                       headers={"X-Requested-With": "com.facebook.katana"},
                       params={"utm_source": "fb", "utm_medium": "paid", "fbclid": "IwAR2xCvBnMqWeRtYuIoPaSdFgHjKlZxCvBnMqWeRtYuIoPaSdFgHjK"}),
    "fb_ios": dict(label="Visitante vindo do Facebook (iPhone)", ua=FB_IOS, referer="https://l.facebook.com/", viewport=PHONE, mobile=True,
                   params={"utm_source": "fb", "utm_medium": "paid", "fbclid": "IwAR3aSdFgHjKlQwErTyUiOpZxCvBnMmNbVcXzLkJhGfDsApOiUyTrEwQ"}),
    "tiktok": dict(label="Visitante vindo do TikTok (Android)", ua=TIKTOK_ANDROID, referer="https://www.tiktok.com/", viewport=PHONE_ANDROID, mobile=True,
                   headers={"X-Requested-With": "com.zhiliaoapp.musically"},
                   params={"utm_source": "tiktok", "utm_medium": "paid", "ttclid": "E.C.P.Zx1aQ2wS3eD4rF5tG6yH7uJ8iK9oL0pAbCdEfGhIjKlMnOp"}),
    "google_mobile": dict(label="Visitante vindo do Google (celular)", ua=CHROME_ANDROID, referer="https://www.google.com/", viewport=PHONE_ANDROID, mobile=True,
                          params={"utm_source": "google", "utm_medium": "cpc", "gclid": "Cj0KCQjwx4a1BhDOARIsAI8aMBhZxCvBnMqWeRtYuIoPaSdFgHjKl"}),
    "mobile_direct": dict(label="Visitante comum no celular (sem origem)", ua=CHROME_ANDROID, referer=None, viewport=PHONE_ANDROID, mobile=True, params={}),
    "desktop": dict(label="Visitante comum no computador (sem origem)", ua=CHROME_DESKTOP, referer=None, viewport=DESKTOP, mobile=False, params={}),
    "bot_facebook": dict(label="Robô do Facebook (revisão de anúncios)", ua=FACEBOOK_BOT, referer=None, viewport=DESKTOP, mobile=False, params={}, bot=True),
    "bot_google": dict(label="Robô do Google Ads", ua=GOOGLE_ADSBOT, referer=None, viewport=PHONE_ANDROID, mobile=True, params={}, bot=True),
    "bot_tiktok": dict(label="Robô do TikTok", ua=TIKTOK_BOT, referer=None, viewport=PHONE_ANDROID, mobile=True, params={}, bot=True),
    "plain_http": dict(label="Acesso de programa (sem navegador)", ua=PY_HTTP, referer=None, viewport=DESKTOP, mobile=False, params={}, bot=True, http_only=True),
}

# which ones the cloner can use to fetch the REAL page (the visitor identities, never the robots)
CLONE_PERSONAS = ("ig_ios", "ig_android", "fb_android", "fb_ios", "tiktok", "google_mobile")

# Chrome in automation says so (navigator.webdriver, no plugins, an empty languages list): a script that checks is told the truth
# by a browser that is only a browser.
STEALTH_JS = """
(() => {
  try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch (e) {}
  try { if (!window.chrome) window.chrome = { runtime: {} }; } catch (e) {}
  try { Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] }); } catch (e) {}
  try {
    if (!navigator.plugins || navigator.plugins.length === 0)
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  } catch (e) {}
  try {
    const q = window.navigator.permissions && window.navigator.permissions.query;
    if (q) window.navigator.permissions.query = (p) => (p && p.name === 'notifications' ? Promise.resolve({ state: Notification.permission }) : q.call(window.navigator.permissions, p));
  } catch (e) {}
})();
"""

_by_context: "weakref.WeakKeyDictionary" = weakref.WeakKeyDictionary()
_patched = False


def with_params(url: str, params: dict) -> str:
    """The link as the ad's click would carry it: the page's own address plus the parameters the platform adds."""
    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
    if not params:
        return url
    p = urlsplit(url)
    q = dict(parse_qsl(p.query, keep_blank_values=True))
    for k, v in params.items():
        q.setdefault(k, v)
    return urlunsplit((p.scheme, p.netloc, p.path, urlencode(q), p.fragment))


def _patch_goto() -> None:
    """Page.goto learns to send the referrer of the persona it belongs to (the click that brought the visitor here)."""
    global _patched
    if _patched:
        return
    from playwright.async_api import Page
    original = Page.goto

    async def goto(self, url, **kw):
        persona = _by_context.get(self.context)
        if persona and persona.get("referer") and "referer" not in kw and str(url).startswith("http"):
            kw["referer"] = persona["referer"]
        return await original(self, url, **kw)

    Page.goto = goto  # type: ignore[method-assign]
    _patched = True


def persona_by_id(pid: Optional[str]) -> Optional[dict]:
    if not pid or pid not in PERSONAS:
        return None
    return {"id": pid, **PERSONAS[pid]}


async def open_context(browser, persona: dict, _new=None, **kw):
    """A browser context that speaks as `persona` (identity, language, screen, referrer, no automation tells)."""
    _patch_goto()
    new_context = _new or browser.new_context
    kw["user_agent"] = persona["ua"]
    kw.setdefault("locale", "pt-BR")
    kw.setdefault("timezone_id", "America/Sao_Paulo")
    if persona.get("mobile"):
        kw["is_mobile"] = True
        kw["has_touch"] = True
        kw.setdefault("device_scale_factor", 3 if "iPhone" in persona["ua"] else 2.625)
    if not kw.get("viewport"):
        kw["viewport"] = dict(persona["viewport"])               # the persona's screen, unless a probe asked for a width on purpose
    headers = {"Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"}
    headers.update(persona.get("headers") or {})
    headers.update(kw.get("extra_http_headers") or {})
    kw["extra_http_headers"] = headers
    ctx = await new_context(**kw)
    _by_context[ctx] = persona
    if not persona.get("bot"):
        await ctx.add_init_script(STEALTH_JS)
    return ctx


def install(browser, persona: dict) -> None:
    """Every browser context opened from now on from this browser speaks as `persona`."""
    original = browser.new_context

    async def new_context(*a, **kw):
        return await open_context(browser, persona, original, **kw)

    browser.new_context = new_context
