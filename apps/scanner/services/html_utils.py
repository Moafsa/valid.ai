import re

# Any url(...) at all — background images, @font-face src, masks, all look
# identical to this. Used on a page-level captured stylesheet, not on
# per-element HTML.
CSS_URL_RE = re.compile(r'url\((["\']?)([^)"\']+)\1\)', re.IGNORECASE)


def rewrite_css_asset_urls(css_text: str, url_map: dict[str, str]) -> str:
    """Rewrites every url(...) inside a raw page-level stylesheet from its
    original absolute source URL to wherever it was rehosted. A url() with
    no matching key is left untouched (that asset's rehost failed or was
    skipped) rather than breaking the reference outright."""
    def _sub(m: "re.Match") -> str:
        rehosted = url_map.get(m.group(2).strip())
        return f'url("{rehosted}")' if rehosted else m.group(0)
    return CSS_URL_RE.sub(_sub, css_text)
