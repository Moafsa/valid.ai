"""
The automatic review a finished clone goes through, the way a person would do it: open the original and
the clone side by side, on a computer and on a phone, and see whether they agree.

It looks at what a visitor would notice:
  - is the text all there (words of the original that the clone lost)?
  - does the clone get wider than the phone's screen (sideways scrolling) when the original does not?
  - do pictures and videos show up, at the size the original had them?
  - is the first screen visibly the same picture?
  - how much lighter is the clone, and does it still lean on the original's servers?

The result is a short list in plain Portuguese, shown on the project page. It never changes the clone:
a review that "fixes" things on its own would hide what the capture got wrong.
"""
import asyncio
import re
from typing import Optional
from urllib.parse import urlparse

from loguru import logger

from services import geometry_review

DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
PHONE_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"

AUTOSCROLL_JS = r"""
async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let y = 0, n = 0;
  while (n++ < 45) {
    const h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    if (y >= h || y > 22000) break;
    window.scrollTo(0, y); y += Math.round(innerHeight * 0.8);
    await sleep(90);
  }
  window.scrollTo(0, 0);
  await sleep(700);
}
"""

METRICS_JS = r"""
() => {
  const de = document.documentElement, b = document.body;
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const text = (b.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const imgs = [...document.images].filter(vis);
  const broken = imgs.filter(i => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src));
  const media = [...document.querySelectorAll('video,iframe,[data-vai-player]')].map(el => { const r = el.getBoundingClientRect(); return { tag: el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height), src: (el.currentSrc || el.src || '').slice(0, 80) }; }).filter(m => m.w > 120 && m.h > 70 && !/recaptcha|googletagmanager|facebook\.com\/tr/.test(m.src));
  return {
    docH: Math.max(de.scrollHeight, b.scrollHeight), docW: Math.max(de.scrollWidth, b.scrollWidth), clientW: de.clientWidth,
    words: [...new Set(text.match(/[a-zà-ÿ0-9]{3,}/g) || [])].slice(0, 4000),
    imgs: imgs.length, broken: broken.length, media,
  };
}
"""


async def _load(browser, url: str, width: int, height: int, mobile: bool, shot: Optional[str] = None, html: Optional[str] = None) -> dict:
    ctx = await browser.new_context(
        viewport={"width": width, "height": height}, is_mobile=mobile, has_touch=mobile,
        user_agent=PHONE_UA if mobile else DESKTOP_UA, locale="pt-BR", timezone_id="America/Sao_Paulo",
    )
    if html is not None:
        # the clone has not been delivered yet: the page is the document the web app built for it, answered at a made-up
        # address of the web app's own host (so /vai-runtime.js and the like load for real)
        async def answer(route):
            await route.fulfill(status=200, content_type="text/html; charset=utf-8", body=html)
        await ctx.route(url, answer)
    page = await ctx.new_page()
    reqs: dict = {}
    page.on("request", lambda r: reqs.__setitem__(r.url, 0))
    res: dict = {"ok": False, "hosts": {}}
    try:
        try:
            await page.goto(url, wait_until="load", timeout=40000)
        except Exception as e:
            res["gotoError"] = str(e)[:80]
        try:
            await page.wait_for_load_state("networkidle", timeout=3000)
        except Exception:
            pass
        try:
            await asyncio.wait_for(page.evaluate(AUTOSCROLL_JS), 30)
        except Exception:
            pass
        res.update(await page.evaluate(METRICS_JS))
        try:
            res["geo"] = await geometry_review.measure_loaded(page, width, with_menu=width <= 900)
        except Exception:
            res["geo"] = {"ok": False}
        if shot:
            try:
                res["png"] = await page.screenshot(timeout=15000)
            except Exception:
                pass
        hosts: dict = {}
        for u in reqs:
            try:
                h = urlparse(u).netloc
            except Exception:
                continue
            hosts[h] = hosts.get(h, 0) + 1
        res["hosts"] = hosts
        res["ok"] = True
    except Exception as e:
        res["error"] = str(e)[:120]
    finally:
        await ctx.close()
    return res


def _tile_diff(a: bytes, b: bytes) -> Optional[float]:
    """Share (0-100) of the first screen's pixels that visibly differ."""
    try:
        import io
        from PIL import Image, ImageChops
        ia, ib = Image.open(io.BytesIO(a)).convert("RGB"), Image.open(io.BytesIO(b)).convert("RGB")
        if ia.size != ib.size:
            ib = ib.resize(ia.size)
        hist = ImageChops.difference(ia, ib).convert("L").histogram()
        return round(sum(hist[25:]) / (ia.width * ia.height) * 100, 1)
    except Exception:
        return None


def _root(host: str) -> str:
    return ".".join(host.lower().removeprefix("www.").split(".")[-2:])


_BLOCK_WORDS = {"verificação", "segurança", "cloudflare", "captcha", "robô", "robot", "blocked", "denied", "checking", "browser", "challenge", "navegador", "human", "humano", "verifying", "ray"}


def _blocked(o: dict) -> bool:
    """The original answered with a bot-check page: nothing to compare against."""
    w = o.get("words") or []
    return len(w) < 140 and len(_BLOCK_WORDS & set(w)) >= 2


def _judge(o: dict, c: dict, width: int, label: str, origin_host: str, diff: Optional[float], baseline: Optional[dict] = None) -> tuple[list, dict]:
    items: list = []
    m: dict = {"width": width}
    if not o.get("ok") or not c.get("ok"):
        return items, m
    if _blocked(o):
        items.append({"status": "info", "title": f"No {label}, o site original bloqueou a conferência", "detail": "Ele mostrou uma tela de verificação de robô, então não deu pra comparar essa tela."})
        m["blocked"] = True
        return items, m
    wo, wc = set(o["words"]), set(c["words"])
    recall = len(wo & wc) / max(1, len(wo))
    m["recall"] = round(recall, 3)
    lost = [w for w in o["words"] if w not in wc][:6]
    if len(wo) >= 25:
        if recall < 0.85:
            items.append({"status": "bad", "title": f"No {label}, faltou texto", "detail": f"Só {round(recall * 100)}% das palavras do original aparecem no clone (ex.: {', '.join(lost[:4])})."})
        elif recall < 0.95:
            items.append({"status": "warn", "title": f"No {label}, faltaram algumas palavras", "detail": f"{round(recall * 100)}% do texto bate (ex.: {', '.join(lost[:4])})."})
    over_c = c["docW"] > c["clientW"] + 2
    over_o = o["docW"] > o["clientW"] + 2
    m["overflow"] = bool(over_c and not over_o)
    if over_c and not over_o and width < 600:
        items.append({"status": "bad", "title": "No celular, a página fica mais larga que a tela", "detail": f"Sobram {c['docW'] - c['clientW']} px pro lado: a pessoa teria que arrastar a tela de lado."})
    ratio = c["docH"] / max(1, o["docH"])
    m["height"] = round(ratio, 2)
    if ratio < 0.8 or ratio > 1.25:
        items.append({"status": "warn", "title": f"No {label}, o tamanho da página difere", "detail": f"O clone ficou {round(abs(ratio - 1) * 100)}% {'mais comprido' if ratio > 1 else 'mais curto'} que o original."})
    if c["broken"] > o["broken"] + 1:
        items.append({"status": "warn", "title": f"No {label}, {c['broken'] - o['broken']} imagens não carregaram", "detail": "Podem ter ficado só os espaços em branco no lugar."})
    big_o = max(o["media"], key=lambda x: x["w"] * x["h"], default=None)
    big_c = max(c["media"], key=lambda x: x["w"] * x["h"], default=None)
    if big_o and not big_c:
        items.append({"status": "warn", "title": f"No {label}, o vídeo do original não apareceu", "detail": "Vale conferir o vídeo na página e trocar pelo seu."})
    elif big_o and big_c:
        area = (big_c["w"] * big_c["h"]) / max(1, big_o["w"] * big_o["h"])
        m["video"] = round(area, 2)
        if area < 0.6 or area > 1.6:
            items.append({"status": "warn", "title": f"No {label}, o vídeo tem tamanho diferente", "detail": f"No clone ele ocupa {round(area * 100)}% da área do original."})
    g = geometry_review.compare(o.get("geo") or {}, c.get("geo") or {}, width)
    if g:
        m["geo"] = g
        # judged against how well the clone agrees with the original on the computer: a page that animates its own text
        # never lines up perfectly, but it must not get WORSE on the phone
        base = baseline or {"matched": 1.0, "bad": 0.0}
        if width <= 500 and g["n"] >= 8 and (g["matched"] < base["matched"] - 0.12 or g["bad"] > max(0.15, base["bad"] + 0.12)):
            items.append({"status": "bad", "title": "No celular, a página não está igual ao original", "detail": f"{round(g['bad'] * 100)}% dos textos e botões ficaram em outro lugar ou com outro tamanho, e {round((1 - g['matched']) * 100)}% não apareceram."})
        if g["menuBroken"]:
            items.append({"status": "bad", "title": f"No {label}, o botão do menu não abre o menu", "detail": "No original, tocar no botão mostra os links do menu. No clone, nada acontece."})
    if diff is not None:
        m["firstScreen"] = diff
        if diff > 40:
            items.append({"status": "warn", "title": f"No {label}, a primeira tela está diferente", "detail": f"{round(diff)}% da imagem não bate. Pode ser animação, vídeo ou fonte que não veio igual."})
    return items, m


async def review_clone(browser, original_url: str, clone_url: str, docs: Optional[dict] = None) -> dict:
    """Compares the original and the clone on a computer and on a phone. Returns {ok, items, metrics}.

    `docs` ({"desktop": html, "phone": html}) reviews a clone that has not been saved yet, from the documents the web
    app builds for it; then `clone_url` is only the made-up address those documents are answered at."""
    origin = urlparse(original_url).netloc
    items: list = []
    metrics: list = []
    baseline_geo: Optional[dict] = None
    for width, height, mobile, label in ((1440, 900, False, "computador"), (390, 844, True, "celular")):
        doc = None
        target = clone_url
        if docs is not None:
            doc = docs.get("phone") if mobile else docs.get("desktop")
            doc = doc or docs.get("desktop")
            target = f"{clone_url}/{'m' if mobile else 'd'}"
        o, c = await asyncio.gather(
            _load(browser, original_url, width, height, mobile, shot="x"),
            _load(browser, target, width, height, mobile, shot="x", html=doc),
        )
        diff = _tile_diff(o["png"], c["png"]) if o.get("png") and c.get("png") else None
        its, m = _judge(o, c, width, label, origin, diff, baseline=baseline_geo)
        if width == 1440:
            baseline_geo = m.get("geo")
        items += its
        metrics.append(m)
        if width == 1440 and o.get("ok") and c.get("ok"):
            leaks = {h: n for h, n in c.get("hosts", {}).items() if _root(h) == _root(origin)}
            if leaks:
                items.append({"status": "info", "title": f"{sum(leaks.values())} arquivos ainda vêm do site original", "detail": "O clone ainda chama o site de origem pra carregar isso. Se ele sair do ar, esses itens somem."})
    bad = [i for i in items if i["status"] == "bad"]
    warn = [i for i in items if i["status"] == "warn"]
    if not items:
        items.append({"status": "ok", "title": "Conferi o clone no computador e no celular", "detail": "Texto, imagens, vídeo e primeira tela batem com o original."})
    return {"ok": not bad, "warnings": len(warn), "items": items, "metrics": metrics, "phoneBroken": any(i["title"].startswith("No celular, a página não está igual") or ("menu" in i["title"] and "celular" in i["title"]) for i in items)}
