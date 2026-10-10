from loguru import logger
from typing import Optional
import asyncio
import hashlib
import hmac
import json
import re
import time

import httpx
from urllib.parse import urljoin, urlparse, urlsplit

from services.playwright_scraper import PlaywrightScraper, SiteRefused, normalize_url, reveal_note
from services.asset_uploader import AssetUploader
from services.video_processor import VideoProcessor, is_hls_url, is_video_file
from services.progress_store import ProgressStore
from services.html_utils import rewrite_css_asset_urls, iter_css_urls
from services.video_embed import convert_html
from services.css_prune import prune_css, vocabulary
from services.video_rules import describe as describe_video
from services.behavior_probe import BehaviorProbe
from services.clone_review import review_clone
from config import settings


def preview_token(project_id: str, ttl_s: int = 900) -> str:
    """Short-lived signed link to ONE project's working copy (checked by lib/internal-auth.ts in the web app): the automatic review
    opens the clone in a browser with no session. Bound to the project and an expiry, so the secret itself never leaves for any site."""
    exp = str(int((time.time() + ttl_s) * 1000))
    sig = hmac.new(settings.SCANNER_SHARED_SECRET.encode(), f"preview:{project_id}:{exp}".encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"

# Chromium is heavy and a funnel walk runs several pages at once: more than a
# couple of walks at the same time would starve each other (or the host).
# The rest wait their turn, with the dashboard told so.
_SCAN_SLOTS = asyncio.Semaphore(2)
JOB_DEADLINE_SECONDS = 30 * 60


def _lab_fast() -> bool:
    """The site lab skips the slow behaviour probes and the review (it does its own comparison): touch /app/.lab_fast."""
    import os
    return os.path.exists("/app/.lab_fast")


class ScanOrchestrator:
    """
    Orchestrates a full clone of a SITE, not just one page:
    1. Scrape the starting URL with Playwright (real DOM, real CSS, real
       assets) and discover every same-site link on it.
    2. Breadth-first crawl those links (bounded by MAX_PAGES/MAX_DEPTH),
       scraping each one the same way. One page failing never aborts the
       rest — it's recorded and skipped.
    3. Once every reachable page is captured, rewrite every internal
       <a href> across all of them to point at the corresponding cloned
       page's own route instead of the original site. Links to pages we
       didn't/couldn't clone (over the limit, failed, or genuinely
       external) are left pointing at their real original URL.
    4. Push progress to Redis (pages found/processed/failed) so the
       dashboard can show it live.
    5. Hand back a result the web app persists as one Project + N Pages.

    Deliberately no AI anywhere in this pipeline — an AI model regenerating
    a section from a screenshot is a guess; the real DOM is not.
    """

    MAX_PAGES = 20
    # Set to 0 on purpose right now: current product direction is "get
    # single-page cloning rock solid first" — no crawler behavior, no
    # multi-page complexity to debug alongside it. The crawl loop, link
    # discovery, normalize_url, slug derivation and the link-rewrite pass
    # below are all still fully in place and already tested (see prior
    # session work) — turning this back up to re-enable following
    # internal links is the entire re-enable, nothing else to build.
    MAX_DEPTH = 0

    def __init__(self, job_id: str, project_id: str, url: str, workspace_id: Optional[str] = None, persona: Optional[str] = None):
        from services.personas import persona_by_id, CLONE_PERSONAS
        # the page as a visitor who came from an ad sees it (for links that show something else to everyone else)
        self.persona = persona_by_id(persona) if persona in CLONE_PERSONAS else None
        self.job_id = job_id
        self.project_id = project_id
        self.url = url
        self.workspace_id = workspace_id
        self.progress = ProgressStore()
        self.uploader = AssetUploader()
        self.videos = VideoProcessor(self.uploader, project_id)
        self._hls_done: dict[str, dict] = {}
        # Where the page currently being processed sits in the overall
        # 0-100 bar; set per page by run().
        self._pp_base = 10
        self._pp_span = 78
        # src -> rehosted url, so an image that repeats across the steps of a
        # funnel (the logo) is downloaded and stored once
        self._img_cache: dict[str, str] = {}
        self._last_push = time.monotonic()
        self._last_event: Optional[dict] = None
        self._probe_stop = False
        self._extra_notes: list[str] = []

    async def _report(self, frac: float, step: str):
        """Progress inside ONE page, as 0..1. The web client treats 90s
        without any event as a dead scanner and aborts, and a heavy page
        (hundreds of fonts/images to re-host) takes longer than that
        between its start and end events — so every long phase reports."""
        await self.update_status("processing", int(self._pp_base + self._pp_span * min(max(frac, 0.0), 1.0)), step)

    async def update_status(self, status: str, progress: int, step: str, extra: dict = None):
        event = {"job_id": self.job_id, "status": status, "progress": progress, "currentStep": step}
        if extra:
            event.update(extra)
        self._last_push = time.monotonic()
        if status not in ("done", "error"):
            self._last_event = event
        await self.progress.push_event(self.job_id, event)
        logger.info(f"[{self.job_id}] {progress}% - {step}")

    async def _heartbeat(self):
        """The web client declares the scanner dead after 90s of silence. A
        long step (a funnel being walked, a heavy page being downloaded) must
        never look like that: while the job is alive, repeat the last status."""
        while True:
            await asyncio.sleep(8)
            if self._last_event and time.monotonic() - self._last_push >= 7:
                try:
                    await self.progress.push_event(self.job_id, {**self._last_event, "heartbeat": True})
                    self._last_push = time.monotonic()
                except Exception:
                    pass

    # ── Per-asset rehosting (used once per cloned page) ──────────────────

    async def _rehost_section_images(self, dom_html: str, images: list, page_label: str, section_index: int) -> str:
        """Downloads each real image once (several at a time) and rewrites
        the HTML to our own S3 URL — best-effort per image, one failure just
        leaves that <img> pointing at the original."""
        sem = asyncio.Semaphore(8)
        wanted: dict[str, int] = {}
        for idx, img in enumerate(images[:60]):
            src = (img or {}).get("src")
            # outerHTML serializes "&" in an attribute value as "&amp;", so a
            # URL with a query string (every /_next/image?url=..&w=.. optimizer
            # URL) never matched a plain substring check and was silently
            # left hot-linked to the original site.
            if not src or src in wanted or (src not in dom_html and src.replace("&", "&amp;") not in dom_html):
                continue
            if src in self._img_cache:
                dom_html = dom_html.replace(src, self._img_cache[src]).replace(src.replace("&", "&amp;"), self._img_cache[src])
                continue
            wanted[src] = idx

        async def one(src: str, idx: int):
            ext = src.split("?")[0].rsplit(".", 1)[-1].lower()
            ext = ext if ext in ("png", "jpg", "jpeg", "webp", "gif", "svg") else "png"
            key = f"projects/{self.project_id}/assets/{page_label}_section_{section_index}_{idx}.{ext}"
            async with sem:
                return src, await self.uploader.rehost_url(src, key, referer=self.url)

        results = await asyncio.gather(*(one(src, idx) for src, idx in wanted.items()))
        for old_url, new_url in results:
            if new_url:
                self._img_cache[old_url] = new_url
                dom_html = dom_html.replace(old_url, new_url).replace(old_url.replace("&", "&amp;"), new_url)
        return dom_html

    _LEFTOVER_RE = re.compile(r"https?://[^\s\"'()<>\\]+")
    _LEFTOVER_EXT = re.compile(r"\.(?:png|jpe?g|webp|gif|svg|avif)(?:/|$)", re.I)
    _LEFTOVER_SKIP = ("be-vallid.com", "facebook.com/tr", "google-analytics", "googletagmanager", "doubleclick", "/pixel", "w3.org")

    async def _rehost_leftover_images(self, dom_html: str, page_label: str, section_index: int) -> str:
        """The <img> pass only knows the pictures the browser reported. Pictures named anywhere else in the markup
        (a CSS variable in a style attribute, a <source srcset>, a poster, data-src) still pointed at the original site."""
        found: list = []
        for m in self._LEFTOVER_RE.finditer(dom_html):
            u = m.group(0).replace("&amp;", "&").rstrip(",;")
            # a transformed image keeps its extension in the middle too (…/a.webp/v1/fill/w_75,h_80/a.png): take the whole address
            if u in found or any(x in u for x in self._LEFTOVER_SKIP) or not self._LEFTOVER_EXT.search(u.split("?")[0]):
                continue
            found.append(u)
        # the pictures of <picture><source media=... srcset=...> are the clone's art direction: they come along whatever
        # their address looks like (an image CDN's URL often has no file extension)
        for sm in re.finditer(r'<source\b[^>]*?\ssrcset="([^"]+)"', dom_html, re.I):
            for cand in re.split(r",\s+", sm.group(1).replace("&amp;", "&")):
                u = cand.strip().split(" ")[0]
                if u.startswith("http") and u not in found and not any(x in u for x in self._LEFTOVER_SKIP):
                    found.append(u)
        todo = [u for u in found if u not in self._img_cache][:60]
        sem = asyncio.Semaphore(8)

        async def one(u: str, idx: int):
            ext = u.split("?")[0].rsplit(".", 1)[-1].lower()
            ext = ext if ext in ("png", "jpg", "jpeg", "webp", "gif", "svg", "avif") else "img"
            key = f"projects/{self.project_id}/assets/{page_label}_section_{section_index}_x{idx}.{ext}"
            async with sem:
                return u, await self.uploader.rehost_url(u, key, referer=self.url)

        for old_url, new_url in await asyncio.gather(*(one(u, i) for i, u in enumerate(todo))):
            if new_url:
                self._img_cache[old_url] = new_url
        for u in sorted(found, key=len, reverse=True):
            new = self._img_cache.get(u)
            if new:
                dom_html = dom_html.replace(u, new).replace(u.replace("&", "&amp;"), new)
        return dom_html

    async def _hls_for(self, url: str, label: str) -> dict | None:
        """One video file or stream -> HLS in our storage (cached: the same address on several pages is converted once)."""
        if url in self._hls_done:
            return self._hls_done[url]
        res = await self.videos.to_hls(url, label, referer=self.url)
        if res:
            self._hls_done[url] = res
            mins = f" ({round(res['seconds'] / 60)} min)" if res.get("seconds") else ""
            how = {"copy": "cortado em pedaços sem perder qualidade", "transcode": "convertido para 720p e cortado em pedaços", "mirror": "o streaming original foi copiado para o nosso armazenamento"}.get(res["mode"], "convertido")
            self._extra_notes.append(f"Vídeo{mins} {how}: a página só baixa o trecho que a pessoa está assistindo.")
        return res

    async def _rehost_video(self, video: dict, page_label: str) -> dict:
        """The page's main video: a file or a stream becomes HLS in our own storage (light, and no longer depends on the original site);
        if that cannot be done the old behaviour stays (a file is copied as it is, a stream keeps pointing at its source)."""
        url = video.get("url") or ""
        if video.get("type") == "native" and url.startswith("http"):
            res = await self._hls_for(url, f"{page_label}_main")
            if res:
                return {**video, "url": res["url"], "hls": True, "originalUrl": url}
        if video.get("type") != "native" or video.get("hls") or not url:
            return video
        new_url = await self.uploader.rehost_url(url, f"projects/{self.project_id}/videos/{page_label}.mp4", timeout=120, referer=self.url)
        return {**video, "url": new_url, "originalUrl": url} if new_url else video

    def _video_block_html(self, video: dict) -> str:
        if video.get("type") == "native":
            poster = f' poster="{video["poster"]}"' if video.get("poster") else ""
            return f'<video src="{video["url"]}" controls{poster} style="width:100%;display:block;background:#000;"></video>'
        return (
            f'<div style="position:relative;padding-top:56.25%;background:#000;">'
            f'<iframe src="{video["url"]}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen '
            f'style="position:absolute;inset:0;width:100%;height:100%;border:0;"></iframe></div>'
        )

    async def _rehost_page_css(self, page_css: str, page_label: str, span: tuple = (0.55, 0.95)) -> str:
        """Downloads and rehosts every asset the captured page-level
        stylesheet references (background images AND self-hosted
        @font-face fonts) — several at a time, reporting progress as it goes
        — then rewrites the stylesheet to point at the rehosted copies."""
        if not page_css:
            return ""
        urls = sorted({target for _, _, target in iter_css_urls(page_css)})
        # Stylesheets pulled in by @import (Google Fonts CSS) are served by
        # their own host and work as-is — saving a copy of the CSS file under
        # a made-up key only breaks them.
        urls = [u for u in urls if not u.startswith("data:") and "fonts.googleapis.com" not in u and not u.split("?")[0].endswith(".css")]
        url_map: dict[str, str] = {}
        sem = asyncio.Semaphore(8)
        done = 0

        async def one(i: int, original: str):
            nonlocal done
            ext = original.split(".")[-1].split("?")[0][:5] or "asset"
            key = f"projects/{self.project_id}/css-assets/{page_label}_{i}.{ext}"
            async with sem:
                new_url = await self.uploader.rehost_url(original, key, referer=self.url)
            if new_url:
                url_map[original] = new_url
            done += 1
            if done % 12 == 0:
                await self._report(span[0] + (span[1] - span[0]) * done / max(len(urls), 1), f"🎨 Hospedando fontes e estilos ({done}/{len(urls)})...")

        await asyncio.gather(*(one(i, original) for i, original in enumerate(urls)))
        out = rewrite_css_asset_urls(page_css, url_map)
        # a font that became WOFF2 must say so, or the browser may skip it for the format it claimed to be
        return re.sub(r'(url\([^)]*\.woff2[^)]*\))\s*format\(\s*(["\'])(?:truetype|opentype|woff|embedded-opentype)\2\s*\)', r'\1 format("woff2")', out)

    @staticmethod
    def _slug_from_url(url: str, used_slugs: set[str]) -> str:
        """Path-based, deduped slug — /produtos/item-1 -> produtos-item-1,
        the bare root -> home. Appends -2/-3/... on collision (two
        different paths that slugify to the same string, or a repeated
        call for the same page)."""
        path = urlparse(url).path.strip("/")
        base = re.sub(r"[^a-z0-9]+", "-", path.lower()).strip("-") if path else "home"
        base = base or "home"
        slug = base
        i = 2
        while slug in used_slugs:
            slug = f"{base}-{i}"
            i += 1
        used_slugs.add(slug)
        return slug

    async def _process_one_page(self, url: str, page_label: str, capture_thumbnail: bool, try_funnel: bool = False, funnel_prefix: str = "", mobile: bool = False) -> dict:
        """Scrapes and fully processes ONE page — real DOM, real CSS,
        real assets rehosted. Raises on failure; the caller decides what
        happens to the rest of the crawl when that happens (nothing does,
        by design — see run()).

        With try_funnel, a short page that turns out to be the first screen of
        a multi-step funnel comes back as {"funnel": [pages...]} instead."""
        try:
            async def _on_progress(frac: float, step: str):
                await self._report(frac * 0.5, step)

            try:
                async with PlaywrightScraper(persona=self.persona, use_proxy=True, mobile=mobile) as scraper:
                    scrape_result = await scraper.scrape_url(url, capture_thumbnail=capture_thumbnail, on_progress=_on_progress, try_funnel=try_funnel, funnel_prefix=funnel_prefix)
                    self.uploader.prefetched.update(scraper.asset_bodies)
            except SiteRefused:
                raise
            except Exception as first_error:
                # one more go: a fresh browser, and without the funnel walk (the
                # likeliest thing to trip on an odd page)
                logger.warning(f"[{self.job_id}] capture failed ({first_error!r}), trying again plainly")
                await self._report(0.05, "🔁 Tentando de novo de outro jeito...")
                try:
                    async with PlaywrightScraper(persona=self.persona, use_proxy=True, mobile=mobile) as scraper:
                        scrape_result = await scraper.scrape_url(url, capture_thumbnail=capture_thumbnail, on_progress=_on_progress, try_funnel=False)
                        self.uploader.prefetched.update(scraper.asset_bodies)
                except Exception:
                    # last resort: the page as the server sent it, scripts off
                    await self._report(0.05, "🔁 Página difícil: copiando só o conteúdo estático...")
                    async with PlaywrightScraper(persona=self.persona, use_proxy=True, js=False, mobile=mobile) as scraper:
                        scrape_result = await scraper.scrape_url(url, capture_thumbnail=capture_thumbnail, on_progress=_on_progress, try_funnel=False)
                        self.uploader.prefetched.update(scraper.asset_bodies)
        except SiteRefused as e:
            raise RuntimeError(str(e)) from e
        except Exception as e:
            raise RuntimeError(f"Falha ao acessar URL ({url}): {e}") from e

        thumbnail_url = None
        if scrape_result.get("full_screenshot_b64"):
            # Vanity-only — a failed upload here must never fail the whole
            # page, the same reasoning already applied to the screenshot
            # itself being non-fatal inside scrape_url.
            try:
                thumbnail_url = await self.uploader.upload_base64(
                    data_b64=scrape_result["full_screenshot_b64"],
                    key=f"projects/{self.project_id}/thumbnail.png",
                    content_type="image/png",
                )
            except Exception as e:
                logger.warning(f"[{self.job_id}] Falha ao baixar/subir thumbnail (não-fatal): {e}")

        if scrape_result.get("funnel"):
            return await self._process_funnel(scrape_result["funnel"], thumbnail_url)

        # An "empty" capture must never be saved as a successful clone.
        if not any((s_.get("dom_html") or "").strip() for s_ in scrape_result.get("sections") or []):
            raise RuntimeError("Não encontrei conteúdo nessa página para clonar (ela pode exigir login ou bloquear robôs).")

        result = await self._finish_page(scrape_result, page_label, url)
        result["thumbnail"] = thumbnail_url
        result["mobile_variant"] = scrape_result.get("mobile_variant")
        return result

    async def _process_funnel(self, funnel: dict, thumbnail_url: Optional[str]) -> dict:
        """Every step of a walked funnel becomes its own page. The stylesheet
        is the same for all of them, so it is re-hosted once."""
        steps = funnel["steps"]
        n = len(steps)
        self._pp_base, self._pp_span = 10, 78
        await self._report(0.5, f"🧭 {n} etapas encontradas. Hospedando estilos e fontes...")
        # the stylesheet of the whole site, cut down to what these screens can use (a phone
        # parses it again at every step); rules for classes found nowhere in the markup go
        raw_css = funnel.get("page_css") or ""
        try:
            texts = []
            for st in steps:
                texts += [sec.get("dom_html") or "" for sec in st.get("sections") or []]
                texts.append(json.dumps(st.get("shell") or {}, ensure_ascii=False))
            lean_css = prune_css(raw_css, vocabulary(texts))
        except Exception as e:
            logger.warning(f"[{self.job_id}] could not slim the stylesheet ({e!r}), keeping it whole")
            lean_css = raw_css
        if lean_css and len(lean_css) < len(raw_css) * 0.97:
            self._extra_notes.append(f"Deixei o site mais leve: o estilo caiu de {len(raw_css) // 1024}KB para {len(lean_css) // 1024}KB, só com o que as telas usam.")
            raw_css = lean_css
        page_css = await self._rehost_page_css(raw_css, "home", span=(0.5, 0.6))
        pages = []
        for i, st in enumerate(steps):
            start = 10 + 78 * (0.6 + 0.4 * i / n)
            end = 10 + 78 * (0.6 + 0.4 * (i + 1) / n)
            self._pp_base, self._pp_span = 2 * start - end, 2 * (end - start)
            await self._report(0.5, f"📦 Hospedando imagens da etapa {i + 1} de {n}...")
            try:
                res = await self._finish_page(
                    {**st, "page_css": page_css, "font_links": funnel.get("font_links") or [], "internal_links": [], "is_funnel_step": True},
                    st["slug"], st["url"], css_ready=True,
                )
            except Exception as e:
                # a step whose pictures could not be re-hosted keeps them
                # linked to the original: better than losing the step (the
                # others point at it)
                logger.warning(f"[{self.job_id}] step {i + 1}: could not re-host assets ({e!r}), keeping originals")
                res = {
                    "sections": [{
                        "id": f"{st['slug']}_section_{j}", "type": "custom-html", "order": j,
                        "generatedHtml": sec.get("dom_html") or None, "screenshot": None, "links": sec.get("links") or [],
                    } for j, sec in enumerate(st.get("sections") or [])],
                    "shell": st.get("shell"),
                }
            pages.append({
                "slug": st["slug"],
                "name": st["name"],
                "url": st["url"],
                "sections": res["sections"],
                "page_css": page_css,
                "shell": res["shell"],
            })
        self._pp_base, self._pp_span = 10, 78
        return {"funnel": pages, "thumbnail": thumbnail_url, "notes": funnel.get("notes") or [], "exit_url": funnel.get("exit_url")}

    async def _finish_page(self, scrape_result: dict, page_label: str, url: str, css_ready: bool = False) -> dict:
        """Everything after the browser is done: re-host the images and the
        stylesheet's assets, place the video, assemble the stored sections."""
        try:
            sections = scrape_result["sections"]
            if (scrape_result.get("blocks_total") or 0) > PlaywrightScraper.MAX_BLOCKS:
                self._extra_notes.append(f"Página muito comprida: clonei as primeiras {PlaywrightScraper.MAX_BLOCKS} seções de {scrape_result['blocks_total']}.")
            processed = []
            await self._report(0.5, "📦 Hospedando imagens e arquivos da página...")
            for i, section in enumerate(sections):
                dom_html = (section.get("dom_html") or "").strip()
                if dom_html:
                    dom_html = await self._rehost_section_images(dom_html, section.get("images") or [], page_label, i)
                    try:
                        dom_html = await self._rehost_leftover_images(dom_html, page_label, i)
                    except Exception as e:
                        logger.info(f"[{self.job_id}] leftover images skipped: {e!r}")
                    await self._report(0.5 + 0.05 * (i + 1) / max(len(sections), 1), f"🖼️ Imagens hospedadas ({i + 1}/{len(sections)} seções)...")
                processed.append({
                    "id": f"{page_label}_section_{i}",
                    "type": "custom-html",
                    "order": i,
                    "generatedHtml": dom_html or None,
                    "screenshot": None,
                    "links": section.get("links") or [],
                })

            # every other video of the page (a plain <video>, a YouTube/Vimeo/Wistia iframe)
            # becomes the clone's own light player, same box, same rules
            players_made: list = []
            for p in processed:
                if p.get("generatedHtml"):
                    p["generatedHtml"], made = convert_html(p["generatedHtml"], scrape_result.get("video"))
                    players_made += made
            # a plain <video src="...mp4"> or an .m3u8 that became one of our players: the same light HLS, at most three per page
            for n_v, cfg in enumerate([c for c in players_made if str(c.get("src") or "") and not str(c.get("src")).startswith(("blob:", "data:"))][:3]):
                raw_src = cfg["src"]
                src = urljoin(url, raw_src)                       # the page wrote "/media/film.mp4": the file lives at an address of the page's site
                if not src.startswith("http") or not (is_video_file(src) or is_hls_url(src)):
                    continue
                res = self._hls_done.get(src) or await self._hls_for(src, f"{page_label}_v{n_v}")
                if res:
                    for p in processed:
                        if p.get("generatedHtml"):
                            for form in {raw_src, src, raw_src.replace("&", "&amp;"), src.replace("&", "&amp;")}:
                                p["generatedHtml"] = p["generatedHtml"].replace(form, res["url"])
            for cfg in players_made:
                for key in ("poster",):
                    ref = cfg.get(key)
                    if not ref or not ref.startswith("http"):
                        continue
                    new_ref = await self.uploader.rehost_url(ref, f"projects/{self.project_id}/assets/{page_label}_poster_{abs(hash(ref)) % 99999}.jpg", referer=self.url)
                    if new_ref:
                        for p in processed:
                            if p.get("generatedHtml"):
                                p["generatedHtml"] = p["generatedHtml"].replace(ref, new_ref).replace(ref.replace("&", "&amp;"), new_ref)
            if players_made:
                self._video_players = getattr(self, "_video_players", 0) + len(players_made)

            # first frames of plain videos (their cover in the clone's own player)
            for i, b64 in enumerate(scrape_result.get("video_shots") or []):
                token = f"__VAI_VSHOT_{i}__"
                url_ = ""
                if b64:
                    try:
                        url_ = await self.uploader.upload_base64(data_b64=b64, key=f"projects/{self.project_id}/assets/{page_label}_vframe_{i}.jpg", content_type="image/jpeg")
                    except Exception as e:
                        logger.warning(f"[{self.job_id}] could not upload video frame {i}: {e!r}")
                for p in processed:
                    if p.get("generatedHtml"):
                        p["generatedHtml"] = p["generatedHtml"].replace(token, url_)
            # any token left over (no frame was taken) must not stay in the markup
            for p in processed:
                if p.get("generatedHtml") and "__VAI_VSHOT_" in p["generatedHtml"]:
                    p["generatedHtml"] = re.sub(r"__VAI_VSHOT_\d+__", "", p["generatedHtml"])

            # pictures of the video players as the visitor sees them before play
            for i, b64 in enumerate(scrape_result.get("host_shots") or []):
                token = f"__VAI_SHOT_{i}__"
                if not b64:
                    for p in processed:
                        if p.get("generatedHtml"):
                            p["generatedHtml"] = p["generatedHtml"].replace(token, "")
                    continue
                try:
                    url_ = await self.uploader.upload_base64(data_b64=b64, key=f"projects/{self.project_id}/assets/{page_label}_player_{i}.jpg", content_type="image/jpeg")
                except Exception as e:
                    logger.warning(f"[{self.job_id}] could not upload player cover {i}: {e!r}")
                    url_ = ""
                for p in processed:
                    if p.get("generatedHtml"):
                        p["generatedHtml"] = p["generatedHtml"].replace(token, url_)

            # what the page keeps hidden until a video reaches a moment, or until some seconds passed (the probe tagged it in the markup)
            for r in (scrape_result.get("media_reveals") or [])[:5]:
                self._extra_notes.append(reveal_note(r))
            video = scrape_result.get("video")
            if video and video.get("vturb") and not scrape_result.get("is_funnel_step"):
                self._extra_notes.append(describe_video(video.get("rules") or {}, video.get("vturb")))
            if video and video.get("url"):
                video = await self._rehost_video(video, page_label)
                all_html = "\n".join(p.get("generatedHtml") or "" for p in processed)
                original_url = video.get("originalUrl") or video["url"]
                already_embedded = video["url"] in all_html or original_url in all_html or (
                    video.get("type") == "iframe" and "<iframe" in all_html
                )
                orig_url = video.get("originalUrl")
                if orig_url and orig_url != video["url"]:
                    # The video was rehosted to our storage: point every copy
                    # of the original URL in the page (a <video src>, an
                    # in-place player) at it. "&" appears as "&amp;" in HTML.
                    for p in processed:
                        html = p.get("generatedHtml")
                        if html:
                            p["generatedHtml"] = html.replace(orig_url, video["url"]).replace(orig_url.replace("&", "&amp;"), video["url"])
                    all_html = "\n".join(p.get("generatedHtml") or "" for p in processed)
                if scrape_result.get("video_embedded"):
                    pass
                elif re.search(r"<video\b", all_html):
                    # The page's own <video> markup is already in the clone.
                    # A player that streams through MediaSource only exposes a
                    # useless blob: URL there — swap in the real stream URL we
                    # sniffed off the network, in place, instead of appending
                    # a duplicate player at the end of the page.
                    # (only ONE of them: the stream we sniffed is the page's main video; other blob videos
                    # on the page are previews we cannot reproduce, and they must not all play that stream)
                    swapped = False
                    for p in processed:
                        html = p.get("generatedHtml")
                        if swapped or not html or "blob:" not in html:
                            continue
                        p["generatedHtml"], n_sub = re.subn(
                            r'(<video\b[^>]*?\ssrc=")blob:[^"]*(")',
                            lambda m: m.group(1) + video["url"] + m.group(2),
                            html,
                            count=1,
                        )
                        swapped = n_sub > 0
                elif not already_embedded:
                    processed.append({
                        "id": f"{page_label}_section_{len(processed)}",
                        "type": "vsl",
                        "order": len(processed),
                        "generatedHtml": self._video_block_html(video),
                        "screenshot": None,
                        "links": [],
                    })

            page_css = scrape_result.get("page_css") or "" if css_ready else await self._rehost_page_css(scrape_result.get("page_css") or "", page_label)
        except Exception as e:
            raise RuntimeError(f"Falha ao processar HTML/assets da página ({url}): {e}") from e

        shell = scrape_result.get("shell")
        font_links = scrape_result.get("font_links") or []
        # With a captured shell the Google Fonts <link>s live in the
        # document <head> (shell.fontLinks); the legacy path injects them
        # into the first block instead.
        if font_links and processed and not shell:
            links_html = "\n".join(f'<link rel="stylesheet" href="{href}">' for href in font_links[:5])
            target = next((p for p in processed if p.get("generatedHtml")), None)
            if target:
                target["generatedHtml"] = links_html + "\n" + target["generatedHtml"]

        return {
            "sections": processed,
            "page_css": page_css,
            "shell": shell,
            "internal_links": scrape_result.get("internal_links") or [],
        }

    def _rewrite_internal_links(self, pages: list[dict], url_to_slug: dict[str, str]) -> None:
        """Mutates every page's sections in place: any captured link whose
        normalized target matches a page we actually cloned gets rewritten
        to that page's own route. Everything else (external domains, pages
        we didn't clone) keeps pointing at its real original absolute URL
        — a safe fallback, not a broken link.

        A link pointing at the page it's ALREADY on (e.g. href="#top", or
        a full self-URL with a #fragment) is a special case: rewriting it
        to that page's own route would turn a same-page scroll-to-anchor
        into a full navigation/reload back to the top of the same page,
        losing the anchor behavior — and if left as the original absolute
        URL, it would navigate the visitor OUT of the clone back to the
        real site. Rewritten to a bare "#fragment" instead, it stays a
        normal same-page anchor inside the clone.
        """
        for page in pages:
            own_norm = normalize_url(page["url"])
            for section in page["sections"]:
                html = section.get("generatedHtml")
                if not html:
                    continue
                for link in section.get("links") or []:
                    href = (link or {}).get("href")
                    if not href or f'href="{href}"' not in html:
                        continue
                    fragment = urlparse(href).fragment
                    target_norm = normalize_url(href)
                    if target_norm == own_norm:
                        new_href = f"#{fragment}" if fragment else None
                    else:
                        target_slug = url_to_slug.get(target_norm)
                        new_href = f"/projects/{self.project_id}/p/{target_slug}" + (f"#{fragment}" if fragment else "") if target_slug else None
                    if new_href:
                        html = html.replace(f'href="{href}"', f'href="{new_href}"')
                section["generatedHtml"] = html

    async def run(self):
        beat = asyncio.create_task(self._heartbeat())
        try:
            if _SCAN_SLOTS.locked():
                await self.update_status("scanning", 3, "⏳ Tem outros clones rodando, o seu começa em instantes...")
            async with _SCAN_SLOTS:
                # a page whose script never lets the browser answer (a WebGL scene stuck loading) would hold this slot
                # forever and, one by one, every other clone would wait behind it: past the deadline the job is let go
                await asyncio.wait_for(self._run(), JOB_DEADLINE_SECONDS)
        except asyncio.TimeoutError:
            logger.error(f"[{self.job_id}] Scan gave up after {JOB_DEADLINE_SECONDS}s")
            await self._fail("A página demorou demais para clonar (mais de 30 minutos). Tente de novo ou use outro link.")
        except BaseException as e:
            # whatever happens, the dashboard must be told: a job that just stops
            # talking looks like "o scanner parou de responder"
            if not isinstance(e, asyncio.CancelledError):
                logger.exception(f"[{self.job_id}] Scan crashed: {e}")
            await self._fail(f"{type(e).__name__}: {e}" if str(e) else type(e).__name__)
            if isinstance(e, (asyncio.CancelledError, KeyboardInterrupt)):
                raise
        finally:
            beat.cancel()

    async def _deliver(self, payload: dict) -> bool:
        """Hands the outcome to the web app server to server. This is what makes
        a clone finish even if the browser tab was closed or its stream dropped,
        and keeps a big funnel from having to squeeze through the browser."""
        if not settings.SCANNER_SHARED_SECRET:
            return False
        url = settings.WEB_INTERNAL_URL.rstrip("/") + "/api/internal/scan-complete"
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=180) as client:
                    r = await client.post(url, json=payload, headers={"x-scanner-secret": settings.SCANNER_SHARED_SECRET})
                if r.status_code == 200:
                    return True
                logger.warning(f"[{self.job_id}] hand-over answered {r.status_code}: {r.text[:200]}")
            except Exception as e:
                logger.warning(f"[{self.job_id}] hand-over attempt {attempt + 1} failed: {e!r}")
            await asyncio.sleep(2 * (attempt + 1))
        return False

    async def _preview_doc(self, entry: dict) -> Optional[str]:
        """The document the web app would serve for a page that has not been saved yet."""
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                r = await client.post(
                    settings.WEB_INTERNAL_URL.rstrip("/") + "/api/internal/clone-preview",
                    json={"projectId": self.project_id, "name": entry["name"], "sections": entry["sections"], "pageCss": entry["page_css"] or "", "shell": entry.get("shell")},
                    headers={"x-scanner-secret": settings.SCANNER_SHARED_SECRET},
                )
            if r.status_code == 200:
                return r.text
            logger.warning(f"[{self.job_id}] preview answered {r.status_code}: {r.text[:200]}")
        except Exception as e:
            logger.warning(f"[{self.job_id}] preview failed: {e!r}")
        return None

    async def _capture_phone_variant(self, entry: dict, variants: list, url_to_slug: dict) -> Optional[dict]:
        """The phone's own version of a page, cloned and attached to it (what renderClonePage serves to phones)."""
        if self.persona:
            return None                       # the visitor already is a phone: there is no other version to ask for
        slug = entry["slug"]
        mres = await self._process_one_page(entry["url"], slug + "_m", capture_thumbnail=False, try_funnel=False, mobile=True)
        vslug = f"{slug}__m"
        variant = {
            "url": entry["url"], "slug": vslug,
            "name": ("Página inicial" if slug == "home" else slug.replace("-", " ").title()) + " (celular)",
            "sections": mres["sections"], "page_css": mres["page_css"],
            "shell": {**(mres.get("shell") or {}), "variant": "mobile", "of": slug},
            "thumbnail": None,
        }
        if isinstance(entry.get("shell"), dict) and entry["shell"].get("rules"):
            variant["shell"]["rules"] = entry["shell"]["rules"]
        self._rewrite_internal_links([variant], url_to_slug)
        variants.append(variant)
        entry["shell"]["mobileSlug"] = vslug
        return variant

    async def _review_before_delivery(self, cloned: list, variants: list, url_to_slug: dict) -> Optional[dict]:
        """The check a person would do before handing the clone over: open the original and the clone side by side, on a
        computer and on a phone. When the phone looks different from the original and no phone version was made, that
        evidence (not a guess) is what decides to clone the phone's own version, and the check is repeated."""
        entry = cloned[0]
        if not isinstance(entry.get("shell"), dict):
            return None
        fake = f"{settings.WEB_INTERNAL_URL.rstrip('/')}/__vai_review/{self.job_id}"
        repaired = False
        review = None
        async with PlaywrightScraper(persona=self.persona, use_proxy=False) as sc:
            for attempt in (1, 2):
                variant = next((v for v in variants if (v.get("shell") or {}).get("of") == entry["slug"]), None)
                docs = {"desktop": await self._preview_doc(entry), "phone": (await self._preview_doc(variant)) if variant else None}
                if not docs["desktop"]:
                    return None
                review = await review_clone(sc.browser, self.url, fake, docs)
                if attempt == 1 and review.get("phoneBroken") and not variant:
                    await self.update_status("processing", 93, "📱 No celular ficou diferente do original: clonando a versão de celular e conferindo de novo...")
                    try:
                        await self._capture_phone_variant(entry, variants, url_to_slug)
                        repaired = True
                        continue
                    except Exception as e:
                        logger.warning(f"[{self.job_id}] phone version after review failed: {e!r}")
                break
        if review and repaired:
            review["items"].insert(0, {"status": "info", "title": "Arrumei o celular sozinho", "detail": "Na conferência, o celular estava diferente do original. Clonei a versão de celular da página e conferi de novo."})
        # sideways scrolling that only the clone has: the original's scripts kept something inside the screen, ours cannot.
        # Cut what sticks out (clip, not hidden: it keeps sticky headers working) instead of letting the page wobble sideways.
        if review and any(i["status"] == "bad" and i["title"].startswith("No celular, a página fica mais larga") for i in review["items"]):
            guard = "\n/* vai: nothing may push the page sideways on a phone */\n@media (max-width: 820px){html,body{overflow-x:clip}}"
            for pg in [entry] + [v for v in variants if (v.get("shell") or {}).get("of") == entry["slug"]]:
                if guard not in (pg.get("page_css") or ""):
                    pg["page_css"] = (pg.get("page_css") or "") + guard
            for i in review["items"]:
                if i["title"].startswith("No celular, a página fica mais larga"):
                    i["status"] = "info"
                    i["title"] = "Segurei a largura da página no celular"
                    i["detail"] = "Alguma parte passava da largura da tela e fazia a página balançar pro lado. Cortei o que sobrava, assim ela não arrasta mais."
            review["ok"] = not any(i["status"] == "bad" for i in review["items"])
        return review

    async def _review_after(self, slug: str):
        """Opens the original and the finished clone side by side (computer and phone) and records what differs."""
        try:
            await asyncio.sleep(3)
            clone_url = f"{settings.WEB_INTERNAL_URL.rstrip('/')}/projects/{self.project_id}/p/{slug}?vai_token={preview_token(self.project_id)}"
            async with PlaywrightScraper(persona=self.persona, use_proxy=False) as sc:
                review = await asyncio.wait_for(review_clone(sc.browser, self.url, clone_url), 180)
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    settings.WEB_INTERNAL_URL.rstrip("/") + "/api/internal/scan-review",
                    json={"projectId": self.project_id, "review": review},
                    headers={"x-scanner-secret": settings.SCANNER_SHARED_SECRET},
                )
            logger.info(f"[{self.job_id}] review: ok={review.get('ok')} warnings={review.get('warnings')} saved={r.status_code}")
        except Exception as e:
            logger.warning(f"[{self.job_id}] review skipped: {e!r}")

    async def _fail(self, message: str):
        text = message[:300]
        delivered = await self._deliver({"jobId": self.job_id, "projectId": self.project_id, "error": text})
        await self.update_status("error", 0, f"❌ Erro: {text}", extra={"error": text, "delivered": delivered})

    @staticmethod
    def _wire_cta(sections: list, tag: str, text: str, nth: int, attrs: str) -> bool:
        """Adds `attrs` to the nth <tag> whose visible text is `text` (the way
        the probe saw it: case-insensitive, because CSS may upper-case it)."""
        import html as _html
        pat = re.compile(rf"<{tag}\b([^>]*)>(.*?)</{tag}>", re.S | re.I)
        want = re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip().lower()
        count = 0
        done = False
        for sec in sections:
            src = sec.get("generatedHtml") or ""

            def repl(m):
                nonlocal count, done
                inner = re.sub(r"<[^>]+>", " ", m.group(2))
                inner = re.sub(r"\s+", " ", _html.unescape(inner).replace("\xa0", " ")).strip().lower()[:80]
                if inner != want:
                    return m.group(0)
                idx = count
                count += 1
                if idx != nth or "data-vai-href" in m.group(1) or "data-vai-next" in m.group(1):
                    return m.group(0)
                done = True
                return f"<{tag}{m.group(1)}{attrs}>{m.group(2)}</{tag}>"

            new_src = pat.sub(repl, src)
            if new_src != src:
                sec["generatedHtml"] = new_src
        return done

    async def _clone_rules(self, cloned: list, used_slugs: set, root_url: str) -> list:
        """The page's hidden behaviour, found by trying it on the original:
          - rules: what happens when the visitor tries to leave (exit intent,
            back button, a timed redirect);
          - buttons whose destination only the page's scripts know.
        Same-site pages these lead to ("wait, here is a gift") are cloned too
        and everything is pointed at the clones. Best effort: the clone is
        complete without any of this."""
        notes: list = []
        seen: dict = {normalize_url(root_url): cloned[0]["slug"]}
        queue = [(root_url, cloned[0], 0)]

        async def ensure_page(dest: str, depth: int, queue: list) -> Optional[str]:
            norm = normalize_url(dest)
            if norm in seen:
                return seen[norm]
            if depth >= 2 or len(cloned) >= self.MAX_PAGES:
                return None
            slug = self._slug_from_url(dest, used_slugs)
            await self.update_status("processing", 91, f"🎁 Clonando a página que essa regra abre ({slug})...")
            try:
                # a page like a "gift box" shows its offer after a tap, in the same URL: let the funnel walker see it
                res = await self._process_one_page(dest, slug, capture_thumbnail=False, try_funnel=True, funnel_prefix=slug)
            except Exception as e:
                logger.warning(f"[{self.job_id}] could not clone rule page {dest}: {e!r}")
                return None
            group: list = []
            if res.get("funnel"):
                for p_ in res["funnel"]:
                    entry = {
                        "url": p_["url"], "slug": p_["slug"], "name": p_["name"], "sections": p_["sections"],
                        "page_css": p_["page_css"], "shell": p_.get("shell"), "thumbnail": None, "group": group,
                    }
                    cloned.append(entry)
                    group.append(entry)
                notes.append(f"A página {urlsplit(dest).path} tem várias telas dentro dela ({len(group)}); clonei todas.")
                first = group[0]
            else:
                first = {
                    "url": dest, "slug": slug, "name": slug.replace("-", " ").title(),
                    "sections": res["sections"], "page_css": res["page_css"], "shell": res.get("shell"), "thumbnail": None,
                    "group": group,
                }
                cloned.append(first)
                group.append(first)
            seen[norm] = slug
            queue.append((dest, first, depth + 1))
            return slug

        while queue and not self._probe_stop:
            url, page, depth = queue.pop(0)
            await self.update_status("processing", 90, "🕵️ Procurando regras escondidas (saída, voltar, botões com destino secreto)...")
            try:
                async with PlaywrightScraper(persona=self.persona, use_proxy=True) as sc:
                    probe = BehaviorProbe(sc, url)

                    async def buttons():
                        try:
                            return await asyncio.wait_for(probe.ctas(), 240)
                        except Exception as e:
                            logger.warning(f"[{self.job_id}] button probe failed on {url}: {e!r}")
                            return []

                    # the page rules and the hidden button destinations are separate experiments
                    found, ctas = await asyncio.gather(asyncio.wait_for(probe.run(), 240), buttons())
            except Exception as e:
                logger.warning(f"[{self.job_id}] behaviour probe failed on {url}: {e!r}")
                continue
            notes += found["notes"]

            kept = []
            for rule in found["rules"]:
                dest = rule.pop("goto_url", None)
                if dest:
                    slug = await ensure_page(dest, depth, queue)
                    if not slug:
                        continue
                    rule["goto"] = slug
                kept.append(rule)
            for member in (page.get("group") or [page]):
                if kept and isinstance(member.get("shell"), dict):
                    member["shell"]["rules"] = kept

            wired = 0
            for c in ctas:
                if c["kind"] == "external":
                    attrs = ' data-vai-href="%s"' % c["url"].replace("&", "&amp;")
                else:
                    slug = await ensure_page(c["url"], depth, queue)
                    if not slug:
                        continue
                    attrs = ' data-vai-next="%s"' % slug
                if self._wire_cta(page["sections"], c["tag"], c["text"], c["nth"], attrs):
                    wired += 1
            if wired:
                notes.append(f"{wired} botão(ões) de {urlsplit(url).path or '/'} tinham o destino escondido no código da página original; liguei cada um no lugar certo.")
        return notes

    async def _run(self):
        try:
            await self.update_status("scanning", 5, "🔍 Abrindo página com navegador stealth...")

            queue: list[tuple[str, int]] = [(self.url, 0)]
            visited: set[str] = set()
            cloned: list[dict] = []  # [{url, slug, name, sections, page_css, thumbnail}]
            failed: list[dict] = []  # [{url, error}]
            variants: list[dict] = []  # the phone versions of pages, kept apart from the crawl
            used_slugs: set[str] = set()
            found_count = 1  # the starting URL itself
            is_funnel = False
            funnel_notes: list[str] = []

            while queue and len(cloned) < self.MAX_PAGES:
                url, depth = queue.pop(0)
                norm = normalize_url(url)
                if norm in visited:
                    continue
                visited.add(norm)

                is_home = len(cloned) == 0 and not failed
                self._pp_base = min(10 + int((len(cloned) / max(self.MAX_PAGES, 1)) * 80), 88)
                self._pp_span = max(5, min(78, 88 - self._pp_base))
                label = "Página inicial" if is_home else f"página {len(cloned) + len(failed) + 1}"
                await self.update_status(
                    "processing",
                    min(10 + int((len(cloned) / max(self.MAX_PAGES, 1)) * 80), 88),
                    f"🌐 Clonando {label}: {url}",
                    extra={"crawl_stats": {"found": found_count, "processed": len(cloned) + len(failed), "completed": len(cloned), "failed": len(failed)}},
                )

                try:
                    slug = self._slug_from_url(url, used_slugs)
                    page_result = await self._process_one_page(url, slug, capture_thumbnail=is_home, try_funnel=is_home)
                    if page_result.get("funnel"):
                        funnel_notes = page_result.get("notes") or []
                        for p in page_result["funnel"]:
                            cloned.append({
                                "url": p["url"], "slug": p["slug"], "name": p["name"], "sections": p["sections"],
                                "page_css": p["page_css"], "shell": p.get("shell"), "thumbnail": page_result["thumbnail"],
                            })
                        is_funnel = True
                        found_count = len(cloned)
                        break
                    cloned.append({
                        "url": url,
                        "slug": slug,
                        "name": "Página inicial" if slug == "home" else slug.replace("-", " ").title(),
                        "sections": page_result["sections"],
                        "page_css": page_result["page_css"],
                        "shell": page_result.get("shell"),
                        "thumbnail": page_result["thumbnail"],
                    })

                    # Some sites (Wix, Framer, many apps) build a DIFFERENT page for phones with scripts. One capture
                    # of the desktop page can never hold that, so the phone's own version is cloned too and served
                    # to phones (see renderClonePage).
                    mv = page_result.get("mobile_variant") or {}
                    if mv.get("needed") and not self.persona and isinstance(cloned[-1].get("shell"), dict):
                        try:
                            await self.update_status("processing", 60, "📱 O celular recebe uma página diferente: clonando a versão de celular...")
                            mres = await self._process_one_page(url, slug + "_m", capture_thumbnail=False, try_funnel=False, mobile=True)
                            vslug = f"{slug}__m"
                            variants.append({
                                "url": url, "slug": vslug,
                                "name": ("Página inicial" if slug == "home" else slug.replace("-", " ").title()) + " (celular)",
                                "sections": mres["sections"], "page_css": mres["page_css"],
                                "shell": {**(mres.get("shell") or {}), "variant": "mobile", "of": slug},
                                "thumbnail": None,
                            })
                            cloned[-1]["shell"]["mobileSlug"] = vslug
                            self._extra_notes.append("Esse site mostra uma página diferente no celular. Clonei as duas: quem abre no celular vê a versão de celular, e dá pra editar cada uma.")
                        except Exception as e:
                            logger.warning(f"[{self.job_id}] mobile version of {url} skipped: {e!r}")

                    if depth < self.MAX_DEPTH:
                        for link in page_result["internal_links"]:
                            link_norm = normalize_url(link)
                            if link_norm in visited or any(normalize_url(u) == link_norm for u, _ in queue):
                                continue
                            if found_count >= self.MAX_PAGES:
                                break
                            queue.append((link, depth + 1))
                            found_count += 1

                except Exception as e:
                    logger.warning(f"[{self.job_id}] Failed to clone {url}: {e}")
                    failed.append({"url": url, "error": str(e)})
                    await self.update_status(
                        "processing",
                        min(10 + int((len(cloned) / max(self.MAX_PAGES, 1)) * 80), 88),
                        f"⚠️ Falha ao clonar {url} — continuando com as outras páginas...",
                        extra={"crawl_stats": {"found": found_count, "processed": len(cloned) + len(failed), "completed": len(cloned), "failed": len(failed)}},
                    )

            if not cloned:
                # say WHY: the site refused us, the page does not exist, it was empty...
                why = failed[0]["error"] if failed else ""
                raise RuntimeError(why if why else "Nenhuma página pôde ser clonada.")

            if is_funnel and cloned:
                # one single-page app: what its entry page does when you try to leave, every step does
                cloned[0]["group"] = list(cloned)

            # Hidden rules of the entry page (exit intent, back button, timed redirects).
            rule_notes: list = []
            try:
                rule_notes = [] if _lab_fast() else await asyncio.wait_for(self._clone_rules(cloned, used_slugs, self.url), 900)
            except Exception as e:
                logger.warning(f"[{self.job_id}] rules step skipped: {e!r}")
            for v in variants:
                base = next((c for c in cloned if c["slug"] == (v.get("shell") or {}).get("of")), None)
                if base and isinstance(base.get("shell"), dict) and base["shell"].get("rules"):
                    v["shell"]["rules"] = base["shell"]["rules"]
            funnel_notes = funnel_notes + rule_notes + [n for n in self._extra_notes if n not in funnel_notes]

            if not is_funnel:
                await self.update_status("processing", 90, "🔗 Normalizando links internos entre as páginas...")
                url_to_slug = {normalize_url(p["url"]): p["slug"] for p in cloned}
                self._rewrite_internal_links(cloned + variants, url_to_slug)

            review = None
            if not is_funnel and not _lab_fast():
                await self.update_status("processing", 92, "🔎 Conferindo o clone com o original, no computador e no celular...")
                try:
                    review = await asyncio.wait_for(self._review_before_delivery(cloned, variants, url_to_slug), 330)
                except Exception as e:
                    logger.warning(f"[{self.job_id}] review before delivery skipped: {e!r}")

            await self.update_status("processing", 95, "📦 Finalizando clone...")

            result = {
                "pages": [
                    {"slug": p["slug"], "name": p["name"], "sections": p["sections"], "page_css": p["page_css"], "shell": p.get("shell")}
                    for p in cloned + variants
                ],
                "thumbnail": cloned[0]["thumbnail"],
                "crawlStats": {
                    "found": found_count,
                    "completed": len(cloned),
                    "failed": failed,
                },
            }

            if review:
                result["crawlStats"]["review"] = {k: review[k] for k in ("ok", "warnings", "items") if k in review}
                result["crawlStats"]["review"]["at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            if funnel_notes:
                result["crawlStats"]["notes"] = funnel_notes
            if is_funnel:
                result["funnel"] = {"steps": len(cloned), "notes": funnel_notes}
                done_msg = f"✅ Funil clonado! {len(cloned)} etapas" + (" (" + " ".join(funnel_notes) + ")" if funnel_notes else "") + "."
            else:
                done_msg = f"✅ Clonagem completa! {len(cloned)} página(s) clonada(s)" + (f", {len(failed)} falhou(aram)" if failed else "") + "."
            # Steps of a funnel share one stylesheet: ship it once.
            if is_funnel and result["pages"]:
                shared = result["pages"][0].get("page_css")
                result["shared_css"] = shared
                for p in result["pages"]:
                    # only the pages that really use the funnel's stylesheet (a gift page
                    # found through an exit rule has a stylesheet of its own)
                    if p.get("page_css") == shared:
                        p["page_css"] = None

            await self.update_status("processing", 97, "💾 Salvando o clone...")
            delivered = await self._deliver({"jobId": self.job_id, "projectId": self.project_id, "result": result})
            if delivered:
                # saved already: the browser only has to open it
                await self.update_status("done", 100, done_msg, extra={"delivered": True, "funnel": result.get("funnel")})
            else:
                await self.update_status("done", 100, done_msg, extra={"result": result})
            logger.info(f"[{self.job_id}] Scan complete: {len(cloned)} pages cloned, {len(failed)} failed, delivered={delivered}")

        except Exception as e:
            logger.exception(f"[{self.job_id}] Scan failed: {e}")
            await self._fail(str(e) or type(e).__name__)
