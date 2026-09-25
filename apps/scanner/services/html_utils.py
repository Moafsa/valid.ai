"""
Shared HTML post-processing helpers for screenshot-to-code output.
"""
from bs4 import BeautifulSoup


def extract_body_html(raw: str) -> str:
    """
    screenshot-to-code with stack="html_tailwind" returns a full HTML
    document (<!DOCTYPE>, <head> with a Tailwind CDN <script>, <body>...).
    Every block in this app is stored and rendered as a single fragment
    (dangerouslySetInnerHTML inside an existing page), so we only keep
    the body's inner content — dropping the surrounding document and the
    duplicate Tailwind CDN <script> tag, since the host page already loads
    its own Tailwind.

    The model doesn't only reach for Tailwind utility classes — it often
    names its own classes (e.g. "badge", "stage") and defines them in a
    <style> block in <head>. Dropping the whole <head> silently discarded
    that CSS too, so anything styled that way rendered as bare unstyled
    HTML. <style> tags survive being placed inside the body fragment (the
    browser applies them wherever they sit in the DOM), so we carry them
    along with the body's own content instead of losing them.
    """
    if not raw or not raw.strip():
        return raw

    if "<body" not in raw.lower():
        # Already a bare fragment (no full document wrapper) — use as-is.
        return raw.strip()

    soup = BeautifulSoup(raw, "lxml")
    body = soup.find("body")
    if not body:
        return raw.strip()

    styles = soup.find_all("style")
    styles_html = "\n".join(str(s) for s in styles)
    body_html = body.decode_contents().strip()

    return f"{styles_html}\n{body_html}".strip() if styles_html else body_html
