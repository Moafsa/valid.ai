"""
Real editor + a real clone: does an AI answer really change the page on screen? Only /api is mocked (the model's answer is canned).
usage: docker run --rm --network funnelai_network -v /opt/funnelai/tools/ui-lab:/ui funnelai-scanner python /ui/tests/ai_real.py [fixture] [scenario]
"""
import asyncio, json, sys, time
sys.path.insert(0, "/ui/tests")
from uilab import serve
from playwright.async_api import async_playwright

FIX = sys.argv[1] if len(sys.argv) > 1 else "ia"
ONLY = sys.argv[2] if len(sys.argv) > 2 else None
OUT = "/ui/shots"
CUR = {"ops": [], "body": {}}

SCENARIOS = {
  # a typical thorough answer from a small model: one op per kind
  "kinds": dict(prompt="deixe a página mais premium", ops=[
    {"op": "style", "target": {"by": "page"}, "css": {"font-family": "Georgia, serif"}, "label": "Fonte da página"},
    {"op": "style", "target": {"by": "kind", "kind": "heading"}, "css": {"font-weight": "800", "letter-spacing": "-0.02em", "line-height": "1.1"}, "label": "Títulos"},
    {"op": "style", "target": {"by": "kind", "kind": "text"}, "css": {"line-height": "1.7", "font-size": "19px"}, "label": "Textos"},
    {"op": "style", "target": {"by": "kind", "kind": "button"}, "css": {"border-radius": "14px", "padding": "16px 32px", "box-shadow": "0 8px 24px rgba(0,0,0,.25)"}, "label": "Botões"},
    {"op": "style", "target": {"by": "kind", "kind": "image"}, "css": {"border-radius": "20px", "box-shadow": "0 20px 50px rgba(0,0,0,.35)"}, "label": "Imagens"}]),
  # the new way: one direction for the whole page
  "theme": dict(prompt="deixe a página mais premium", ops=[
    {"op": "theme", "theme": {"accent": "#7c5cff", "radius": 14, "shadow": "soft", "density": "airy", "headingWeight": 800}, "label": "Visual premium"}]),
  "light": dict(prompt="deixe a página clara", ops=[
    {"op": "theme", "theme": {"mood": "light", "accent": "#0a72f5", "radius": 10, "shadow": "soft"}, "label": "Tema claro"}]),
  "serif": dict(prompt="fonte elegante", ops=[
    {"op": "theme", "theme": {"font": "serif", "headingWeight": 700}, "label": "Fonte elegante"}]),
  # the model ignores "only the selected": nothing outside the selection may change
  "scope": dict(prompt="deixe esse elemento moderno", select="h1", ops=[
    {"op": "style", "target": {"by": "page"}, "css": {"background-color": "#ffffff"}, "label": "Fundo da página"},
    {"op": "style", "target": {"by": "kind", "kind": "heading"}, "css": {"color": "#ff0000"}, "label": "Todos os títulos"},
    {"op": "theme", "theme": {"accent": "#ff0000", "radius": 30}, "label": "Tema"}]),
  # a rule the page cannot take: must say so, not "done"
  "noeffect": dict(prompt="mude algo impossível", ops=[
    {"op": "style", "target": {"by": "kind", "kind": "heading"}, "css": {"nonexistent-property": "12px"}, "label": "Coisa impossível"}]),
}

JS_SNAP = """() => {
  const d = window.__vaiEditor.Canvas.getDocument(), w = d.defaultView
  const props = ['font-family','font-weight','letter-spacing','line-height','font-size','border-top-left-radius','padding-top','box-shadow','color','background-color']
  const groups = { heading: 'h1,h2,h3,h4,h5,h6', text: 'p,li', button: 'a[class*=btn],button', link: 'a', img: 'img' }
  const out = {}
  for (const [g, sel] of Object.entries(groups)) out[g] = Array.from(d.querySelectorAll(sel)).slice(0, 400).map(e => { const cs = w.getComputedStyle(e); const o = {}; props.forEach(p => o[p] = cs.getPropertyValue(p)); o.t = (e.innerText||'').trim().slice(0,24); return o })
  out.bodyBg = w.getComputedStyle(d.body).backgroundColor
  return out
}"""

def ops_to_calls(ops):
    calls = []
    for i, op in enumerate(ops):
        t = op.get("target") or {}
        if op["op"] == "theme": calls.append({"type": "tool_use", "id": f"c{i}", "name": "apply_theme", "input": {"theme": op["theme"], "label": op.get("label")}})
        elif op["op"] == "style" and t.get("by") == "page": calls.append({"type": "tool_use", "id": f"c{i}", "name": "set_styles", "input": {"page": True, "css": op["css"], "label": op.get("label")}})
        elif op["op"] == "style": calls.append({"type": "tool_use", "id": f"c{i}", "name": "set_styles", "input": {"kind": t.get("kind"), "css": op["css"], "label": op.get("label")}})
    return calls

async def mock_api(route):
    req = route.request
    if "/api/editor/agent" in req.url:
        body = json.loads(req.post_data or "{}")
        last = body["messages"][-1]["content"]
        done = any(b.get("type") == "tool_result" for b in last)
        if not done:
            out = {"message": {"role": "assistant", "content": ops_to_calls(CUR["ops"])}, "stop": "tool_use"}
        else:
            for b in last:
                if b.get("type") == "tool_result": CUR.setdefault("tool_results", []).append(b["content"][:140])
            out = {"message": {"role": "assistant", "content": [{"type": "text", "text": "Pronto."}]}, "stop": "end"}
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(out))
    elif "ai-assist" in req.url:
        try: CUR["body"] = json.loads(req.post_data or "{}")
        except Exception: CUR["body"] = {}
        await route.fulfill(status=200, content_type="application/json", body=json.dumps({"reply": "Pronto.", "plan": "x", "operations": CUR["ops"], "credits": {"used": 3, "limit": 300, "plan": "Basic"}}))
    elif "/api/ai/credits" in req.url:
        await route.fulfill(status=200, content_type="application/json", body=json.dumps({"used": 3, "limit": 300, "plan": "Basic"}))
    else:
        await route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True}))

def diff(b, a):
    res = {}
    for g in ["heading", "text", "button", "link", "img"]:
        n = min(len(b[g]), len(a[g])); ch = {}
        for i in range(n):
            for k, v in b[g][i].items():
                if k != "t" and v != a[g][i].get(k): ch[k] = ch.get(k, 0) + 1
        res[g] = (n, ch)
    return res

async def run(p, name, sc):
    b = await p.chromium.launch(ignore_default_args=["--hide-scrollbars"], args=["--disable-features=OverlayScrollbar,FluentOverlayScrollbar,FluentScrollbar"])
    pg = await b.new_page(viewport={"width": 1600, "height": 950})
    logs = []
    pg.on("pageerror", lambda e: logs.append("PAGEERROR " + str(e)[:300]))
    await pg.route("**/api/**", mock_api)
    CUR["ops"] = sc["ops"]
    await pg.goto(f"http://127.0.0.1:8123/editor_{FIX}.html")
    await pg.wait_for_selector(".gjs-frame", timeout=40000)
    await pg.wait_for_timeout(3500)
    await pg.evaluate("() => { const d = window.__vaiEditor.Canvas.getDocument(); const st = d.createElement('style'); st.textContent = '.vai-ai-flash{animation:none!important}'; d.head.appendChild(st) }")
    if sc.get("select"):
        await pg.evaluate("(sel) => { const ed = window.__vaiEditor; const d = ed.Canvas.getDocument(); const el = d.querySelector(sel); const c = ed.getWrapper().find('*').find(x => x.getEl() === el); ed.select(c) }", sc["select"])
        await pg.wait_for_timeout(500)
    before = await pg.evaluate(JS_SNAP)
    await pg.get_by_role("button", name="Abrir o assistente de IA").click()
    await pg.wait_for_timeout(600)
    await pg.locator(".ed-ai-composer textarea").fill(sc["prompt"])
    t0 = time.time()
    await pg.keyboard.press("Enter")
    await pg.wait_for_selector(".ed-ai-reply", timeout=30000)
    await pg.wait_for_timeout(800)
    took = time.time() - t0
    after = await pg.evaluate(JS_SNAP)
    await pg.screenshot(path=f"{OUT}/ai_{name}.png")
    d = diff(before, after)
    reply_text = await pg.locator(".ed-ai-reply-head p").last.inner_text()
    n_changes = await pg.locator(".ed-ai-change").count()
    print(f"\n=== {name} | {took:.1f}s | changes listed={n_changes} | bodyBg {before['bodyBg']} -> {after['bodyBg']}")
    print("   reply:", reply_text[:150])
    for g, (n, ch) in d.items():
        print(f"   {g:8s} {n:3d} elements, changed: {ch}")
    # undo/redo as one step
    if n_changes:
        await pg.get_by_role("button", name="Antes").click(); await pg.wait_for_timeout(1500)
        undone = await pg.evaluate(JS_SNAP)
        same = diff(before, undone)
        left = sum(sum(c.values()) for _, c in same.values())
        await pg.get_by_role("button", name="Depois").click(); await pg.wait_for_timeout(1200)
        redone = await pg.evaluate(JS_SNAP)
        again = sum(sum(c.values()) for _, c in diff(after, redone).values())
        print(f"   undo leaves {left} property differences; redo differs from first result by {again}")
    for l in logs[:5]: print("  ", l)
    await b.close()

async def main():
    srv = serve()
    async with async_playwright() as p:
        for name, sc in SCENARIOS.items():
            if ONLY and name != ONLY: continue
            await run(p, name, sc)
    srv.terminate()
asyncio.run(main())
