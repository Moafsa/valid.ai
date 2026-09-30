from playwright.async_api import async_playwright, Browser, Page, Response
from loguru import logger
from typing import Optional, List
import asyncio
import base64
import re
from urllib.parse import urljoin, urlparse, urlunparse

from config import settings

# File extensions that are never "another page to clone" — following these
# would download binaries/stylesheets/etc. as if they were navigable pages.
_NON_PAGE_EXTENSIONS = (
    ".pdf", ".zip", ".rar", ".7z", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".bmp",
    ".mp4", ".webm", ".mov", ".avi", ".mp3", ".wav", ".ogg",
    ".css", ".js", ".json", ".xml", ".woff", ".woff2", ".ttf", ".eot",
)


def normalize_url(url: str) -> str:
    """
    Canonical form used for dedup/visited-tracking: strips the fragment
    (#section-anchor is the same page, not a different one), strips a
    trailing slash (except the bare root), lowercases the host. Query
    strings are kept — ?page=2 is treated as a distinct page on purpose,
    since it often genuinely is.
    """
    parsed = urlparse(url)
    path = parsed.path.rstrip("/") or "/"
    return urlunparse((parsed.scheme, parsed.netloc.lower(), path, "", parsed.query, ""))


def is_same_site(url: str, base_url: str) -> bool:
    """Same-domain check tolerant of a bare www. prefix difference —
    site.com and www.site.com are the same site for crawling purposes."""
    def _host(u: str) -> str:
        return urlparse(u).netloc.lower().removeprefix("www.")
    return _host(url) == _host(base_url)


def looks_like_page(url: str) -> bool:
    path = urlparse(url).path.lower()
    return not path.endswith(_NON_PAGE_EXTENSIONS)

# Matches any url(...) inside a raw CSS blob — background images,
# @font-face src, masks, all look identical to this: a bare url().
CSS_URL_RE = re.compile(r'url\((["\']?)([^)"\']+)\1\)', re.IGNORECASE)


def resolve_css_urls(css_text: str, base_url: str) -> str:
    """Rewrites relative url(...) references in a CSS blob to absolute,
    resolved against base_url — the stylesheet's own URL, or the page's URL
    for inline <style> tags."""
    def _sub(m: "re.Match") -> str:
        target = m.group(2).strip()
        if target.startswith(("data:", "http://", "https://")):
            return m.group(0)
        return f'url("{urljoin(base_url, target)}")'
    return CSS_URL_RE.sub(_sub, css_text)


class PlaywrightScraper:
    """
    Stealth browser scraper — captures the REAL DOM and CSS of a page,
    element by element, instead of reconstructing it via AI from a
    screenshot. This is the only way to get "100% idêntico": an AI model
    looking at a picture of a section always guesses layout/colors/spacing;
    the browser's own rendered DOM has the exact values already.
    """

    VIEWPORT = {"width": 1440, "height": 900}
    USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    )

    def __init__(self, use_proxy: bool = False):
        self.use_proxy = use_proxy and bool(settings.PROXY_URL)
        self.browser: Optional[Browser] = None
        self._playwright = None

    async def __aenter__(self):
        self._playwright = await async_playwright().start()
        launch_kwargs = {"headless": True}
        if self.use_proxy:
            launch_kwargs["proxy"] = {"server": settings.PROXY_URL}
        self.browser = await self._playwright.chromium.launch(**launch_kwargs)
        return self

    async def __aexit__(self, *exc):
        if self.browser:
            await self.browser.close()
        if self._playwright:
            await self._playwright.stop()

    async def get_page(self) -> Page:
        context = await self.browser.new_context(
            viewport=self.VIEWPORT,
            user_agent=self.USER_AGENT,
        )
        # Caps setTimeout/setInterval delays so countdown/reveal timers on
        # the source page fire almost immediately, before we capture —
        # otherwise urgency banners/hidden offers that only reveal after
        # N seconds would be captured still-hidden.
        await context.add_init_script("""
            (() => {
                const cap = (fn) => function(cb, delay, ...args) {
                    return fn(cb, Math.min(delay || 0, 300), ...args);
                };
                window.setTimeout = cap(window.setTimeout.bind(window));
                window.setInterval = cap(window.setInterval.bind(window));
            })();
        """)
        page = await context.new_page()
        return page

    async def _goto_resilient(self, page: Page, url: str, timeout: int = 45000):
        """`wait_until="networkidle"` never resolves on pages with continuous
        background network activity (pixels, chat widgets, polling) — load
        the page, then make a best-effort short attempt at networkidle
        that's allowed to fail without aborting the whole scrape."""
        await page.goto(url, wait_until="load", timeout=timeout)
        try:
            await page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass

    async def _expand_accordions(self, page: Page):
        """Clicks accordion/tab/disclosure triggers so their content is
        actually IN the DOM before capture.

        _reveal_hidden (below) only fixes CSS-collapsed content — it can't
        help when a framework only MOUNTS the panel on click (React/Vue
        state, e.g. `{isOpen && <div>...}`), which is common enough that a
        multi-item FAQ often only has its first, default-open item's answer
        in the DOM at all. The rest simply aren't there yet, no CSS trick
        recovers content that was never sent.

        Clicking arbitrary buttons on someone else's live site is real risk
        (a real form submit, a real "add to cart", a real WhatsApp/mailto
        handoff) — this only clicks elements that look like pure UI-state
        toggles: not inside a <form>, not type=submit, not wrapping a real
        link, and not matching an action-word denylist. If a click still
        causes a navigation, the URL is restored immediately and nothing
        else about it is trusted.
        """
        clicked = await page.evaluate("""
            async () => {
                const DENYLIST = /comprar|compre|carrinho|checkout|finalizar|assinar|assinatura|pagar|pagamento|enviar|submit|cadastr|confirmar pedido|whatsapp|login|entrar|sign in|sign up|baixar|download|compartilhar|share|excluir|deletar|remover|cancelar|logout|sair/i;
                const originalHref = location.href;

                // A gallery thumbnail is also just a <button> — indistinguishable
                // from an accordion trigger until it's clicked and a full-screen
                // lightbox appears. With no script left to close it, that lightbox
                // would otherwise stay open forever in the capture, blocking
                // every section behind it. Close/hide anything that suddenly
                // covers most of the viewport at fixed position immediately
                // after each click, before it can do that.
                function closeStrayOverlays() {
                    const vw = window.innerWidth, vh = window.innerHeight;
                    let found = false;
                    document.querySelectorAll('*').forEach(el => {
                        if (getComputedStyle(el).position !== 'fixed') return;
                        const r = el.getBoundingClientRect();
                        if ((r.width * r.height) / (vw * vh) > 0.6) {
                            el.style.setProperty('display', 'none', 'important');
                            found = true;
                        }
                    });
                    return found;
                }

                // This site (like most) has no aria-expanded to tell an
                // already-open accordion from a closed one, so every button
                // gets clicked once regardless of its current state. If that
                // click SHRANK the page, it just toggled something CLOSED
                // (collapsing content that was already open, or unmounting
                // it entirely in a React-conditional-render accordion) —
                // click it again to put it back. Comparing scrollHeight
                // before/after is a plain, framework-agnostic way to tell
                // "revealed more content" from "hid what was there" without
                // needing to know anything about this site's markup.
                const candidates = Array.from(document.querySelectorAll('button, [role="tab"], [role="button"]'));
                let clicked = 0;
                const MAX_CLICKS = 40;
                for (const el of candidates) {
                    if (clicked >= MAX_CLICKS) break;
                    if (el.closest('form')) continue;
                    if (el.getAttribute('type') === 'submit') continue;
                    if (el.closest('a[href]')) continue;
                    const text = (el.textContent || '').trim();
                    if (DENYLIST.test(text)) continue;

                    const beforeHeight = document.body.scrollHeight;
                    try { el.click(); } catch (e) { continue; }
                    clicked++;
                    await new Promise(r => setTimeout(r, 40));
                    if (location.href !== originalHref) {
                        try { history.pushState(null, '', originalHref); } catch (e) {}
                    }
                    closeStrayOverlays();

                    if (document.body.scrollHeight < beforeHeight - 5) {
                        try { el.click(); } catch (e) {}
                        await new Promise(r => setTimeout(r, 40));
                        closeStrayOverlays();
                    }
                }
                await new Promise(r => setTimeout(r, 150));
                closeStrayOverlays();
                return clicked;
            }
        """)
        if clicked:
            logger.info(f"Expanded {clicked} accordion/tab-like element(s) before capture")

    async def _close_stray_overlays(self, page: Page):
        """Hides any position:fixed element covering most of the viewport —
        almost certainly a lightbox/modal/off-canvas nav drawer, never
        legitimate page content. Needed as its own pass (not just inside
        _expand_accordions) because _reveal_hidden's "unhide anything
        display:none" logic runs AFTER that and doesn't know the
        difference between lazy-hidden content and a nav drawer that's
        SUPPOSED to be closed — it happily reopens one this already closed.
        """
        closed = await page.evaluate("""
            () => {
                const vw = window.innerWidth, vh = window.innerHeight;
                let found = false;
                document.querySelectorAll('*').forEach(el => {
                    if (getComputedStyle(el).position !== 'fixed') return;
                    const r = el.getBoundingClientRect();
                    if ((r.width * r.height) / (vw * vh) > 0.6) {
                        el.style.setProperty('display', 'none', 'important');
                        found = true;
                    }
                });
                return found;
            }
        """)
        if closed:
            logger.info("Closed a stray full-viewport overlay before capture")

    async def _reveal_hidden(self, page: Page):
        """Forces anything hidden behind a timer/condition visible before
        capture, so a clone doesn't ship permanently-hidden content.

        Also forces open anything collapsed via a clipped max-height or
        grid-template-rows (the standard CSS accordion technique — an FAQ
        panel or expandable section sitting at max-height:0/overflow:hidden
        until a JS class toggle opens it). The original toggle script is
        gone by the time this ships (sanitize() strips every <script>), so
        an accordion that's merely reproduced as-is stays permanently
        collapsed with no way to open it. Forcing it open trades "click to
        expand" for "just always readable" — worse than a real accordion,
        but far better than content nobody can ever see.
        """
        await page.evaluate("""
            () => {
                document.querySelectorAll('*').forEach(el => {
                    const cs = getComputedStyle(el);
                    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') {
                        el.style.setProperty('display', cs.display === 'none' ? 'block' : cs.display, 'important');
                        el.style.setProperty('visibility', 'visible', 'important');
                        el.style.setProperty('opacity', '1', 'important');
                    }

                    if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') {
                        const maxH = parseFloat(cs.maxHeight);
                        const rows = cs.gridTemplateRows;
                        const clippedByMaxHeight = !isNaN(maxH) && isFinite(maxH) && maxH < el.scrollHeight - 2;
                        const clippedByGridRows = /^\\d/.test(rows) && parseFloat(rows) < el.scrollHeight - 2;
                        if (clippedByMaxHeight || clippedByGridRows) {
                            el.style.setProperty('max-height', 'none', 'important');
                            el.style.setProperty('grid-template-rows', '1fr', 'important');
                            el.style.setProperty('overflow', 'visible', 'important');
                        }
                    }
                });
            }
        """)

    async def _scroll_page(self, page: Page):
        await page.evaluate("""
            async () => {
                await new Promise((resolve) => {
                    let total = 0;
                    const step = 300;
                    const timer = setInterval(() => {
                        window.scrollBy(0, step);
                        total += step;
                        if (total >= document.body.scrollHeight) {
                            clearInterval(timer);
                            window.scrollTo(0, 0);
                            resolve();
                        }
                    }, 100);
                });
            }
        """)
        await page.wait_for_timeout(800)

    async def capture_page_css(self, page: Page, sniffed_stylesheets: Optional[List[Response]] = None) -> str:
        """
        The page's REAL stylesheet text (every inline <style> tag, plus
        every external stylesheet the network sniffer caught) — this is
        what preserves :hover/:focus, ::before/::after, @media breakpoints,
        @keyframes and CSS variables, none of which a per-element
        computed-style snapshot can represent.
        """
        inline_css = await page.evaluate(
            "() => Array.from(document.querySelectorAll('style')).map(s => s.textContent || '').join('\\n')"
        )
        parts = [resolve_css_urls(inline_css, page.url)]
        for response in sniffed_stylesheets or []:
            try:
                text = await response.text()
                parts.append(resolve_css_urls(text, response.url))
            except Exception:
                pass
        return "\n".join(p for p in parts if p).strip()

    async def capture_font_links(self, page: Page) -> List[str]:
        """Google Fonts <link> tags — the common case, safe to link
        directly rather than rehost."""
        return await page.evaluate("""
            () => Array.from(document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]'))
                .map(l => l.href)
        """)

    async def _capture_sections(self, page: Page) -> List[dict]:
        """
        Splits the page into visual sections and, for each, captures its
        REAL outerHTML with every element's computed style inlined
        (STYLE_PROPS) — a safety net for whatever the page-level captured
        stylesheet doesn't cleanly cover once rendered standalone.

        Deliberately NOT including 'width': an inline style attribute beats
        any external stylesheet rule regardless of selector specificity,
        including rules inside @media queries — baking in the ONE desktop
        width computed for every element made every clone rigid at that
        exact viewport, overriding the real (already-captured) responsive
        CSS and breaking mobile entirely. max-width is kept (constraints
        like Tailwind's max-w-4xl are usually intentional either way).
        """
        sections = await page.evaluate("""
            () => {
                const STYLE_PROPS = [
                    'color', 'background-color', 'background-image', 'background-size', 'background-position',
                    'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
                    'text-align', 'text-decoration', 'text-transform', 'letter-spacing', 'text-shadow',
                    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
                    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
                    'border-radius', 'border-width', 'border-style', 'border-color',
                    'display', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'gap',
                    'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
                    'max-width', 'min-height', 'box-shadow', 'opacity', 'object-fit',
                    'position', 'top', 'right', 'bottom', 'left', 'z-index',
                    'transform', 'transform-origin', 'filter', 'backdrop-filter', 'clip-path',
                    'cursor', 'overflow', 'aspect-ratio',
                ];

                function inlineComputedStyles(root) {
                    const nodes = [root, ...root.querySelectorAll('*')];
                    for (const node of nodes) {
                        const cs = getComputedStyle(node);
                        let styleStr = '';
                        for (const prop of STYLE_PROPS) {
                            const v = cs.getPropertyValue(prop);
                            if (v) styleStr += prop + ':' + v + ';';
                        }
                        node.setAttribute('style', styleStr);
                    }
                }

                function freezeCanvases(root) {
                    // A <canvas> (a JS-driven starfield, particle effect,
                    // WebGL background...) has no visual content in its
                    // outerHTML — the pixels only exist in its backing
                    // bitmap, and sanitize() below strips the <script> that
                    // drew them anyway. Baking the CURRENT frame in as a
                    // static <img> (freezing the animation, not restoring
                    // it) beats what's there today: an empty, invisible tag
                    // where a whole visual layer used to be.
                    const canvases = root.tagName === 'CANVAS' ? [root] : [...root.querySelectorAll('canvas')];
                    for (const canvas of canvases) {
                        try {
                            const dataUrl = canvas.toDataURL('image/png');
                            const img = document.createElement('img');
                            img.src = dataUrl;
                            img.className = canvas.className;
                            const existingStyle = canvas.getAttribute('style');
                            if (existingStyle) img.setAttribute('style', existingStyle);
                            canvas.replaceWith(img);
                        } catch (e) {
                            // Tainted canvas (drew cross-origin pixels without
                            // CORS) — toDataURL throws, nothing recoverable.
                        }
                    }
                }

                function sanitize(root) {
                    root.querySelectorAll('script, noscript').forEach(n => n.remove());
                    const nodes = [root, ...root.querySelectorAll('*')];
                    for (const node of nodes) {
                        for (const attr of [...node.attributes]) {
                            const name = attr.name.toLowerCase();
                            if (name.startsWith('on')) node.removeAttribute(attr.name);
                            if (name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:')) {
                                node.removeAttribute('href');
                            }
                        }
                    }
                    // a.href (not getAttribute) is the browser-RESOLVED
                    // absolute URL — writing that back means the captured
                    // HTML's href is always absolute, never a bare
                    // relative path like "/sobre" that would resolve
                    // against OUR domain once hosted there instead of the
                    // original site. This also makes the attribute match
                    // exactly what the separately-captured `links` array
                    // records, which the orchestrator's link-rewrite pass
                    // depends on for exact-string replacement.
                    root.querySelectorAll('a[href]').forEach(a => {
                        if (a.href) a.setAttribute('href', a.href);
                    });
                    root.querySelectorAll('img').forEach(img => {
                        const real = img.currentSrc || img.src;
                        if (real) img.setAttribute('src', real);
                        img.removeAttribute('srcset');
                        img.removeAttribute('loading');
                    });
                    // Any OTHER element with a src content attribute —
                    // <video>/<source>/<audio>/<iframe>/<embed>/<track> —
                    // exposes a .src IDL property that resolves it to an
                    // absolute URL the same way img.src does. Missing this
                    // was a real bug: a page's secondary/carousel <video
                    // src="/relative/path.mp4"> (anything other than the
                    // ONE video _detect_video already grounds separately)
                    // kept a relative src that resolves against OUR domain
                    // once hosted there, breaking silently instead of
                    // playing the original file.
                    root.querySelectorAll('video[src], source[src], audio[src], iframe[src], embed[src], track[src]').forEach(el => {
                        const real = el.src;
                        if (real) el.setAttribute('src', real);
                    });
                }

                function captureRealHtml(el) {
                    try {
                        freezeCanvases(el);
                        sanitize(el);
                        inlineComputedStyles(el);
                        return el.outerHTML;
                    } catch (e) {
                        return '';
                    }
                }

                const candidates = [
                    ...document.querySelectorAll(
                        'section, [class*="section"], [class*="block"], [class*="hero"], ' +
                        '[class*="benefit"], [class*="testimonial"], [class*="faq"], ' +
                        '[class*="cta"], [class*="footer"], header, footer, main > div'
                    )
                ];

                return candidates
                    .filter(el => {
                        const rect = el.getBoundingClientRect();
                        const style = window.getComputedStyle(el);
                        return (
                            rect.height > 100 &&
                            rect.width > 400 &&
                            style.display !== 'none' &&
                            style.visibility !== 'hidden'
                        );
                    })
                    .map((el, i) => ({
                        index: i,
                        tag: el.tagName,
                        className: el.className.substring(0, 100),
                        rect: el.getBoundingClientRect(),
                        images: Array.from(el.querySelectorAll('img')).slice(0, 20).map(img => ({
                            src: img.currentSrc || img.src || '',
                            alt: img.alt || '',
                        })).filter(i => i.src),
                        links: Array.from(el.querySelectorAll('a[href]')).slice(0, 20).map(a => ({
                            href: a.href || '',
                            text: (a.textContent || '').trim().slice(0, 80),
                        })).filter(l => l.href && !l.href.startsWith('javascript:')),
                        domHtml: captureRealHtml(el),
                    }));
            }
        """)

        results = []
        page_height = await page.evaluate("document.body.scrollHeight")

        if not sections:
            chunk_size = 900
            num_chunks = max(1, page_height // chunk_size)
            for i in range(num_chunks):
                y = i * chunk_size
                await page.evaluate(f"window.scrollTo(0, {y})")
                await page.wait_for_timeout(200)
                shot = await page.screenshot(clip={
                    "x": 0, "y": 0, "width": self.VIEWPORT["width"],
                    "height": min(chunk_size, page_height - y),
                })
                results.append({
                    "name": f"section_{i+1}",
                    "screenshot_b64": base64.b64encode(shot).decode(),
                    "dom_html": "", "images": [], "links": [],
                })
            return results

        for section in sections[:20]:
            try:
                rect = section["rect"]
                if rect["height"] < 50:
                    continue
                results.append({
                    "name": f"section_{section['index']+1}_{section['tag'].lower()}",
                    "class_hint": section["className"],
                    "images": section.get("images", []),
                    "links": section.get("links", []),
                    "dom_html": section.get("domHtml", ""),
                })
            except Exception as e:
                logger.warning(f"Failed to process section {section}: {e}")

        return results

    async def discover_internal_links(self, page: Page, base_url: str) -> List[str]:
        """
        Every same-site, page-like link found ANYWHERE on the page (not
        just inside a captured section — nav/footer links matter most here
        and are usually outside the section boundaries used for content
        capture). Deliberately does NOT filter by "looks like a funnel
        step" the way the old single-purpose funnel crawler did — this is
        a general site crawler now, following whatever the site actually
        links to. External domains, mailto:/tel:/javascript:, and
        same-page #anchors are excluded at the source (no point queuing
        something that's never going to be same-site anyway).
        """
        raw_links = await page.evaluate("""
            (base) => {
                const baseUrl = new URL(base);
                const out = [];
                for (const a of document.querySelectorAll('a[href]')) {
                    const raw = a.getAttribute('href') || '';
                    if (!raw || raw.startsWith('#')) continue;
                    let href;
                    try { href = new URL(raw, base); } catch { continue; }
                    if (href.protocol.startsWith('javascript') || href.protocol === 'mailto:' || href.protocol === 'tel:') continue;
                    out.push(href.href);
                }
                return out;
            }
        """, base_url)

        seen = set()
        result = []
        for link in raw_links:
            if not is_same_site(link, base_url) or not looks_like_page(link):
                continue
            norm = normalize_url(link)
            if norm in seen:
                continue
            seen.add(norm)
            result.append(link)
        return result

    async def scrape_url(self, url: str, capture_thumbnail: bool = True) -> dict:
        """Loads a page and returns everything needed to clone it: real
        per-section DOM+images+links, the page's own real stylesheet, its
        Google Fonts links, and every same-site link found on it (for the
        orchestrator's crawl queue)."""
        logger.info(f"Scraping URL: {url}")
        page = await self.get_page()

        sniffed_stylesheets: List[Response] = []
        # VSL/embedded-video players (VTurb/Panda-style) almost always stream
        # through a MediaSource/blob URL, so <video>.src is just "blob:..."
        # — useless as a link. The real .mp4/.m3u8 the browser is actually
        # fetching only shows up on the network.
        sniffed_videos: List[dict] = []

        def _on_response(response):
            try:
                url_l = response.url.lower().split("?")[0]
                ctype = (response.headers or {}).get("content-type", "").lower()
                if url_l.endswith(".css") or "text/css" in ctype:
                    sniffed_stylesheets.append(response)
                elif url_l.endswith(".m3u8") or "mpegurl" in ctype:
                    sniffed_videos.append({"url": response.url, "kind": "hls"})
                elif url_l.endswith(".mp4") or ctype.startswith("video/"):
                    sniffed_videos.append({"url": response.url, "kind": "mp4"})
            except Exception:
                pass

        page.on("response", _on_response)

        try:
            await self._goto_resilient(page, url)
            await page.wait_for_timeout(1500)
            await self._scroll_page(page)
            await self._expand_accordions(page)
            await self._reveal_hidden(page)
            await self._close_stray_overlays(page)

            # Real content first — sections, CSS, video. A heavy/very tall
            # real-world page (huge product pages, lots of media) can make
            # the vanity thumbnail below time out; that must never cost us
            # the actual capture, which is the whole point of the clone.
            sections = await self._capture_sections(page)
            font_links = await self.capture_font_links(page)
            page_css = await self.capture_page_css(page, sniffed_stylesheets)
            video = await self._detect_video(page, sniffed_videos)
            internal_links = await self.discover_internal_links(page, url)

            # Thumbnail: viewport-only (not full_page) — dramatically
            # cheaper on a tall page, and non-fatal if it still times out.
            # Only needed once per project (the home page), not for every
            # crawled page — skip it entirely there to keep a multi-page
            # crawl from paying this cost N times.
            full_screenshot_b64 = None
            if capture_thumbnail:
                try:
                    full_screenshot_bytes = await page.screenshot(timeout=15000)
                    full_screenshot_b64 = base64.b64encode(full_screenshot_bytes).decode()
                except Exception as e:
                    logger.warning(f"Thumbnail screenshot failed (non-fatal): {e}")

            logger.info(f"Scrape complete: {len(sections)} sections found, video={bool(video)}, {len(internal_links)} internal links")

            return {
                "full_screenshot_b64": full_screenshot_b64,
                "sections": sections,
                "font_links": font_links,
                "page_css": page_css,
                "video": video,
                "internal_links": internal_links,
            }
        finally:
            await page.close()

    async def _detect_video(self, page: Page, sniffed_videos: Optional[List[dict]] = None) -> Optional[dict]:
        """
        Real video capture, not a placeholder: checks the DOM for a plain
        <video src> or a known video-embed <iframe> (YouTube/Vimeo/Wistia/
        VTurb/Panda-style players) first. If the DOM video's src is a
        useless blob: URL (VTurb/Panda MediaSource players), falls back to
        whatever real .mp4/.m3u8 the network sniffer caught instead.
        """
        dom_video = await page.evaluate("""
            () => {
                const v = document.querySelector('video');
                if (v && (v.currentSrc || v.src)) {
                    return { type: 'native', url: v.currentSrc || v.src, poster: v.poster || null, duration: v.duration || null };
                }
                const EMBED_HOSTS = ['youtube.com', 'youtube-nocookie.com', 'vimeo.com', 'wistia.com', 'wistia.net', 'fast.wistia.net'];
                const iframes = Array.from(document.querySelectorAll('iframe[src]'));
                for (const f of iframes) {
                    try {
                        const host = new URL(f.src).hostname;
                        if (EMBED_HOSTS.some(h => host.includes(h))) {
                            return { type: 'iframe', url: f.src, poster: null, duration: null };
                        }
                    } catch {}
                }
                return null;
            }
        """)

        is_unusable = not dom_video or (dom_video.get("type") == "native" and (dom_video.get("url") or "").startswith("blob:"))
        if is_unusable and sniffed_videos:
            hls = next((v for v in sniffed_videos if v["kind"] == "hls"), None)
            mp4 = next((v for v in sniffed_videos if v["kind"] == "mp4"), None)
            picked = hls or mp4
            if picked:
                poster = (dom_video or {}).get("poster")
                duration = (dom_video or {}).get("duration")
                return {"type": "native", "url": picked["url"], "poster": poster, "duration": duration, "hls": picked["kind"] == "hls"}

        return dom_video if not is_unusable else None
