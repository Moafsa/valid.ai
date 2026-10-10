"""
Drops the rules of a funnel's stylesheet that can never apply to any of its screens.

A captured stylesheet is the whole design system of the original site, with the
styles of a cookie banner that was removed, of pages that were never opened, of
components the funnel does not use: BetterMe's came to 927KB of CSS for 34
screens that use a fraction of it. A phone parses and matches all of it on
every step. This keeps what the screens can use and nothing else.

A selector is dropped only when it needs a class or an id that appears nowhere
in the markup of any step (nor in the attributes the runtime replays: the
answer looks, the loader film, the entrance animations, the shell). Everything
that cannot be judged by name stays: tag selectors, attribute selectors,
pseudo-classes and the insides of :not() / :is() / :where() / :has().
@font-face, @property and @page always stay; @keyframes stay when something
still names them.
"""
import re
from typing import Iterable

_BLOCK_AT = ("@media", "@supports", "@layer", "@container", "@scope", "@document", "@-moz-document")
_KEYFRAMES = ("@keyframes", "@-webkit-keyframes", "@-moz-keyframes")
_IDENT = re.compile(r"[\w\-\u0080-\U0010ffff]")
_HEX = re.compile(r"\\([0-9a-fA-F]{1,6})\s?")


def vocabulary(texts: Iterable[str]) -> set:
    """Every whitespace/quote separated token of the markup (classes, ids, and the
    class lists hidden inside JSON attributes)."""
    out: set = set()
    for t in texts:
        if not t:
            continue
        t = t.replace("&quot;", '"').replace("&amp;", "&").replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">")
        for tok in re.split(r"[\s\"'<>`]+", t):
            if tok:
                out.add(tok)
                # "class=foo" / "id=foo" written without quotes, and ids inside url fragments
                if "=" in tok:
                    out.add(tok.split("=", 1)[1])
    return out


def _skip_group(s: str, i: int, open_c: str, close_c: str) -> int:
    """i points at open_c; returns the index after its matching close."""
    depth = 0
    n = len(s)
    while i < n:
        c = s[i]
        if c == "\\":
            i += 2
            continue
        if c in "\"'":
            q = c
            i += 1
            while i < n and s[i] != q:
                i += 2 if s[i] == "\\" else 1
            i += 1
            continue
        if c == open_c:
            depth += 1
        elif c == close_c:
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return n


def _selector_names(sel: str) -> list:
    """[('.', 'class'), ('#', 'id')] of one complex selector, ignoring [attr] and (...) groups."""
    out = []
    i, n = 0, len(sel)
    while i < n:
        c = sel[i]
        if c == "\\":
            i += 2
            continue
        if c == "[":
            i = _skip_group(sel, i, "[", "]")
            continue
        if c == "(":
            i = _skip_group(sel, i, "(", ")")
            continue
        if c in ".#":
            j = i + 1
            name = []
            while j < n:
                if sel[j] == "\\":
                    m = _HEX.match(sel, j)
                    if m:
                        name.append(chr(int(m.group(1), 16)))
                        j = m.end()
                        continue
                    if j + 1 < n:
                        name.append(sel[j + 1])
                        j += 2
                        continue
                    break
                if _IDENT.match(sel[j]):
                    name.append(sel[j])
                    j += 1
                    continue
                break
            if name and not name[0].isdigit():
                out.append((c, "".join(name)))
            i = max(j, i + 1)
            continue
        i += 1
    return out


def _split_selectors(prelude: str) -> list:
    out, depth, start, i, n = [], 0, 0, 0, len(prelude)
    while i < n:
        c = prelude[i]
        if c == "\\":
            i += 2
            continue
        if c in "\"'":
            q = c
            i += 1
            while i < n and prelude[i] != q:
                i += 2 if prelude[i] == "\\" else 1
            i += 1
            continue
        if c in "([":
            depth += 1
        elif c in ")]":
            depth -= 1
        elif c == "," and depth == 0:
            out.append(prelude[start:i])
            start = i + 1
        i += 1
    out.append(prelude[start:])
    return out


def _selector_alive(sel: str, vocab: set) -> bool:
    for kind, name in _selector_names(sel):
        if name not in vocab:
            return False
    return True


def _walk(css: str, vocab: set, stats: dict) -> str:
    out = []
    i, n = 0, len(css)
    prelude_start = 0
    while i < n:
        c = css[i]
        if css.startswith("/*", i):
            j = css.find("*/", i + 2)
            i = n if j == -1 else j + 2
            continue
        if c in "\"'":
            q = c
            i += 1
            while i < n and css[i] != q:
                i += 2 if css[i] == "\\" else 1
            i += 1
            continue
        if c == ";":
            out.append(css[prelude_start:i + 1])
            prelude_start = i + 1
            i += 1
            continue
        if c == "{":
            prelude = css[prelude_start:i]
            end = _skip_group(css, i, "{", "}")
            body = css[i + 1:end - 1]
            p = prelude.strip()
            low = p.lower()
            if low.startswith("@"):
                if low.startswith(_KEYFRAMES):
                    out.append(f"{prelude}{{{body}}}")        # decided afterwards, by name
                elif low.startswith(_BLOCK_AT):
                    inner = _walk(body, vocab, stats)
                    if inner.strip():
                        out.append(f"{prelude}{{{inner}}}")
                    else:
                        stats["dropped"] += 1
                else:
                    out.append(f"{prelude}{{{body}}}")        # @font-face, @property, @page...
            else:
                sels = _split_selectors(prelude)
                alive = [s for s in sels if _selector_alive(s, vocab)]
                if alive:
                    out.append(f"{','.join(alive) if len(alive) != len(sels) else prelude}{{{body}}}")
                else:
                    stats["dropped"] += 1
            prelude_start = end
            i = end
            continue
        i += 1
    tail = css[prelude_start:]
    if tail.strip():
        out.append(tail)
    return "".join(out)


def prune_css(css: str, vocab: set) -> str:
    """The stylesheet without the rules no screen can use."""
    if not css or not vocab:
        return css
    stats = {"dropped": 0}
    try:
        pruned = _walk(css, vocab, stats)
    except Exception:
        return css
    # @keyframes nobody names any more
    names = re.findall(r"@(?:-webkit-|-moz-)?keyframes\s+([\w\-]+|\"[^\"]+\")\s*\{", pruned)
    if names:
        body_wo_kf = re.sub(r"@(?:-webkit-|-moz-)?keyframes\s+[\w\-\"]+\s*\{(?:[^{}]|\{[^{}]*\})*\}", "", pruned)
        for name in set(names):
            nm = name.strip('"')
            if not re.search(r"(?<![\w-])" + re.escape(nm) + r"(?![\w-])", body_wo_kf):
                pruned = re.sub(r"@(?:-webkit-|-moz-)?keyframes\s+" + re.escape(name) + r"\s*\{(?:[^{}]|\{[^{}]*\})*\}", "", pruned)
    return pruned
