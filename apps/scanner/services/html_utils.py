def iter_css_urls(css_text: str):
    """Yields (start, end, target) for each top-level `url(...)` in
    css_text — `target` is the text between the delimiters (quotes
    stripped), (start, end) is the span of the WHOLE `url(...)` token.

    This walks the string by hand instead of using a single regex because a
    quoted CSS url string ends at the first unescaped occurrence of its OWN
    quote character, full stop — exactly like a browser's CSS tokenizer,
    and unlike a `[^)"']+`-style character class, which treats ANY paren or
    quote as a terminator. That distinction matters once the url is a
    data: URI carrying embedded markup: an inline SVG noise/grid texture
    commonly references its own `<filter id="n">` via `url(#n)` inside the
    SAME data: URI, and a naive regex "finds" that inner `url(#n)` as its
    own independent match and rewrites it — splicing a second, differently
    quoted url() string into the middle of the first and corrupting the
    whole declaration into something no CSS parser can read. The browser
    then silently drops the entire background-image. Walking the real
    quote boundaries means the outer data: URI is consumed as one opaque
    span, so the embedded `url(#n)` is never independently visited.
    """
    n = len(css_text)
    i = 0
    while True:
        idx = css_text.find("url(", i)
        if idx == -1:
            return
        j = idx + 4
        while j < n and css_text[j] in " \t\r\n":
            j += 1
        if j < n and css_text[j] in "\"'":
            quote = css_text[j]
            k = j + 1
            while k < n and css_text[k] != quote:
                k += 2 if css_text[k] == "\\" else 1
            if k >= n:
                i = idx + 4
                continue
            target = css_text[j + 1 : k]
            k += 1
        else:
            k = css_text.find(")", j)
            if k == -1:
                i = idx + 4
                continue
            target = css_text[j:k]
        end = css_text.find(")", k)
        if end == -1:
            i = idx + 4
            continue
        yield idx, end + 1, target.strip()
        i = end + 1


def rewrite_css_asset_urls(css_text: str, url_map: dict[str, str]) -> str:
    """Rewrites every url(...) inside a raw page-level stylesheet from its
    original absolute source URL to wherever it was rehosted. A url() with
    no matching key is left untouched (that asset's rehost failed or was
    skipped) rather than breaking the reference outright."""
    out = []
    pos = 0
    for start, end, target in iter_css_urls(css_text):
        rehosted = url_map.get(target)
        out.append(css_text[pos:start])
        out.append(f'url("{rehosted}")' if rehosted else css_text[start:end])
        pos = end
    out.append(css_text[pos:])
    return "".join(out)
