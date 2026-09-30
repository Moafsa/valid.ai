from loguru import logger
from typing import Optional
import re
from urllib.parse import urlparse

from services.playwright_scraper import PlaywrightScraper, normalize_url
from services.asset_uploader import AssetUploader
from services.progress_store import ProgressStore
from services.html_utils import rewrite_css_asset_urls, CSS_URL_RE


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

    def __init__(self, job_id: str, project_id: str, url: str, workspace_id: Optional[str] = None):
        self.job_id = job_id
        self.project_id = project_id
        self.url = url
        self.workspace_id = workspace_id
        self.progress = ProgressStore()
        self.uploader = AssetUploader()

    async def update_status(self, status: str, progress: int, step: str, extra: dict = None):
        event = {"job_id": self.job_id, "status": status, "progress": progress, "currentStep": step}
        if extra:
            event.update(extra)
        await self.progress.push_event(self.job_id, event)
        logger.info(f"[{self.job_id}] {progress}% - {step}")

    # ── Per-asset rehosting (used once per cloned page) ──────────────────

    async def _rehost_section_images(self, dom_html: str, images: list, page_label: str, section_index: int) -> str:
        """Downloads each real image once and rewrites the HTML to our own
        S3 URL — best-effort per image, one failure just leaves that <img>
        pointing at the original."""
        seen: dict[str, str] = {}
        for idx, img in enumerate(images[:20]):
            src = (img or {}).get("src")
            if not src or src in seen or src not in dom_html:
                continue
            ext = src.split("?")[0].rsplit(".", 1)[-1].lower()
            ext = ext if ext in ("png", "jpg", "jpeg", "webp", "gif", "svg") else "png"
            key = f"projects/{self.project_id}/assets/{page_label}_section_{section_index}_{idx}.{ext}"
            new_url = await self.uploader.rehost_url(src, key, referer=self.url)
            if new_url:
                seen[src] = new_url
        for old_url, new_url in seen.items():
            dom_html = dom_html.replace(old_url, new_url)
        return dom_html

    async def _rehost_video(self, video: dict, page_label: str) -> dict:
        """Downloads a native (self-hosted) video once and rehosts it to
        our own S3. HLS/embed URLs are left pointing at their real source."""
        url = video.get("url") or ""
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

    async def _rehost_page_css(self, page_css: str, page_label: str) -> str:
        """Downloads and rehosts every asset the captured page-level
        stylesheet references (background images AND self-hosted
        @font-face fonts), then rewrites the stylesheet to point at the
        rehosted copies."""
        if not page_css:
            return ""
        urls = {m.group(2).strip() for m in CSS_URL_RE.finditer(page_css)}
        urls = {u for u in urls if not u.startswith("data:")}
        url_map: dict[str, str] = {}
        for i, original in enumerate(urls):
            ext = original.split(".")[-1].split("?")[0][:5] or "asset"
            key = f"projects/{self.project_id}/css-assets/{page_label}_{i}.{ext}"
            new_url = await self.uploader.rehost_url(original, key, referer=self.url)
            if new_url:
                url_map[original] = new_url
        return rewrite_css_asset_urls(page_css, url_map)

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

    async def _process_one_page(self, url: str, page_label: str, capture_thumbnail: bool) -> dict:
        """Scrapes and fully processes ONE page — real DOM, real CSS,
        real assets rehosted. Raises on failure; the caller decides what
        happens to the rest of the crawl when that happens (nothing does,
        by design — see run())."""
        try:
            async with PlaywrightScraper(use_proxy=True) as scraper:
                scrape_result = await scraper.scrape_url(url, capture_thumbnail=capture_thumbnail)
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

        try:
            sections = scrape_result["sections"]
            processed = []
            for i, section in enumerate(sections):
                dom_html = (section.get("dom_html") or "").strip()
                if dom_html:
                    dom_html = await self._rehost_section_images(dom_html, section.get("images") or [], page_label, i)
                processed.append({
                    "id": f"{page_label}_section_{i}",
                    "type": "custom-html",
                    "order": i,
                    "generatedHtml": dom_html or None,
                    "screenshot": None,
                    "links": section.get("links") or [],
                })

            video = scrape_result.get("video")
            if video and video.get("url"):
                video = await self._rehost_video(video, page_label)
                processed.append({
                    "id": f"{page_label}_section_{len(processed)}",
                    "type": "vsl",
                    "order": len(processed),
                    "generatedHtml": self._video_block_html(video),
                    "screenshot": None,
                    "links": [],
                })

            page_css = await self._rehost_page_css(scrape_result.get("page_css") or "", page_label)
        except Exception as e:
            raise RuntimeError(f"Falha ao processar HTML/assets da página ({url}): {e}") from e

        font_links = scrape_result.get("font_links") or []
        if font_links and processed:
            links_html = "\n".join(f'<link rel="stylesheet" href="{href}">' for href in font_links[:5])
            target = next((p for p in processed if p.get("generatedHtml")), None)
            if target:
                target["generatedHtml"] = links_html + "\n" + target["generatedHtml"]

        return {
            "sections": processed,
            "page_css": page_css,
            "thumbnail": thumbnail_url,
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
        try:
            await self.update_status("scanning", 5, "🔍 Abrindo página com navegador stealth...")

            queue: list[tuple[str, int]] = [(self.url, 0)]
            visited: set[str] = set()
            cloned: list[dict] = []  # [{url, slug, name, sections, page_css, thumbnail}]
            failed: list[dict] = []  # [{url, error}]
            used_slugs: set[str] = set()
            found_count = 1  # the starting URL itself

            while queue and len(cloned) < self.MAX_PAGES:
                url, depth = queue.pop(0)
                norm = normalize_url(url)
                if norm in visited:
                    continue
                visited.add(norm)

                is_home = len(cloned) == 0 and not failed
                label = "Página inicial" if is_home else f"página {len(cloned) + len(failed) + 1}"
                await self.update_status(
                    "processing",
                    min(10 + int((len(cloned) / max(self.MAX_PAGES, 1)) * 80), 88),
                    f"🌐 Clonando {label}: {url}",
                    extra={"crawl_stats": {"found": found_count, "processed": len(cloned) + len(failed), "completed": len(cloned), "failed": len(failed)}},
                )

                try:
                    slug = self._slug_from_url(url, used_slugs)
                    page_result = await self._process_one_page(url, slug, capture_thumbnail=is_home)
                    cloned.append({
                        "url": url,
                        "slug": slug,
                        "name": "Página inicial" if slug == "home" else slug.replace("-", " ").title(),
                        "sections": page_result["sections"],
                        "page_css": page_result["page_css"],
                        "thumbnail": page_result["thumbnail"],
                    })

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
                raise RuntimeError("Nenhuma página pôde ser clonada.")

            await self.update_status("processing", 90, "🔗 Normalizando links internos entre as páginas...")
            url_to_slug = {normalize_url(p["url"]): p["slug"] for p in cloned}
            self._rewrite_internal_links(cloned, url_to_slug)

            await self.update_status("processing", 95, "📦 Finalizando clone...")

            result = {
                "pages": [
                    {"slug": p["slug"], "name": p["name"], "sections": p["sections"], "page_css": p["page_css"]}
                    for p in cloned
                ],
                "thumbnail": cloned[0]["thumbnail"],
                "crawlStats": {
                    "found": found_count,
                    "completed": len(cloned),
                    "failed": failed,
                },
            }

            await self.update_status(
                "done", 100,
                f"✅ Clonagem completa! {len(cloned)} página(s) clonada(s)" + (f", {len(failed)} falhou(aram)" if failed else "") + ".",
                extra={"result": result},
            )
            logger.info(f"[{self.job_id}] Scan complete: {len(cloned)} pages cloned, {len(failed)} failed")

        except Exception as e:
            logger.exception(f"[{self.job_id}] Scan failed: {e}")
            await self.update_status("error", 0, f"❌ Erro: {str(e)}", extra={"error": str(e)})
