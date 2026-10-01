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
                //
                // Either way (grew, or shrank-then-restored), a scrollHeight
                // change PROVES this button is a real, working toggle on
                // the original site — most of which, like this one, never
                // exposed that via aria-expanded/aria-controls (no a11y
                // markup at all). Tagging the button and its best-guess
                // panel with our own data-vai-toggle-* pair right here, at
                // the one moment we can actually observe cause and effect,
                // is what lets the published clone rebuild a real
                // open/close click — not just "force everything visible
                // forever" — without knowing anything about this site's
                // CSS/framework. interactive-runtime.tsx reads these tags
                // client-side.
                const candidates = Array.from(document.querySelectorAll('button, [role="tab"], [role="button"]'));
                let clicked = 0;
                let toggleIdx = 0;
                // A LOT of accordions only ever keep ONE item's panel
                // mounted at a time (opening item 2 unmounts item 1's
                // answer entirely — very common FAQ behavior). Clicking
                // through every candidate in sequence means an EARLIER
                // item's panel can vanish from the DOM by the time this
                // loop reaches a LATER one, taking our just-set
                // data-vai-toggle-panel tag with it — the final capture
                // would then only ever contain the LAST item's answer.
                // Snapshotting each panel's HTML the moment it's tagged,
                // then re-injecting any that went missing once the whole
                // loop is done, is what lets every item's real answer
                // survive into the static clone instead of just one.
                const capturedPanels = [];
                const MAX_CLICKS = 40;
                // A hamburger/mobile-nav toggle is just a <button> too, so
                // it's indistinguishable from an accordion trigger by the
                // checks above — and clicking it "succeeds" by this
                // function's own logic (it genuinely reveals more content,
                // growing the page). But we only ever scan at ONE desktop
                // viewport width, and a mobile nav's open state was never
                // designed to render at that width: it leaves the header
                // in a broken hybrid (an "open" class meant for a narrow
                // column dropdown, applied to a full desktop-width bar),
                // exactly what shipped a mangled, overflowing header on a
                // real clone. The naming convention for this control is
                // consistent enough across sites (class names, aria-label)
                // that it's worth excluding outright rather than letting
                // the generic reveal heuristic decide.
                const MENU_TOGGLE = /burger|hamburger|menu-toggle|nav-toggle|mobile-menu|toggle-menu/i;
                const MENU_LABEL = /\bmenu\b/i;
                for (const el of candidates) {
                    if (clicked >= MAX_CLICKS) break;
                    if (el.closest('form')) continue;
                    if (el.getAttribute('type') === 'submit') continue;
                    if (el.closest('a[href]')) continue;
                    if (MENU_TOGGLE.test(el.className)) continue;
                    if (MENU_LABEL.test(el.getAttribute('aria-label') || '')) continue;
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

                    const grew = document.body.scrollHeight > beforeHeight + 5;
                    const shrank = document.body.scrollHeight < beforeHeight - 5;
                    let provenToggle = grew;

                    if (shrank) {
                        try { el.click(); } catch (e) {}
                        await new Promise(r => setTimeout(r, 40));
                        closeStrayOverlays();
                        provenToggle = true;
                    }

                    if (provenToggle) {
                        const controlsId = el.getAttribute('aria-controls');
                        let panel = controlsId ? document.getElementById(controlsId) : null;
                        if (!panel) panel = el.nextElementSibling || (el.parentElement ? el.parentElement.lastElementChild : null);
                        if (panel && panel !== el && !panel.contains(el) && !el.contains(panel)) {
                            el.setAttribute('data-vai-toggle-btn', String(toggleIdx));
                            panel.setAttribute('data-vai-toggle-panel', String(toggleIdx));
                            capturedPanels.push({ idx: toggleIdx, html: panel.outerHTML });
                            toggleIdx++;
                        }
                    }
                }

                let restored = 0;
                for (const { idx, html } of capturedPanels) {
                    if (document.querySelector('[data-vai-toggle-panel="' + idx + '"]')) continue;
                    const btn = document.querySelector('[data-vai-toggle-btn="' + idx + '"]');
                    if (!btn || !btn.parentElement) continue;
                    const wrapper = document.createElement('div');
                    wrapper.innerHTML = html;
                    const panel = wrapper.firstElementChild;
                    if (!panel) continue;
                    // Closed by default: an exclusive accordion's real
                    // default state is "only one (or none) open", and
                    // display:none here is exactly what a fresh click on
                    // this same button will lift via interactive-runtime.tsx.
                    panel.style.setProperty('display', 'none', 'important');
                    btn.insertAdjacentElement('afterend', panel);
                    restored++;
                }

                await new Promise(r => setTimeout(r, 150));
                closeStrayOverlays();
                return { clicked, tagged: toggleIdx, restored };
            }
        """)
        if clicked and clicked.get("clicked"):
            logger.info(
                f"Expanded {clicked['clicked']} accordion/tab-like element(s), "
                f"tagged {clicked['tagged']} as click-to-toggle "
                f"({clicked['restored']} panel(s) re-injected after an exclusive-accordion click unmounted them) before capture"
            )

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
                // A crossfade carousel (testimonial sliders, rotating
                // banners) typically stacks EVERY slide at the exact same
                // position:absolute spot and hides all but the active one
                // via opacity:0 — structurally identical to "hidden behind
                // a timer" as far as the checks below can tell, but
                // force-revealing all of them stacks every slide directly
                // on top of each other into one unreadable overlapping
                // mess instead of the single readable slide a real visitor
                // sees. Detect sibling elements hidden this way that share
                // a parent AND an identical bounding box, and only let the
                // first one in each such cluster through to the reveal
                // pass below — the rest stay hidden, which is a correct,
                // readable single slide instead of ten stacked ones.
                const hiddenInfo = Array.from(document.querySelectorAll('*')).map(el => {
                    const cs = getComputedStyle(el);
                    const isHidden = cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0';
                    return isHidden ? { el, rect: el.getBoundingClientRect(), parent: el.parentElement } : null;
                }).filter(Boolean);

                const skip = new Set();
                for (let i = 0; i < hiddenInfo.length; i++) {
                    if (skip.has(hiddenInfo[i].el)) continue;
                    const a = hiddenInfo[i].rect;
                    if (a.width <= 0 || a.height <= 0) continue;
                    for (let j = i + 1; j < hiddenInfo.length; j++) {
                        if (skip.has(hiddenInfo[j].el)) continue;
                        if (hiddenInfo[i].parent !== hiddenInfo[j].parent) continue;
                        const b = hiddenInfo[j].rect;
                        const samePos = Math.abs(a.left - b.left) < 4 && Math.abs(a.top - b.top) < 4 &&
                            Math.abs(a.width - b.width) < 4 && Math.abs(a.height - b.height) < 4;
                        if (samePos) skip.add(hiddenInfo[j].el);
                    }
                }

                // A mobile hamburger/nav-toggle button is display:none by
                // design at our scan viewport (always a desktop width) —
                // that's correct, responsive behavior, not "content nobody
                // could ever see." Forcing it visible just leaves a dead,
                // non-functional icon floating in an otherwise-correct
                // desktop header. Same naming heuristic _expand_accordions
                // already uses to avoid clicking it.
                const MENU_TOGGLE = /burger|hamburger|menu-toggle|nav-toggle|mobile-menu|toggle-menu/i;
                const MENU_LABEL = /\\bmenu\\b/i;
                const isMenuToggle = el => MENU_TOGGLE.test(el.className) || MENU_LABEL.test(el.getAttribute('aria-label') || '');

                document.querySelectorAll('*').forEach(el => {
                    const cs = getComputedStyle(el);
                    if (!skip.has(el) && !isMenuToggle(el) && (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')) {
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

    _CAPTURE_SETUP_JS = """
        () => {
            window.__vaiStyleProps = [
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

            // Deliberately NOT including 'width': an inline style attribute
            // beats any external stylesheet rule regardless of selector
            // specificity, including rules inside @media queries — baking
            // in the ONE desktop width computed for every element made
            // every clone rigid at that exact viewport, breaking mobile
            // entirely. max-width is kept (Tailwind's max-w-4xl etc. is
            // usually intentional either way).
            window.__vaiInlineComputedStyles = function (root) {
                const nodes = [root, ...root.querySelectorAll('*')];
                const vw = window.innerWidth, vh = window.innerHeight;
                for (const node of nodes) {
                    const cs = getComputedStyle(node);
                    const isPositioned = cs.position === 'absolute' || cs.position === 'fixed';
                    // getComputedStyle always resolves an unset "auto"
                    // offset into a concrete pixel value matching the
                    // CURRENT layout — a box anchored with only `right`
                    // (content sizes itself, left stays auto) still
                    // reports a real `left` value here. We don't bake
                    // width/height, so writing BOTH left and right turns
                    // "anchored from one side, sized by content" into
                    // "stretched/squeezed between two fixed points" — this
                    // shrank a "role para descobrir" hint to a 37px-wide
                    // column of single words. But a header/overlay that's
                    // genuinely meant to span (near) the full viewport —
                    // rect already close to vw/vh before touching anything
                    // — needs left AND right kept, or its own flex/grid
                    // children (e.g. a `justify-content: space-between`
                    // nav) lose the width they lay themselves out against
                    // and the whole bar overflows sideways instead. Only
                    // let small elements (the common case: a badge, a
                    // hint, a floating button) shrink-wrap.
                    const rect = node.getBoundingClientRect();
                    const spansWidth = rect.width > vw * 0.6;
                    const spansHeight = rect.height > vh * 0.6;
                    let styleStr = '';
                    for (const prop of window.__vaiStyleProps) {
                        let v = cs.getPropertyValue(prop);
                        if (isPositioned && prop === 'right' && !spansWidth) v = 'auto';
                        if (isPositioned && prop === 'bottom' && !spansHeight) v = 'auto';
                        if (v) styleStr += prop + ':' + v + ';';
                    }
                    // <img> is the one element where skipping width/height
                    // backfires: its real size often isn't set by any
                    // single CSS rule at all — a `max-width:100%; height:
                    // auto` reset constrains it RELATIVE to whatever space
                    // its flex/grid container hands it, math that only
                    // exists in the full original page layout. Outside
                    // that context all that's left is the image's own
                    // intrinsic file resolution — a logo exported at 4x
                    // for retina renders 4x too big. getComputedStyle
                    // already resolved that relative math into exact
                    // pixels for THIS element specifically, so baking
                    // width/height only for <img> fixes this without
                    // reintroducing the "whole page rigid at one viewport"
                    // regression that excluding width from every element
                    // was meant to avoid.
                    if (node.tagName === 'IMG') {
                        styleStr += 'width:' + cs.width + ';height:' + cs.height + ';';
                    }
                    node.setAttribute('style', styleStr);
                }
            };

            // A <canvas> (JS-driven starfield, particle effect, WebGL
            // background...) has no visual content in its outerHTML — the
            // pixels only exist in its backing bitmap, and sanitize() below
            // strips the <script> that drew them anyway. Baking the CURRENT
            // frame in as a static <img> (freezing the animation, not
            // restoring it) beats an empty, invisible tag.
            window.__vaiFreezeCanvases = function (root) {
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
                        // Tainted canvas (cross-origin pixels, no CORS) —
                        // toDataURL throws, nothing recoverable.
                    }
                }
            };

            window.__vaiSanitize = function (root) {
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
                // a.href (not getAttribute) is the browser-RESOLVED absolute
                // URL — writing that back means the captured HTML's href is
                // always absolute, never a bare relative path like "/sobre"
                // that would resolve against OUR domain once hosted there.
                // Also makes it match the separately-captured `links` array
                // the orchestrator's link-rewrite pass depends on.
                root.querySelectorAll('a[href]').forEach(a => {
                    if (a.href) a.setAttribute('href', a.href);
                });
                root.querySelectorAll('img').forEach(img => {
                    const real = img.currentSrc || img.src;
                    if (real) img.setAttribute('src', real);
                    img.removeAttribute('srcset');
                    img.removeAttribute('loading');
                });
                root.querySelectorAll('video[src], source[src], audio[src], iframe[src], embed[src], track[src]').forEach(el => {
                    const real = el.src;
                    if (real) el.setAttribute('src', real);
                });
            };

            // Plenty of sites put the real background (dark navy page
            // theme, a gradient, a texture) on an outer wrapper div — or
            // on <body> itself — and leave every individual <section>
            // transparent, relying on it showing through. We extract each
            // section as its own standalone element, so a transparent
            // section loses that backdrop entirely once it's outside the
            // original page's ancestor chain: light, readable text (e.g.
            // a pale gray meant to sit on navy) ends up on OUR page's own
            // background instead, often unreadable. Walking up from the
            // section looking for the nearest real background (color or
            // image) captures whatever it was actually inheriting.
            window.__vaiGetEffectiveBackground = function (startEl) {
                let node = startEl;
                while (node) {
                    const cs = getComputedStyle(node);
                    const bgColor = cs.backgroundColor;
                    const bgImage = cs.backgroundImage;
                    const hasColor = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';
                    const hasImage = bgImage && bgImage !== 'none';
                    if (hasColor || hasImage) {
                        return {
                            backgroundColor: hasColor ? bgColor : null,
                            backgroundImage: hasImage ? bgImage : null,
                            backgroundSize: cs.backgroundSize,
                            backgroundPosition: cs.backgroundPosition,
                        };
                    }
                    node = node.parentElement;
                }
                return null;
            };

            window.__vaiTagSections = function () {
                const rawCandidates = [
                    ...document.querySelectorAll(
                        'section, [class*="section"], [class*="block"], [class*="hero"], ' +
                        '[class*="benefit"], [class*="testimonial"], [class*="faq"], ' +
                        '[class*="cta"], [class*="footer"], header, footer, main > div'
                    )
                ];
                // These selectors overlap by design (a "hero" section is
                // also commonly `[class*="block"]`, etc.) — fine when they
                // match the SAME element twice (a Set dedupes that for
                // free), but `[class*="hero"]` also matches a CHILD div
                // like "hero-inner" (contains the substring "hero") sitting
                // right inside `section.hero`. Both ended up as separate
                // candidates, and since outerHTML of the outer one already
                // includes the inner one, capturing both duplicated that
                // entire block in the final page — literally the same
                // headline and CTA twice, the second copy missing
                // whatever styling only the outer section carried. Drop
                // any candidate that's a descendant of another candidate:
                // its content is always already included in the ancestor's
                // own capture, so it can never be a second real section.
                const unique = [...new Set(rawCandidates)];
                const candidates = unique.filter(el => !unique.some(other => other !== el && other.contains(el)));
                let i = 0;
                // Real header/nav bars are almost always under 100px tall
                // (a typical site's is 60-90px) — the height floor exists
                // to skip degenerate tiny divider <div>s matched by the
                // broad [class*="..."] selectors above, but it was ALSO
                // silently dropping every page's actual <header>, meaning
                // clones shipped with no top nav at all. header/footer/nav
                // are explicit HTML5 landmarks the page author chose on
                // purpose, so they're exempt from the height check.
                const isLandmark = el => ['HEADER', 'FOOTER', 'NAV'].includes(el.tagName);
                for (const el of candidates) {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    if ((rect.height > 100 || isLandmark(el)) && rect.width > 400 && style.display !== 'none' && style.visibility !== 'hidden') {
                        el.setAttribute('data-vai-idx', String(i));
                        i++;
                    }
                }
                return i;
            };

            window.__vaiCaptureOne = function (idx) {
                const el = document.querySelector('[data-vai-idx="' + idx + '"]');
                if (!el) return null;
                const images = Array.from(el.querySelectorAll('img')).slice(0, 20).map(img => ({
                    src: img.currentSrc || img.src || '',
                    alt: img.alt || '',
                })).filter(i => i.src);
                const links = Array.from(el.querySelectorAll('a[href]')).slice(0, 20).map(a => ({
                    href: a.href || '',
                    text: (a.textContent || '').trim().slice(0, 80),
                })).filter(l => l.href && !l.href.startsWith('javascript:'));
                const tag = el.tagName;
                const className = el.className.substring(0, 100);
                const rect = el.getBoundingClientRect();

                // Must be read BEFORE sanitize/inlineComputedStyles touch
                // anything — needs the section's REAL (still transparent,
                // if that's what it is) computed background and the live
                // ancestor chain, both still intact at this point.
                const ownCs = getComputedStyle(el);
                const ownHasBg = (ownCs.backgroundColor && ownCs.backgroundColor !== 'rgba(0, 0, 0, 0)') ||
                    (ownCs.backgroundImage && ownCs.backgroundImage !== 'none');
                const inheritedBg = (!ownHasBg && el.parentElement)
                    ? window.__vaiGetEffectiveBackground(el.parentElement)
                    : null;

                let domHtml = '';
                try {
                    window.__vaiFreezeCanvases(el);
                    window.__vaiSanitize(el);
                    window.__vaiInlineComputedStyles(el);
                    if (inheritedBg) {
                        if (inheritedBg.backgroundColor) el.style.setProperty('background-color', inheritedBg.backgroundColor);
                        if (inheritedBg.backgroundImage) {
                            el.style.setProperty('background-image', inheritedBg.backgroundImage);
                            el.style.setProperty('background-size', inheritedBg.backgroundSize);
                            el.style.setProperty('background-position', inheritedBg.backgroundPosition);
                        }
                    }
                    el.removeAttribute('data-vai-idx');
                    domHtml = el.outerHTML;
                } catch (e) {
                    domHtml = '';
                }

                return { tag, className, rect: { height: rect.height, width: rect.width }, images, links, domHtml };
            };
        }
    """

    async def _capture_sections(self, page: Page) -> List[dict]:
        """
        Splits the page into visual sections and, for each, captures its
        REAL outerHTML with every element's computed style inlined — a
        safety net for whatever the page-level captured stylesheet doesn't
        cleanly cover once rendered standalone.

        Captures EACH section right after scrolling it into view (not the
        whole page at once, back at the top) on purpose: scroll-reveal /
        IntersectionObserver-driven animation libraries (AOS, ScrollReveal,
        WOW.js, and plenty of hand-rolled equivalents) only add their
        "revealed" class once an element actually enters the viewport, and
        by default most REMOVE it again once the element scrolls back out.
        A single scroll-through-then-reset-to-top pass (the previous
        approach) meant every section below the fold got captured in its
        PRE-reveal state — translated off-screen, opacity 0 — which is
        exactly the "efeitos/movimentos não clonam" symptom. Scrolling each
        section into view immediately before reading its computed style
        lets the site's own (still-live, not-yet-stripped) JS put it in its
        real, settled end state first.
        """
        await page.evaluate(self._CAPTURE_SETUP_JS)
        count = await page.evaluate("() => window.__vaiTagSections()")
        page_height = await page.evaluate("document.body.scrollHeight")

        if not count:
            results = []
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

        results = []
        for i in range(min(count, 20)):
            try:
                await page.locator(f'[data-vai-idx="{i}"]').scroll_into_view_if_needed(timeout=5000)
            except Exception:
                pass
            await page.wait_for_timeout(300)
            try:
                data = await page.evaluate("(idx) => window.__vaiCaptureOne(idx)", i)
            except Exception as e:
                logger.warning(f"Failed to capture section {i}: {e}")
                continue
            if not data or data["rect"]["height"] < 50:
                continue
            results.append({
                "name": f"section_{i+1}_{data['tag'].lower()}",
                "class_hint": data["className"],
                "images": data.get("images", []),
                "links": data.get("links", []),
                "dom_html": data.get("domHtml", ""),
            })

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
