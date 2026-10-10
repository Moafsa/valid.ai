"""
End-to-end test of the editor AI agent: the REAL editor (GrapesJS), the REAL agent loop and tools, a REAL cloned page.
Only the model is replaced by a script that behaves like an agent: it reads tool results and decides the next call
(including making mistakes and fixing them). Every assertion looks at the page, never at the model's words.

usage: docker run --rm --network funnelai_network -v /opt/funnelai/tools/ui-lab:/ui funnelai-scanner python /ui/tests/agent_e2e.py [fixture] [scenario]
"""
import asyncio, itertools, json, re, sys, time
sys.path.insert(0, "/ui/tests")
from uilab import serve
from playwright.async_api import async_playwright

FIX = sys.argv[1] if len(sys.argv) > 1 else "ia"
ONLY = sys.argv[2] if len(sys.argv) > 2 else None
OUT = "/ui/shots"
CNT = itertools.count(1)
CUR = {"fn": None, "log": [], "delay": {}}
RESULTS = []

def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok)))
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"   [{detail}]" if detail and not ok else ""))

# ───────────────────────── the scripted model ─────────────────────────
def tu(name, **inp):
    return {"type": "tool_use", "id": f"call_{next(CNT)}", "name": name, "input": inp}

def turn(*blocks, text=None):
    content = ([{"type": "text", "text": text}] if text else []) + list(blocks)
    stop = "tool_use" if any(b["type"] == "tool_use" for b in blocks) else "end"
    out = {"message": {"role": "assistant", "content": content or [{"type": "text", "text": ""}]}, "stop": stop, "credits": {"used": 12, "limit": 300, "plan": "Basic"}}
    if CUR.get("provider"): out["provider"] = CUR["provider"]
    return out

def run_index(messages):
    """how many assistant turns this run has had so far (a run starts at the user message that begins with PEDIDO:)"""
    start = max(i for i, m in enumerate(messages) if m["role"] == "user" and any(b.get("type") == "text" and b["text"].startswith("PEDIDO:") for b in m["content"]))
    return sum(1 for m in messages[start + 1:] if m["role"] == "assistant")

def results(messages):
    out = []
    for b in messages[-1]["content"]:
        if b.get("type") == "tool_result":
            try: out.append(json.loads(b["content"]))
            except Exception: out.append(b["content"])
    return out

def last_text(messages):
    return " ".join(b.get("text", "") for b in messages[-1]["content"] if b.get("type") == "text")

NEW_TITLE = "Clone qualquer funil e edite tudo do seu jeito"

def scen_A(m):  # rewrite the main title and its typography
    n = run_index(m)
    if n == 0: return turn(tu("find_elements", kind="heading", limit=3))
    if n == 1:
        hid = results(m)[0]["results"][0]["id"]
        return turn(tu("set_text", id=hid, text=NEW_TITLE, label="Novo título principal"),
                    tu("set_styles", ids=[hid], css={"font-size": "56px", "font-weight": "800", "letter-spacing": "-0.03em", "line-height": "1.05"}, label="Tipografia do título"))
    if n == 2: return turn(tu("check_page"))
    return turn(text="Troquei o título principal e deixei a tipografia mais forte.")

def scen_A2(m):  # the second request of the same conversation
    n = run_index(m)
    CUR["seen_history"] = any(b.get("type") == "text" and "Mudanças feitas" in b["text"] for mm in m for b in mm["content"]) and any(b.get("type") == "text" and b["text"] == "Reescreva o título principal" for mm in m for b in mm["content"])
    if n == 0: return turn(tu("find_elements", kind="heading", limit=3))
    if n == 1:
        ids = [r["id"] for r in results(m)[0]["results"]]
        return turn(tu("set_styles", ids=[ids[1]], css={"font-weight": "800", "letter-spacing": "-0.03em"}, label="Segundo título parecido"))
    if n == 2: return turn(tu("check_page"))
    return turn(text="Deixei o segundo título parecido com o primeiro.")

def scen_B(m):  # restyle every button without touching text or destination
    n = run_index(m)
    if n == 0: return turn(tu("find_elements", kind="button"))
    if n == 1:
        CUR["button_ids"] = [r["id"] for r in results(m)[0]["results"]]
        return turn(tu("set_styles", kind="button", css={"background-color": "#7c5cff", "background-image": "none", "color": "#ffffff", "border-radius": "999px", "box-shadow": "0 10px 28px rgba(124,92,255,.45)"}, label="Visual dos botões"))
    if n == 2: return turn(tu("check_page"))
    return turn(text="Deixei todos os botões roxos e arredondados, sem mexer em textos nem destinos.")

TESTIMONIALS = """<section data-testi="1" style="padding:72px 24px;background:#0d1020;color:#fff"><div style="max-width:1100px;margin:0 auto"><h2 style="font-size:36px;margin:0 0 8px;text-align:center">Depoimentos</h2><p style="text-align:center;color:#b9b9c6;margin:0 0 32px">Exemplos de como as pessoas usam (texto de exemplo)</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px"><div data-card="1" style="background:#151a30;border-radius:16px;padding:24px"><p style="margin:0 0 12px">"Clonei meu funil em minutos e editei tudo sozinha."</p><b>Ana, exemplo</b></div><div data-card="2" style="background:#151a30;border-radius:16px;padding:24px"><p style="margin:0 0 12px">"Meu time publica páginas novas sem depender de programador."</p><b>Bruno, exemplo</b></div><div data-card="3" style="background:#151a30;border-radius:16px;padding:24px"><p style="margin:0 0 12px">"As métricas mostraram onde as pessoas desistiam."</p><b>Carla, exemplo</b></div></div></div></section>"""

def scen_C(m):  # a complete responsive testimonials section
    n = run_index(m)
    if n == 0: return turn(tu("get_page_outline"))
    if n == 1: return turn(tu("insert_html", html=TESTIMONIALS, where="page-end", label="Seção de depoimentos"))
    if n == 2: return turn(tu("check_page", viewport="mobile"))
    return turn(text="Criei a seção de depoimentos, com 3 cartões que se empilham no celular.")

def scen_D(m):  # redo one complex section keeping the rest
    n = run_index(m)
    if n == 0: return turn(tu("find_elements", tag="section", text_contains="Tudo o que você precisa", limit=6))
    if n == 1:
        cands = results(m)[0]["results"]
        return turn(*[tu("inspect_element", id=c["id"]) for c in cands[:4]])
    if n == 2:
        best = min(results(m), key=lambda r: r["rect"]["height"])
        CUR["section_id"] = best["id"]
        return turn(tu("get_element_html", id=best["id"], max_chars=4000))
    if n == 3:
        html = ('<section style="padding:80px 24px;background:#10142a;color:#fff"><div style="max-width:1100px;margin:0 auto;text-align:center">'
                '<h2 style="font-size:40px;margin:0 0 12px">Tudo o que você precisa para ter controle total sobre suas páginas.</h2>'
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;margin-top:32px">'
                '<div style="background:#171c38;border-radius:18px;padding:28px"><h3>Editor visual completo</h3><p>Edite textos, imagens, botões, links, seções e muito mais.</p></div>'
                '<div style="background:#171c38;border-radius:18px;padding:28px"><h3>Inteligência Artificial integrada</h3><p>Traduza, reescreva e adapte sua página com IA.</p></div>'
                '<div style="background:#171c38;border-radius:18px;padding:28px"><h3>Gerenciamento de mídias</h3><p>Organize e substitua imagens, vídeos e arquivos em poucos cliques.</p></div>'
                '</div></div></section>')
        return turn(tu("replace_element", id=CUR["section_id"], html=html, label="Seção de recursos refeita"))
    if n == 4: return turn(tu("check_page", viewport="mobile"))
    return turn(text="Refiz a seção de recursos com cartões e mantive o resto da página.")

OVERFLOW_HTML = '<section style="padding:24px"><div class="faixa-teste" style="width:3200px;height:64px;color:#fff">Faixa de teste</div></section>'

def scen_E1(m):  # a broken CSS is refused, the model reads the error and sends a valid one
    n = run_index(m)
    if n == 0: return turn(tu("add_css", css=".faixa-teste{background:#7c5cff;color:#fff", label="Estilo da faixa"))
    if n == 1:
        CUR["css_err"] = results(m)[0]
        return turn(tu("add_css", css=".faixa-teste{background:#7c5cff;color:#fff;border-radius:12px}", verify={"selector": "h1", "property": "font-size"}, label="Estilo da faixa"))
    if n == 2: return turn(tu("insert_html", html='<section style="padding:24px"><div class="faixa-teste" style="padding:18px">Faixa de teste</div></section>', where="page-end", label="Faixa"))
    if n == 3: return turn(tu("check_page"))
    return turn(text="Acrescentei a faixa colorida.")

def scen_E2(m):  # the model creates an overflow, tries to finish WITHOUT checking: the harness checks, reports, the model fixes
    n = run_index(m)
    if n == 0: return turn(tu("insert_html", html=OVERFLOW_HTML, where="page-end", label="Faixa larga"))
    if n == 1: return turn(text="Pronto, adicionei a faixa.")          # no check_page: the loop must not accept this
    CUR["auto_check_seen"] = CUR.get("auto_check_seen") or ("VERIFICAÇÃO AUTOMÁTICA" in last_text(m))
    if n == 2:
        issues = []
        txt = last_text(m)
        mm = re.search(r'"culprit":\{"id":"([^"]+)"', txt)
        CUR["offender"] = mm.group(1) if mm else None
        if not CUR["offender"]: return turn(text="Não encontrei o problema.")
        return turn(tu("set_styles", ids=[CUR["offender"]], css={"width": "100%", "max-width": "100%"}, label="Faixa na largura da tela"))
    if n == 3: return turn(tu("check_page"))
    if n == 4:
        r = results(m)[0]
        CUR["second_check"] = r
        narrow = [x for x in r.get("issues", []) if x.get("type") == "narrow_section"]
        if narrow: return turn(tu("set_styles", ids=[narrow[0]["id"]], css={"width": "100%", "box-sizing": "border-box"}, label="Seção na largura do contêiner"))
        return turn(text="Corrigi a largura da faixa.")
    if n == 5: return turn(tu("check_page"))
    return turn(text="Corrigi a largura da faixa e da seção.")

def scen_UNDO(m):  # a change that turns out worse is undone by the model itself
    n = run_index(m)
    if n == 0: return turn(tu("find_elements", kind="heading", limit=1))
    if n == 1: return turn(tu("set_styles", ids=[results(m)[0]["results"][0]["id"]], css={"font-size": "90px", "color": "#ff0000"}, label="Título gigante"))
    if n == 2: return turn(tu("undo_last_change"))
    if n == 3: return turn(tu("check_page"))
    return turn(text="Testei um título maior e voltei ao original porque não ficou bom.")

def scen_SCOPE(m):  # only the selected element: out-of-scope calls are refused by the tools
    n = run_index(m)
    if n == 0: return turn(tu("set_styles", page=True, css={"background-color": "#ffffff"}), tu("find_elements", kind="heading"))
    if n == 1:
        rs = results(m)
        CUR["page_err"] = rs[0]
        CUR["found"] = [r["id"] for r in rs[1]["results"]]
        return turn(tu("set_styles", kind="heading", css={"color": "#ff3b30"}, label="Título em vermelho"))
    if n == 2: return turn(tu("set_styles", ids=[CUR.get("other_id", "nao-existe")], css={"color": "#00ff00"}))
    return turn(text="Deixei só o título selecionado em vermelho.")

def scen_BAD(m):  # unknown tool and invalid arguments are errors the model can read, not crashes
    n = run_index(m)
    if n == 0: return turn(tu("launch_rocket", fuel=1), {"type": "tool_use", "id": f"call_{next(CNT)}", "name": "set_styles", "input": {"__invalid_json": '{"css": {'}}, tu("inspect_element", id="id-que-nao-existe"))
    if n == 1:
        CUR["bad"] = results(m)
        return turn(tu("find_elements", kind="heading", limit=1))
    return turn(text="Entendi os erros e não alterei nada.")

def scen_LOOP(m):  # a model that never stops: the loop must
    return turn(tu("get_page_outline"))

def scen_ABORT(m):
    n = run_index(m)
    if n == 0: return turn(tu("find_elements", kind="heading", limit=1))
    if n == 1: return turn(tu("set_styles", ids=[results(m)[0]["results"][0]["id"]], css={"letter-spacing": "0.2em"}, label="Espaçamento das letras"))
    return turn(tu("check_page"))

# ───────────────────────── page helpers ─────────────────────────
SIG = """() => {
  const d = window.__vaiEditor.Canvas.getDocument(), w = d.defaultView
  const props = ['font-size','font-weight','color','background-color','border-top-left-radius','padding-top','box-shadow','letter-spacing','line-height','display','width']
  let h = 0, n = 0
  const walk = (el) => { const cs = w.getComputedStyle(el); const s = el.tagName + '|' + (el.children.length ? '' : (el.textContent||'').trim().slice(0,40)) + '|' + props.map(p => cs.getPropertyValue(p)).join(','); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; n++; for (const c of el.children) walk(c) }
  walk(d.body)
  return { hash: h, n }
}"""

async def api(route):
    url = route.request.url
    if "/api/editor/agent" in url:
        body = json.loads(route.request.post_data or "{}")
        CUR.setdefault("stamps", []).append(time.time())
        if CUR.get("rate_fail", 0) > 0:
            CUR["rate_fail"] -= 1
            CUR["rate_hits"] = CUR.get("rate_hits", 0) + 1
            await route.fulfill(status=429, content_type="application/json", body=json.dumps({"error": "O provedor de IA atingiu o limite de pedidos por minuto.", "code": "rate_limited", "retryAfterMs": 1500}))
            return
        CUR["log"].append(body["messages"])
        d = CUR["delay"].get(len(CUR["log"]))
        if d: await asyncio.sleep(d)
        try: out = CUR["fn"](body["messages"])
        except Exception as e:
            print("   SCRIPT ERROR", repr(e)); out = turn(text="(erro no roteiro de teste)")
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(out))
    elif "/api/editor/save-page" in url:
        CUR["saved"] = json.loads(route.request.post_data or "{}")
        await route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True}))
    elif "/api/editor/original" in url:
        from urllib.parse import urlparse, parse_qs
        q = parse_qs(urlparse(url).query)
        try: orig = json.load(open("/ui/fixtures/original_" + FIX + ".json"))
        except Exception: orig = []
        if q.get("digest"):
            import re as _re
            def _classes(h):
                out = []
                for m in _re.finditer(r'class="([^"]*)"', h):
                    for c in m.group(1).split():
                        if c not in out: out.append(c)
                return out[:400]
            await route.fulfill(status=200, content_type="application/json", body=json.dumps({"sections": [{"id": o["id"], "index": k, "classes": _classes(o["html"])} for k, o in enumerate(orig)]}))
            return
        hit = None
        if q.get("blockId"): hit = next((o for o in orig if o["id"] == q["blockId"][0]), None)
        if hit is None and q.get("index"):
            k = int(q["index"][0]); hit = orig[k] if 0 <= k < len(orig) else None
        CUR.setdefault("orig_calls", []).append(q)
        if hit: await route.fulfill(status=200, content_type="application/json", body=json.dumps({"id": hit["id"], "html": hit["html"]}))
        else: await route.fulfill(status=404, content_type="application/json", body=json.dumps({"error": "Esta seção não existia no original."}))
    elif "/api/ai/credits" in url:
        await route.fulfill(status=200, content_type="application/json", body=json.dumps({"used": 12, "limit": 300, "plan": "Basic"}))
    else:
        await route.fulfill(status=200, content_type="application/json", body="{}")

async def open_editor(p, w=1500, h=950):
    b = await p.chromium.launch(ignore_default_args=["--hide-scrollbars"], args=["--disable-features=OverlayScrollbar,FluentOverlayScrollbar,FluentScrollbar"])
    pg = await b.new_page(viewport={"width": w, "height": h})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    await pg.route("**/api/**", api)
    CUR["log"] = []; CUR["delay"] = {}; CUR["stamps"] = []; CUR["rate_fail"] = 0; CUR["rate_hits"] = 0; CUR["provider"] = None
    await pg.goto(f"http://127.0.0.1:8123/editor_{FIX}.html")
    await pg.wait_for_selector(".gjs-frame", timeout=40000)
    await pg.wait_for_timeout(3500)
    await pg.evaluate("() => { const d = window.__vaiEditor.Canvas.getDocument(); const st = d.createElement('style'); st.textContent = '.vai-ai-flash{animation:none!important}'; d.head.appendChild(st) }")
    await pg.get_by_role("button", name="Abrir o assistente de IA").click()
    await pg.wait_for_timeout(500)
    return b, pg, errs

async def ask(pg, text, nreply):
    await pg.locator(".ed-ai-composer textarea").fill(text)
    await pg.keyboard.press("Enter")
    await pg.wait_for_function(f"document.querySelectorAll('.ed-ai-reply').length >= {nreply}", timeout=120000)
    await pg.wait_for_timeout(700)

async def panel_info(pg):
    return await pg.evaluate("""() => ({ changes: document.querySelectorAll('.ed-ai-change').length, verified: !!document.querySelector('.ed-ai-verified'), reply: (document.querySelectorAll('.ed-ai-reply-head p')[document.querySelectorAll('.ed-ai-reply-head p').length - 1] || {}).innerText || '' })""")

def tool_results_seen(log, name_hint=None):
    out = []
    for msgs in log:
        for mm in msgs:
            for b in mm["content"]:
                if b.get("type") == "tool_result": out.append(b)
    return out

# ───────────────────────── scenarios ─────────────────────────
async def sc_A(p):
    print("\n[A+G+F] reescrever o título e ajustar a tipografia · continuidade · desfazer/refazer")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_A
    sig0 = await pg.evaluate(SIG)
    orig = await pg.evaluate("() => { const d = window.__vaiEditor.Canvas.getDocument(); const h = d.querySelector('h1'); const cs = d.defaultView.getComputedStyle(h); return { t: h.innerText, fs: cs.fontSize, fw: cs.fontWeight, others: Array.from(d.querySelectorAll('h2')).map(x => x.innerText).join('|') } }")
    await ask(pg, "Reescreva o título principal", 1)
    info = await panel_info(pg)
    now = await pg.evaluate("() => { const d = window.__vaiEditor.Canvas.getDocument(); const h = d.querySelector('h1'); const cs = d.defaultView.getComputedStyle(h); return { t: h.innerText.replace(/\\s+/g,' ').trim(), fs: cs.fontSize, fw: cs.fontWeight, others: Array.from(d.querySelectorAll('h2')).map(x => x.innerText).join('|') } }")
    check("A: o título principal mudou na página", now["t"] == NEW_TITLE, now["t"])
    check("A: a tipografia mudou (56px, peso 800)", now["fs"] == "56px" and now["fw"] == "800", f"{now['fs']} {now['fw']}")
    check("A: os outros títulos continuam iguais", now["others"] == orig["others"])
    check("A: o painel lista as 2 mudanças reais", info["changes"] == 2, str(info))
    check("A: o agente conferiu a página antes de terminar", info["verified"])
    await pg.screenshot(path=f"{OUT}/agent_A.png")
    # F: undo / redo restore the exact state
    sig1 = await pg.evaluate(SIG)
    await pg.get_by_role("button", name="Antes").click(); await pg.wait_for_timeout(1200)
    sigU = await pg.evaluate(SIG)
    check("F: 'Antes' restaura o estado anterior da página inteira", sigU["hash"] == sig0["hash"], f"{sigU} vs {sig0}")
    await pg.get_by_role("button", name="Depois").click(); await pg.wait_for_timeout(1200)
    sigR = await pg.evaluate(SIG)
    check("F: 'Depois' reaplica exatamente o resultado", sigR["hash"] == sig1["hash"])
    # G: second request in the same conversation remembers the first
    CUR["fn"] = scen_A2
    await ask(pg, "e deixe o segundo título parecido", 2)
    check("G: a segunda mensagem leva o histórico da primeira (pedido e o que foi feito)", CUR.get("seen_history"))
    # no tool_use left without its tool_result in any request
    ok = True
    for msgs in CUR["log"]:
        pending = set()
        for mm in msgs:
            for blk in mm["content"]:
                if blk["type"] == "tool_use": pending.add(blk["id"])
                if blk["type"] == "tool_result": pending.discard(blk["tool_use_id"])
        # the last assistant message may still wait for the results being sent in this very request: none may be left
        if pending: ok = False
    check("API: toda chamada de ferramenta volta ao modelo com o seu resultado (pareamento)", ok)
    check("sem erros de JavaScript na página do editor", not errs, str(errs[:2]))
    await b.close()

async def sc_B(p):
    print("\n[B] visual de todos os botões sem mudar textos nem destinos")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_B
    snap = """(ids) => { const d = window.__vaiEditor.Canvas.getDocument(), w = d.defaultView; return ids.map(id => { const e = d.getElementById(id); if (!e) return null; const cs = w.getComputedStyle(e); return { t: (e.innerText||'').trim(), h: e.getAttribute('href'), bg: cs.backgroundColor, r: cs.borderTopLeftRadius, sh: cs.boxShadow } }) }"""
    await ask(pg, "Deixe todos os botões roxos e arredondados", 1)
    ids = CUR["button_ids"]
    after = await pg.evaluate(snap, ids)
    check("B: a busca achou botões reais", len(ids) >= 1 and all(after), f"{len(ids)} ids")
    check("B: o fundo e os cantos dos botões mudaram", all(a and a["bg"] == "rgb(124, 92, 255)" for a in after) and all(a["r"] not in ("0px", "10px") for a in after), str(after[:2]))
    info = await panel_info(pg)
    check("B: o painel mostra a mudança e a conferência", info["changes"] >= 1 and info["verified"], str(info))
    # text and destination of those buttons are the same as in the stored page
    await pg.get_by_role("button", name="Antes").click(); await pg.wait_for_timeout(1000)
    before = await pg.evaluate(snap, ids)
    await pg.get_by_role("button", name="Depois").click(); await pg.wait_for_timeout(1000)
    check("B: textos e destinos dos botões idênticos antes e depois", [(x["t"], x["h"]) for x in before] == [(x["t"], x["h"]) for x in after])
    await pg.screenshot(path=f"{OUT}/agent_B.png")
    await b.close()

async def sc_C(p):
    print("\n[C] seção completa de depoimentos, responsiva")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_C
    await ask(pg, "Crie uma seção de depoimentos", 1)
    info = await panel_info(pg)
    probe = """() => { const d = window.__vaiEditor.Canvas.getDocument(); const s = d.querySelector('[data-testi]'); if (!s) return null; const c = Array.from(s.querySelectorAll('[data-card]')).map(x => x.getBoundingClientRect()); const sr = s.getBoundingClientRect(); const de = d.documentElement; return { cards: c.length, sideBySide: c.length === 3 && c[1].left >= c[0].right - 2 && c[2].left >= c[1].right - 2, stacked: c.length === 3 && c[1].top >= c[0].bottom - 2 && c[2].top >= c[1].bottom - 2, inside: sr.right <= de.clientWidth + 2, w: de.clientWidth, h: Math.round(sr.height), heading: (s.querySelector('h2')||{}).innerText } }"""
    desk = await pg.evaluate(probe)
    if "DEBUG" in __import__("os").environ:
        for r in tool_results_seen(CUR["log"])[:4]: print("   tool_result:", r["content"][:420])
        print("   section:", await pg.evaluate("() => { const d = window.__vaiEditor.Canvas.getDocument(); const s = d.querySelector('[data-testi]'); const cs = getComputedStyle(s); const p = s.parentElement; const pc = getComputedStyle(p); return { w: s.getBoundingClientRect().width, width: cs.width, alignSelf: cs.alignSelf, parent: p.tagName + '#' + p.id, pw: p.getBoundingClientRect().width, pdisp: pc.display, pdir: pc.flexDirection, pai: pc.alignItems, grid: getComputedStyle(s.querySelector('div > div')).gridTemplateColumns } }"))
    check("C: a seção existe, com título e 3 cartões", desk and desk["cards"] == 3 and desk["heading"] == "Depoimentos", str(desk))
    check("C: no computador os cartões ficam lado a lado e cabem na tela", desk and desk["sideBySide"] and desk["inside"], str(desk))
    await pg.evaluate("() => window.__vaiEditor.setDevice('Mobile')"); await pg.wait_for_timeout(900)
    mob = await pg.evaluate(probe)
    check("C: no celular os cartões se empilham sem sair da tela", mob and mob["stacked"] and mob["inside"], str(mob))
    await pg.screenshot(path=f"{OUT}/agent_C_mobile.png")
    await pg.evaluate("() => window.__vaiEditor.setDevice('Desktop')"); await pg.wait_for_timeout(600)
    check("C: o agente verificou no celular e terminou sem problemas", info["verified"], str(info))
    saved = await pg.evaluate("() => window.__vaiEditor.getHtml().includes('data-testi')")
    check("C: a seção está no HTML do projeto (vai ser salva e publicada)", saved)
    await b.close()

async def sc_D(p):
    print("\n[D] refazer uma seção complexa preservando o resto")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_D
    pre = await pg.evaluate("""() => { const ed = window.__vaiEditor, d = ed.Canvas.getDocument(); const all = ed.Components.allById(); let best = null; for (const c of Object.values(all)) { const e = c.getEl && c.getEl(); if (!e || e.tagName !== 'SECTION' || !(e.innerText||'').includes('Tudo o que você precisa')) continue; const h = e.getBoundingClientRect().height; if (!best || h < best.h) best = { h, id: c.getId(), html: c.toHTML() } } return { id: best.id, html: best.html, full: ed.getHtml() } }""")
    await ask(pg, "Refaça a seção de recursos", 1)
    post = await pg.evaluate("""() => { const ed = window.__vaiEditor, d = ed.Canvas.getDocument(); let best = null; for (const c of Object.values(ed.Components.allById())) { const e = c.getEl && c.getEl(); if (!e || e.tagName !== 'SECTION' || !(e.innerText||'').includes('Editor visual completo')) continue; const h = e.getBoundingClientRect().height; if (!best || h < best.h) best = { h, html: c.toHTML() } } return { html: best && best.html, full: ed.getHtml(), cards: best ? best.html.split('<h3').length - 1 : 0 } }""")
    norm = lambda s: re.sub(r' data-vai-block-id="[^"]*"', '', re.sub(r' id="[^"]*"', '', s))
    check("D: a seção nova está na página (3 cartões)", post["html"] and post["cards"] == 3, str(post["cards"]))
    b4 = norm(pre["full"]).replace(norm(pre["html"]), "@@", 1)
    af = norm(post["full"]).replace(norm(post["html"]), "@@", 1)
    check("D: todo o resto da página ficou idêntico (HTML fora da seção)", "@@" in b4 and b4 == af, f"{len(b4)} vs {len(af)}")
    info = await panel_info(pg)
    check("D: o agente conferiu a página no celular", info["verified"], str(info))
    await pg.screenshot(path=f"{OUT}/agent_D.png")
    await b.close()

async def sc_E1(p):
    print("\n[E1] CSS quebrado é recusado, o modelo lê o erro e corrige")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_E1
    await ask(pg, "Acrescente uma faixa colorida", 1)
    err = CUR.get("css_err")
    check("E1: o CSS com chave faltando foi recusado com uma explicação", isinstance(err, str) and "chaves" in err, str(err)[:120])
    css = await pg.evaluate("() => window.__vaiEditor.getCss()")
    i = css.find(".faixa-teste{")
    rule = css[i:css.find("}", i) + 1].replace(" ", "") if i >= 0 else ""
    ok_rule = bool(rule) and "rgb(124,92,255)" in rule and "border-top-left-radius:12px" in rule
    check("E1: só o CSS válido entrou na página (e é exportado ao salvar)", ok_rule, rule[-160:] or "regra ausente do getCss()")
    bg = await pg.evaluate("() => { const e = window.__vaiEditor.Canvas.getDocument().querySelector('.faixa-teste'); return e && getComputedStyle(e).backgroundColor }")
    check("E1: a faixa aparece com a cor pedida na tela", bg == "rgb(124, 92, 255)", str(bg))
    await b.close()

async def sc_E2(p):
    print("\n[E2] o modelo cria um problema e tenta terminar sem conferir")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_E2
    await ask(pg, "Adicione uma faixa", 1)
    if "DEBUG" in __import__("os").environ:
        for r in tool_results_seen(CUR["log"]): print("   tool_result:", r["content"][:600])
        for msgs in CUR["log"][-1:]:
            for mm in msgs:
                for blk in mm["content"]:
                    if blk.get("type") == "text" and mm["role"] == "user" and "VERIFICA" in blk["text"]: print("   AUTO:", blk["text"][:700])
    check("E2: o ciclo não aceitou terminar sem conferir (conferência automática rodou)", CUR.get("auto_check_seen"))
    check("E2: o problema apontado era do próprio elemento novo", bool(CUR.get("offender")))
    fixed = await pg.evaluate("() => { const d = window.__vaiEditor.Canvas.getDocument(), de = d.documentElement; const e = d.querySelector('.faixa-teste'); return { overflow: de.scrollWidth > de.clientWidth + 2, w: e ? Math.round(e.getBoundingClientRect().width) : null, cw: de.clientWidth } }")
    check("E2: depois da correção a página não rola para o lado e a faixa cabe", not fixed["overflow"] and fixed["w"] is not None and fixed["w"] <= fixed["cw"], str(fixed))
    info = await panel_info(pg)
    check("E2: o resultado final foi conferido sem problemas", info["verified"], str(info))
    await b.close()

async def sc_UNDO(p):
    print("\n[F2] o próprio modelo desfaz um passo que piorou")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_UNDO
    sig0 = await pg.evaluate(SIG)
    await ask(pg, "Teste um título gigante", 1)
    sig1 = await pg.evaluate(SIG)
    check("F2: undo_last_change devolveu a página exatamente ao estado anterior", sig1["hash"] == sig0["hash"], f"{sig1} {sig0}")
    info = await panel_info(pg)
    check("F2: o painel não lista mudanças que foram desfeitas", info["changes"] == 0, str(info))
    await b.close()

async def sc_SCOPE(p):
    print("\n[ESCOPO] só o elemento selecionado")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_SCOPE
    ids = await pg.evaluate("""() => { const ed = window.__vaiEditor, d = ed.Canvas.getDocument(); const hs = Array.from(d.querySelectorAll('h1,h2')); const c = ed.Components.allById()[hs[0].id]; ed.select(c); return { sel: hs[0].id, other: hs[1].id, colors: hs.map(h => getComputedStyle(h).color), bodyBg: getComputedStyle(d.body).backgroundColor } }""")
    CUR["other_id"] = ids["other"]
    await pg.wait_for_timeout(500)
    await ask(pg, "deixe esse elemento em vermelho", 1)
    after = await pg.evaluate("""(a) => { const d = window.__vaiEditor.Canvas.getDocument(); const hs = Array.from(d.querySelectorAll('h1,h2')); return { colors: hs.map(h => getComputedStyle(h).color), bodyBg: getComputedStyle(d.body).backgroundColor } }""", ids)
    check("ESCOPO: a ferramenta recusou mexer na página toda", isinstance(CUR.get("page_err"), str) and "selecionado" in CUR["page_err"], str(CUR.get("page_err"))[:100])
    check("ESCOPO: set_styles por tipo só alcançou o elemento selecionado", after["colors"][0] == "rgb(255, 59, 48)" and all(c == ids["colors"][i] for i, c in enumerate(after["colors"]) if i > 0), str(after["colors"][:3]))
    check("ESCOPO: o fundo da página não mudou", after["bodyBg"] == ids["bodyBg"])
    await b.close()

async def sc_BAD(p):
    print("\n[ROBUSTEZ] ferramenta inexistente e argumentos inválidos")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_BAD
    sig0 = await pg.evaluate(SIG)
    await ask(pg, "faça algo", 1)
    bad = CUR.get("bad") or []
    check("ROBUSTEZ: ferramenta inexistente, JSON inválido e id inexistente viram erros legíveis para o modelo", len(bad) == 3 and all(isinstance(x, str) and len(x) > 20 for x in bad), str(bad)[:200])
    sig1 = await pg.evaluate(SIG)
    check("ROBUSTEZ: nada foi alterado na página", sig0["hash"] == sig1["hash"])
    await b.close()

async def sc_LOOP(p):
    print("\n[LIMITES] modelo que nunca termina")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_LOOP
    t0 = time.time()
    await ask(pg, "loop infinito", 1)
    n = len(CUR["log"])
    info = await panel_info(pg)
    check("LIMITES: o ciclo parou sozinho no limite de passos (26)", n == 26, f"{n} chamadas ao modelo")
    check("LIMITES: o usuário recebe uma explicação clara", "limite de passos" in info["reply"], info["reply"][:100])
    await b.close()

async def sc_ABORT(p):
    print("\n[CANCELAR] botão Parar no meio da tarefa")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_ABORT
    CUR["delay"] = {3: 8}
    sig0 = await pg.evaluate(SIG)
    await pg.locator(".ed-ai-composer textarea").fill("espaçar as letras do título"); await pg.keyboard.press("Enter")
    await pg.wait_for_selector(".ed-ai-think", timeout=20000)
    await pg.wait_for_function("document.querySelectorAll('.ed-ai-think .step.done').length >= 3", timeout=30000)
    await pg.get_by_role("button", name="Parar").click()
    await pg.wait_for_function("document.querySelectorAll('.ed-ai-reply').length >= 1", timeout=30000)
    await pg.wait_for_timeout(500)
    info = await panel_info(pg)
    calls = len(CUR["log"])
    check("CANCELAR: parou e avisou que parou", "Parei" in info["reply"], info["reply"][:100])
    await pg.wait_for_timeout(1500)
    check("CANCELAR: nenhuma nova chamada ao modelo depois de parar", len(CUR["log"]) == calls)
    check("CANCELAR: o que já tinha sido feito continua listado e dá para desfazer", info["changes"] == 1)
    await pg.get_by_role("button", name="Antes").click(); await pg.wait_for_timeout(900)
    sig1 = await pg.evaluate(SIG)
    check("CANCELAR: 'Antes' restaura a página", sig1["hash"] == sig0["hash"])
    await b.close()

DARK_ON_DARK = '<section style="padding:48px 24px;background:#0b0b12"><div style="max-width:900px;margin:0 auto"><h2 style="color:#16161d;margin:0 0 12px">Nossos números</h2><p style="color:#202028;margin:0">Texto de exemplo que o modelo escreveu com a cor errada para esse fundo.</p></div></section>'

def scen_CONTRAST(m):  # the model forgets the text color: the tool fixes it and says so, no extra calls needed
    n = run_index(m)
    if n == 0: return turn(tu("insert_html", html=DARK_ON_DARK, where="page-end", label="Seção de números"))
    CUR["insert_result"] = results(m)[0] if n == 1 else CUR.get("insert_result")
    return turn(text="Criei a seção de números.")

def scen_QUICK(m):  # problems found in the answer of the tool itself, without a separate check_page call
    n = run_index(m)
    if n == 0: return turn(tu("insert_html", html=OVERFLOW_HTML, where="page-end", label="Faixa larga"))
    if n == 1:
        r = results(m)[0]
        CUR["quick"] = r
        iss = [x for x in r.get("issues_after", []) if x.get("type") == "horizontal_overflow"]
        if not iss: return turn(text="Sem problemas.")
        return turn(tu("set_styles", ids=[iss[0]["culprit"]["id"]], css={"width": "100%", "max-width": "100%"}, label="Faixa na largura da tela"),
                    tu("set_styles", ids=[r["id"]], css={"width": "100%", "box-sizing": "border-box"}, label="Seção na largura do contêiner"))
    return turn(text="Corrigi a faixa que passava da tela.")

def scen_RATE(m):  # = scenario A, but the provider answers "too many requests" first
    return scen_A(m)

def scen_THEME(m):
    n = run_index(m)
    if n == 0: return turn(tu("apply_theme", theme={"mood": "light", "accent": "#0a72f5", "radius": 12, "shadow": "soft", "headingWeight": 700}, label="Tema claro"))
    if n == 1: return turn(tu("check_page"))
    return turn(text="Deixei a página clara, com destaque azul.")

async def save_and_read(pg):
    CUR["saved"] = None
    await pg.locator("#ed-save-btn").click()
    await pg.wait_for_function("window.__vaiSavedProbe !== undefined || true", timeout=2000)
    for _ in range(40):
        if CUR["saved"]: break
        await pg.wait_for_timeout(250)
    blocks = (CUR["saved"] or {}).get("blocks", [])
    return "\n".join(b.get("generatedHtml", "") for b in blocks), len(blocks)

async def sc_SAVE(p):
    print("\n[SALVAR] o que o agente fez vai para o que é gravado e publicado")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_A
    await ask(pg, "Reescreva o título principal", 1)
    saved, n = await save_and_read(pg)
    check("SALVAR: a gravação tem os blocos da página", n >= 1, str(n))
    check("SALVAR: o título novo está no que é gravado", NEW_TITLE in re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", saved)), "")
    check("SALVAR: a tipografia nova está no CSS que é gravado", "font-size:56px" in saved.replace(" ", ""), "")
    await b.close()
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_THEME
    await ask(pg, "Deixe a página clara", 1)
    saved, n = await save_and_read(pg)
    flat = saved.replace(" ", "")
    check("SALVAR: o fundo claro do tema está no CSS gravado", "background-color:#ffffff" in flat or "background-color:rgb(255,255,255)" in flat, "")
    check("SALVAR: a cor de destaque dos botões está no CSS gravado", "#0a72f5" in flat or "rgb(10,114,245)" in flat, "")
    await b.close()

async def sc_CONTRAST(p):
    print("\n[TOKENS] texto ilegível numa seção nova é corrigido sozinho, sem gastar chamadas")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_CONTRAST
    await ask(pg, "Crie uma seção de números", 1)
    r = CUR.get("insert_result") or {}
    check("TOKENS: o resultado da ferramenta conta que ajustou o contraste", isinstance(r, dict) and "auto_fixed_contrast" in r, str(r)[:200])
    lum = await pg.evaluate("""() => { const d = window.__vaiEditor.Canvas.getDocument(); const h = Array.from(d.querySelectorAll('h2')).find(x => x.innerText.includes('Nossos números')); const c = getComputedStyle(h).color.match(/\\d+/g).map(Number); return (0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]) / 255 }""")
    check("TOKENS: o título agora é claro sobre o fundo escuro", lum > 0.7, str(lum))
    check("TOKENS: a tarefa gastou só 2 chamadas ao modelo (inserir + concluir)", len(CUR["log"]) == 2, str(len(CUR["log"])))
    info = await panel_info(pg)
    check("TOKENS: a conferência final passou sem problemas", info["verified"], str(info))
    await b.close()

async def sc_QUICK(p):
    print("\n[TOKENS] problemas voltam no resultado da própria ferramenta")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_QUICK
    await ask(pg, "Adicione uma faixa", 1)
    q = CUR.get("quick") or {}
    kinds = [x.get("type") for x in q.get("issues_after", [])]
    check("TOKENS: o resultado do insert_html já traz o overflow e o culpado", "horizontal_overflow" in kinds and any(x.get("culprit") for x in q.get("issues_after", [])), str(q)[:240])
    check("TOKENS: o modelo corrigiu na chamada seguinte e terminou (3 chamadas, nenhuma só para conferir)", len(CUR["log"]) == 3, str(len(CUR["log"])))
    fixed = await pg.evaluate("() => { const d = window.__vaiEditor.Canvas.getDocument(); const e = d.querySelector('.faixa-teste'); const de = d.documentElement; return e.getBoundingClientRect().right <= de.clientWidth + 2 }")
    check("TOKENS: a faixa cabe na tela depois da correção", fixed)
    info = await panel_info(pg)
    check("TOKENS: a conferência final passou sem problemas", info["verified"], str(info))
    await b.close()

async def sc_RATE(p):
    print("\n[LIMITE DO PROVEDOR] o provedor pede para esperar: o agente espera, tenta de novo e conclui")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_RATE
    CUR["rate_fail"] = 2
    t0 = time.time()
    await pg.locator(".ed-ai-composer textarea").fill("Reescreva o título principal"); await pg.keyboard.press("Enter")
    seen_wait = False
    for _ in range(80):
        txt = await pg.evaluate("() => Array.from(document.querySelectorAll('.ed-ai-think .step')).map(x => x.innerText).join(' | ')")
        if "Aguardando o limite" in txt: seen_wait = True
        if await pg.evaluate("() => document.querySelectorAll('.ed-ai-reply').length") >= 1: break
        await pg.wait_for_timeout(500)
    await pg.wait_for_timeout(800)
    took = time.time() - t0
    h1 = await pg.evaluate("() => window.__vaiEditor.Canvas.getDocument().querySelector('h1').innerText.replace(/\\s+/g,' ').trim()")
    check("LIMITE: o usuário vê que o agente está esperando o limite do provedor", seen_wait)
    check("LIMITE: o provedor recusou 2 vezes e a tarefa terminou mesmo assim com o resultado certo", CUR["rate_hits"] == 2 and h1 == NEW_TITLE, f"hits={CUR['rate_hits']} h1={h1}")
    check("LIMITE: o agente esperou de verdade antes de tentar de novo (>= 7s)", took >= 7, f"{took:.1f}s")
    await b.close()
    # the limit never lifts: the task stops with a clear message and offers to continue
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_RATE
    CUR["rate_fail"] = 999
    await pg.locator(".ed-ai-composer textarea").fill("Reescreva o título principal"); await pg.keyboard.press("Enter")
    await pg.wait_for_function("document.querySelectorAll('.ed-ai-reply').length >= 1", timeout=120000)
    info = await panel_info(pg)
    check("LIMITE: se o limite não libera, a tarefa explica o motivo", "limite de pedidos por minuto" in info["reply"], info["reply"][:120])
    check("LIMITE: oferece 'Continuar de onde parou'", await pg.get_by_role("button", name="Continuar de onde parou").count() == 1)
    check("LIMITE: tentou 5 vezes no total, sem martelar o provedor", CUR["rate_hits"] == 5, str(CUR["rate_hits"]))
    CUR["rate_fail"] = 0
    CUR["fn"] = scen_A
    await pg.get_by_role("button", name="Continuar de onde parou").click()
    await pg.wait_for_function("document.querySelectorAll('.ed-ai-reply').length >= 2", timeout=60000)
    await pg.wait_for_timeout(600)
    h1 = await pg.evaluate("() => window.__vaiEditor.Canvas.getDocument().querySelector('h1').innerText.replace(/\\s+/g,' ').trim()")
    check("LIMITE: 'Continuar' retoma e termina o trabalho", h1 == NEW_TITLE, h1)
    await b.close()

async def sc_PACE(p):
    print("\n[RITMO] planos grátis: o agente espaça os pedidos")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_A
    CUR["provider"] = "groq"
    await ask(pg, "Reescreva o título principal", 1)
    st = CUR["stamps"]
    gaps = [b_ - a_ for a_, b_ in zip(st, st[1:])]
    check("RITMO: com provedor de plano grátis há pelo menos 2,4s entre dois pedidos ao modelo", len(gaps) >= 3 and min(gaps) >= 2.3, str([round(g, 1) for g in gaps]))
    await b.close()


# ───────────────────────── site identity + carousels ─────────────────────────
def first_text(log):
    return " ".join(b.get("text", "") for b in log[0][-1]["content"] if b.get("type") == "text")

def scen_CAROUSEL(m):
    n = run_index(m)
    if n == 0: return turn(tu("find_widgets"))
    rs = results(m)
    if n == 1:
        lst = (rs[0] or {}).get("carrosseis", []) if rs and isinstance(rs[0], dict) else []
        CUR["widgets"] = lst
        best = max(lst, key=lambda w: w["slides"]) if lst else None
        if not best: return turn(text="Não achei carrossel.")
        CUR["cid"] = best["id"]
        return turn(tu("make_carousel", container_id=best["id"], interval_s=2, label="Carrossel de depoimentos"))
    if n == 2:
        CUR["made"] = rs[0] if rs else None
        return turn(tu("check_page"))
    CUR["check"] = rs[0] if rs else None
    return turn(text="O carrossel de depoimentos agora troca sozinho a cada 2 segundos.")

JS_MOTION = """async (cid) => {
  const d = window.__vaiEditor.Canvas.getDocument(), w = d.defaultView
  const box = d.querySelector('.vaic'); if (!box) return {err: 'no .vaic container'}
  const sl = [...box.querySelectorAll(':scope > .vaic-s')]
  const seen = [], overlap = []
  for (let k = 0; k < 14; k++) {
    const v = sl.map((e, i) => { const c = w.getComputedStyle(e), r = e.getBoundingClientRect(); return c.visibility !== 'hidden' && parseFloat(c.opacity) > .5 && r.height > 0 ? i : -1 }).filter(i => i >= 0)
    seen.push(v.join('+') || '-')
    await new Promise(r => setTimeout(r, 300))
  }
  return {slides: sl.length, seen, height: Math.round(box.getBoundingClientRect().height)}
}"""

async def sc_CAROUSEL(p):
    if FIX != "gpy": print("\n[CARROSSEL] (pulado: usa o fixture gpy)"); return
    print("\n[CARROSSEL] a IA já começa sabendo da identidade e dos carrosséis; monta um que gira de verdade e a prova sobrevive ao salvar")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_CAROUSEL
    CUR["widgets"] = None; CUR["made"] = None; CUR["check"] = None
    await ask(pg, "Faça o carrossel de depoimentos funcionar", 1)
    ft = first_text(CUR["log"])
    check("IDENTIDADE: a primeira mensagem traz a identidade visual do site", "IDENTIDADE VISUAL DESTE SITE" in ft and "Cor de destaque" in ft and "Fontes:" in ft, ft[:300])
    check("FIDELIDADE: num clone saudável nenhuma seção é apontada como reconstruída (sem falso alarme)", "SEÇÕES QUE JÁ NÃO PARECEM COM O ORIGINAL" not in ft, ft[ft.find("SEÇÕES"):][:240])
    check("IDENTIDADE: a primeira mensagem lista os carrosséis detectados", "CARROSSÉIS E SLIDERS DETECTADOS" in ft and "carrossel id" in ft, ft[ft.find("CARROSSÉIS"):][:300])
    w = CUR["widgets"] or []
    check("DETECÇÃO: achou o carrossel de depoimentos (10 slides empilhados)", any(x["slides"] >= 8 for x in w), json.dumps(w)[:300])
    mk = CUR["made"] or {}
    ver = (mk.get("verificacao") if isinstance(mk, dict) else None) or {}
    check("MAKE_CAROUSEL: a verificação da própria ferramenta diz que gira", ver.get("verdict") == "gira", json.dumps(mk)[:300])
    info = await pg.evaluate(JS_MOTION, CUR.get("cid"))
    shown = {x for x in info.get("seen", []) if x.isdigit()}
    check("MOVIMENTO (medido por fora, no canvas): vários slides aparecem, um de cada vez", len(shown) >= 2 and all('+' not in x for x in info.get("seen", [])), json.dumps(info)[:300])
    try:
        await pg.evaluate("() => { const d = window.__vaiEditor.Canvas.getDocument(); d.querySelector('.vaic').scrollIntoView({block: 'center'}) }")
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=OUT + '/carousel_editor.png')
    except Exception: pass
    chk = CUR["check"] or {}
    check("CHECK_PAGE: depois do carrossel a página não tem problema aberto", isinstance(chk, dict) and not [i for i in chk.get("issues", []) if i.get("type") == "carousel_not_moving"], json.dumps(chk)[:300])
    saved, n = await save_and_read(pg)
    check("SALVAR: as regras do carrossel estão no que é gravado", "vaic-" in saved and "@keyframes" in saved and ":has(" in saved, saved[:120])
    # the saved block, opened in a plain page (no editor): it must still turn
    page2 = await b.new_page(viewport={"width": 1100, "height": 800})
    html = "<!doctype html><html><body style='margin:0;background:#0a1628'>" + saved + "</body></html>"
    await page2.set_content(html)
    out = await page2.evaluate("""async () => {
      const box = document.querySelector('.vaic'); if (!box) return {err: 'sem .vaic no HTML salvo'}
      const sl = [...box.querySelectorAll(':scope > .vaic-s')], seen = []
      for (let k = 0; k < 14; k++) { seen.push(sl.map((e, i) => { const c = getComputedStyle(e); return c.visibility !== 'hidden' && parseFloat(c.opacity) > .5 && e.getBoundingClientRect().height > 0 ? i : -1 }).filter(i => i >= 0).join('+') || '-'); await new Promise(r => setTimeout(r, 300)) }
      return {slides: sl.length, seen}
    }""")
    shown2 = {x for x in out.get("seen", []) if x.isdigit()}
    check("SALVAR: o bloco gravado, aberto fora do editor, continua girando", len(shown2) >= 2, json.dumps(out)[:300])
    try:
        await page2.screenshot(path=OUT + '/carousel_saved.png')
    except Exception: pass
    dots = await page2.evaluate("""async () => {
      const all = [...document.querySelectorAll('.vaic-dot')]
      const inOriginal = [...document.querySelectorAll('.tdots .vaic-dot')].length
      const act = []
      for (let k = 0; k < 14; k++) {
        const bgs = all.map(d => getComputedStyle(d).backgroundColor)
        const common = bgs.sort ? [...bgs].sort((a, b) => bgs.filter(x => x === a).length - bgs.filter(x => x === b).length).pop() : ''
        const cur = all.map(d => getComputedStyle(d).backgroundColor)
        act.push(cur.findIndex(c => c !== common))
        await new Promise(r => setTimeout(r, 300))
      }
      return {count: all.length, inOriginal, act, arrows: document.querySelectorAll('[class*=vaic-gone]').length}
    }""")
    check("BOLINHAS ORIGINAIS: uma única fileira, com as 10 bolinhas do site (sem fileira nova duplicada)", dots["count"] == 10 and dots["inOriginal"] == 10, json.dumps(dots))
    check("BOLINHAS ORIGINAIS: a bolinha ativa acompanha o slide (muda sozinha)", len({x for x in dots["act"] if x >= 0}) >= 2, json.dumps(dots))
    dots_ok = dots["count"] >= 2
    check("SALVAR: as bolinhas clicáveis foram gravadas", dots_ok, "")
    # clicking a dot shows exactly that slide
    await page2.evaluate("() => document.querySelector('.vaic-dot.vaic-d-3').click()")
    await page2.wait_for_timeout(400)
    pick = await page2.evaluate("""() => { const sl = [...document.querySelectorAll('.vaic > .vaic-s')]; return sl.map((e, i) => { const c = getComputedStyle(e); return c.visibility !== 'hidden' && parseFloat(c.opacity) > .5 ? i : -1 }).filter(i => i >= 0) }""")
    check("BOLINHA: clicar na bolinha 4 mostra só o slide 4", pick == [3], str(pick))
    await b.close()

def scen_IDENT(m):
    n = run_index(m)
    if n == 0:
        return turn(tu("insert_html", where="page-end", label="Faixa de aviso",
            html='<section style="background:#ff00ff;padding:48px 24px;text-align:center;font-family:Comic Sans MS"><h2 style="color:#00ff00;font-size:32px;margin:0">Oferta especial</h2><p style="color:#ffff00">Só hoje</p></section>'))
    rs = results(m)
    CUR.setdefault("ident", []).append(rs[0] if rs else None)
    if n == 1: return turn(tu("check_page"))
    return turn(text="Criei a faixa de aviso.")

async def sc_IDENT(p):
    if FIX != "gpy": print("\n[IDENTIDADE] (pulado: usa o fixture gpy)"); return
    print("\n[IDENTIDADE] algo criado fora da identidade do site é apontado na hora, com a cor certa para trocar")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_IDENT; CUR["ident"] = []
    await ask(pg, "Crie uma faixa de aviso no fim da página", 1)
    first = CUR["ident"][0] if CUR["ident"] else None
    warn = (first.get("identity_warnings") if isinstance(first, dict) else None) or []
    check("IDENTIDADE: a ferramenta avisa que as cores e a fonte fogem do site", len(warn) >= 2, json.dumps(first)[:300])
    check("IDENTIDADE: o aviso sugere a cor mais parecida da paleta do site", any(re.search(r"mais parecida é #[0-9a-f]{6}", w) for w in warn), "; ".join(warn)[:200])
    check("IDENTIDADE: o aviso aponta a fonte errada", any("fonte" in w for w in warn), "; ".join(warn)[:200])
    ft = first_text(CUR["log"])
    m = re.search(r"Cor de destaque[^#]*(#[0-9a-f]{6})", ft)
    r = (int(m.group(1)[1:3], 16), int(m.group(1)[3:5], 16), int(m.group(1)[5:7], 16)) if m else (0, 0, 0)
    check("IDENTIDADE: o destaque medido é o laranja do golpay", bool(m) and r[0] > 200 and r[1] < 150 and r[2] < 90, ft[ft.find("Cor de destaque"):][:120])
    await b.close()


def scen_REPAIR(m):
    n = run_index(m)
    if n == 0: return turn(tu("find_widgets"))
    rs = results(m)
    if n == 1:
        lst = (rs[0] or {}).get("carrosseis", []) if rs and isinstance(rs[0], dict) else []
        CUR["widgets"] = lst
        if not lst: return turn(text="Não achei carrossel.")
        CUR["cid"] = lst[0]["id"]
        return turn(tu("make_carousel", container_id=lst[0]["id"], interval_s=2))
    if n == 2:
        CUR["made"] = rs[0] if rs else None
        return turn(tu("check_page"))
    CUR["check"] = rs[0] if rs else None
    return turn(text="O carrossel de depoimentos troca sozinho agora.")

async def sc_REPAIR(p):
    if FIX != "gpy2": print("\n[REPARO] (pulado: usa o fixture gpy2)"); return
    print("\n[REPARO] página já estragada por tentativas anteriores: a IA acha o carrossel, faz girar apesar do CSS antigo, e problemas herdados não contam")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_REPAIR; CUR["widgets"] = None; CUR["made"] = None; CUR["check"] = None
    await ask(pg, "Faça o carrossel funcionar", 1)
    ft = first_text(CUR["log"])
    check("REPARO: a identidade lê o tema escuro real da página (sem falso alarme de página ilegível)", "Tema ESCURO" in ft and "ATENÇÃO" not in ft, ft[ft.find("IDENTIDADE"):][:260])
    check("REPARO: a primeira mensagem aponta a seção dos depoimentos como reconstruída (não parece mais o original)", "SEÇÕES QUE JÁ NÃO PARECEM COM O ORIGINAL" in ft and "restore_original_block" in ft, ft[ft.find("SEÇÕES"):][:300])
    check("REPARO: o carrossel feito à mão antes é reconhecido", bool(CUR["widgets"]), json.dumps(CUR["widgets"])[:200])
    mk = CUR["made"] or {}
    ver = (mk.get("verificacao") if isinstance(mk, dict) else None) or {}
    check("REPARO: a verificação diz que gira, mesmo com as regras antigas (animation:none !important) ainda no CSS", ver.get("verdict") == "gira", json.dumps(mk)[:300])
    info = await pg.evaluate(JS_MOTION, CUR.get("cid"))
    shown = {x for x in info.get("seen", []) if x.isdigit()}
    check("REPARO: medido por fora no canvas, os slides trocam um de cada vez", len(shown) >= 2 and all('+' not in x for x in info.get("seen", [])), json.dumps(info)[:300])
    dots = await pg.evaluate("() => { const d = window.__vaiEditor.Canvas.getDocument(); return {all: d.querySelectorAll('.vaic-dot').length, nav: d.querySelectorAll('.vaic-nav').length} }")
    check("REPARO: as bolinhas que já existiam foram religadas (sem uma segunda fileira)", dots["all"] == 10 and dots["nav"] == 0, json.dumps(dots))
    chk = CUR["check"] or {}
    check("REPARO: a conferência não conta como pendência o que já existia na página", isinstance(chk, dict) and chk.get("ok") is True and (chk.get("ignorados_ja_existiam") or 0) >= 1, json.dumps(chk)[:300])
    pan = await panel_info(pg)
    check("REPARO: o painel mostra a conferência sem problemas em aberto", pan.get("verified") is True, json.dumps(pan)[:200])
    await b.close()


def scen_RESTORE(m):
    n = run_index(m)
    rs = results(m)
    if n == 0: return turn(tu("find_widgets"), tu("get_design_skill", names=["carrossel-e-sliders"]))
    if n == 1:
        lst = (rs[0] or {}).get("carrosseis", []) if rs and isinstance(rs[0], dict) else []
        CUR["w0"] = lst; CUR["skill_text"] = rs[1] if len(rs) > 1 else ""
        if not lst: return turn(text="Não achei carrossel.")
        CUR["cid"] = lst[0]["id"]
        return turn(tu("get_original_html", id=lst[0]["id"], around="tdots", max_chars=3000), tu("restore_original_block", id=lst[0]["id"], label="Voltar ao visual do original"))
    if n == 2:
        CUR["orig_html"] = rs[0] if rs else None; CUR["restored"] = rs[1] if len(rs) > 1 else None
        return turn(tu("find_widgets"))
    if n == 3:
        lst = (rs[0] or {}).get("carrosseis", []) if rs and isinstance(rs[0], dict) else []
        CUR["w1"] = lst
        best = max(lst, key=lambda w: w["slides"]) if lst else None
        if not best: return turn(text="Sem carrossel depois de restaurar.")
        CUR["cid"] = best["id"]
        return turn(tu("make_carousel", container_id=best["id"], interval_s=2, label="Carrossel funcionando"))
    if n == 4:
        CUR["made"] = rs[0] if rs else None
        return turn(tu("check_page"))
    CUR["check"] = rs[0] if rs else None
    return turn(text="Restaurei o visual original dos depoimentos e fiz o carrossel trocar sozinho.")

async def sc_RESTORE(p):
    if FIX != "gpy2": print("\n[RESTAURAR] (pulado: usa o fixture gpy2)"); return
    print("\n[RESTAURAR] seção estragada por tentativas antigas: a IA lê o original, restaura e só então faz o carrossel, mantendo a cara do site")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_RESTORE
    for k in ("w0", "w1", "skill_text", "orig_html", "restored", "made", "check"): CUR[k] = None
    CUR["orig_calls"] = []
    await ask(pg, "Faça o carrossel de depoimentos funcionar, mantendo o visual que ele tinha no site original", 1)
    ft = first_text(CUR["log"])
    check("SKILLS: a primeira mensagem já traz a skill de fidelidade ao original e a de carrossel", "Fidelidade ao site original" in ft and "Carrossel e slider" in ft, ft[ft.find("SKILLS"):][:200])
    check("SKILLS: get_design_skill devolve o guia pedido", isinstance(CUR["skill_text"], str) and "make_carousel" in CUR["skill_text"], str(CUR["skill_text"])[:160])
    oh = CUR["orig_html"] if isinstance(CUR["orig_html"], dict) else {}
    check("ORIGINAL: get_original_html entrega o HTML original da seção (com o pager .tdots)", "tdots" in (oh.get("html") or "") or "tcarousel" in (oh.get("html") or ""), json.dumps(oh)[:200])
    rt = CUR["restored"] if isinstance(CUR["restored"], dict) else {}
    check("RESTAURAR: restore_original_block trocou a seção e devolveu o id novo", bool(rt.get("restaurada")) and bool(rt.get("novo_id")), json.dumps(rt)[:240])
    look = await pg.evaluate("""() => {
      const d = window.__vaiEditor.Canvas.getDocument(), w = d.defaultView
      const dots = d.querySelector('.tdots'); if (!dots) return {err: 'sem .tdots'}
      const items = [...dots.children]
      const tops = items.map(e => Math.round(e.getBoundingClientRect().top)), lefts = items.map(e => Math.round(e.getBoundingClientRect().left))
      const sl = d.querySelector('.tslide') ; const c = w.getComputedStyle(sl)
      const color = c.backgroundColor, rad = parseFloat(c.borderTopLeftRadius), bw = parseFloat(c.borderTopWidth), pad = parseFloat(c.paddingTop)
      const dc = w.getComputedStyle(dots)
      return {n: items.length, sameRow: new Set(tops).size === 1, increasing: lefts.every((x, i) => i === 0 || x > lefts[i-1]), dotsDisplay: dc.display, dir: dc.flexDirection, radius: rad, border: bw, padding: pad, bg: color}
    }""")
    check("VISUAL ORIGINAL: as bolinhas voltaram a ser uma fileira horizontal", look.get("sameRow") is True and look.get("increasing") is True and look.get("dotsDisplay") == "flex", json.dumps(look))
    check("VISUAL ORIGINAL: o slide voltou a ser um cartão (borda, raio e padding do original)", (look.get("border") or 0) >= 1 and (look.get("radius") or 0) >= 10 and (look.get("padding") or 0) >= 14, json.dumps(look))
    mk = CUR["made"] if isinstance(CUR["made"], dict) else {}
    check("CARROSSEL: depois de restaurar, make_carousel religa as bolinhas originais e gira", (mk.get("verificacao") or {}).get("verdict") == "gira" and "religadas" in str((mk.get("carrossel") or {}).get("bolinhas", "")), json.dumps(mk)[:300])
    info = await pg.evaluate(JS_MOTION, CUR.get("cid"))
    shown = {x for x in info.get("seen", []) if x.isdigit()}
    check("CARROSSEL: medido por fora, os slides trocam um de cada vez", len(shown) >= 2 and all('+' not in x for x in info.get("seen", [])), json.dumps(info)[:240])
    after = await pg.evaluate("""() => { const d = window.__vaiEditor.Canvas.getDocument(); const dots = d.querySelector('.tdots'); const items = dots ? [...dots.children] : []; const tops = new Set(items.map(e => Math.round(e.getBoundingClientRect().top))); return {n: items.length, labels: items.filter(e => e.tagName === 'LABEL').length, oneRow: tops.size === 1, extraNav: d.querySelectorAll('.vaic-nav').length} }""")
    check("CARROSSEL: continua uma única fileira horizontal, as 10 bolinhas do site, sem fileira duplicada", after["n"] == 10 and after["labels"] == 10 and after["oneRow"] and after["extraNav"] == 0, json.dumps(after))
    chk = CUR["check"] if isinstance(CUR["check"], dict) else {}
    check("CONFERÊNCIA: sem problemas em aberto", chk.get("ok") is True, json.dumps(chk)[:240])
    try:
        await pg.evaluate("() => { const d = window.__vaiEditor.Canvas.getDocument(); d.querySelector('.tcarousel, .vaic').scrollIntoView({block: 'center'}) }")
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=OUT + '/restore_editor.png')
    except Exception: pass
    saved, n = await save_and_read(pg)
    check("SALVAR: o que é gravado tem o carrossel e o cartão restaurado", "vaic-" in saved and "tslide" in saved and "tdots" in saved, saved[:100])
    await b.close()


def scen_PAGE(m):
    n = run_index(m)
    rs = results(m)
    if n == 0: return turn(tu("get_site_style"))
    if n == 1:
        CUR["style0"] = rs[0] if rs else None
        return turn(tu("restore_original_page", label="Voltar a página ao visual do original"))
    if n == 2:
        CUR["page_res"] = rs[0] if rs else None
        return turn(tu("get_site_style"), tu("find_widgets"))
    if n == 3:
        CUR["style1"] = rs[0] if rs else None
        lst = (rs[1] or {}).get("carrosseis", []) if len(rs) > 1 and isinstance(rs[1], dict) else []
        CUR["w1"] = lst
        best = max(lst, key=lambda w: w["slides"]) if lst else None
        if not best: return turn(text="Sem carrossel.")
        CUR["cid"] = best["id"]
        return turn(tu("make_carousel", container_id=best["id"], interval_s=2))
    if n == 4:
        CUR["made"] = rs[0] if rs else None
        return turn(tu("check_page"))
    CUR["check"] = rs[0] if rs else None
    return turn(text="Devolvi a página ao visual do original e fiz o carrossel trocar sozinho.")

async def sc_PAGE(p):
    if FIX != "gpy2": print("\n[PÁGINA ORIGINAL] (pulado: usa o fixture gpy2)"); return
    print("\n[PÁGINA ORIGINAL] página inteira quebrada por edições antigas: a IA vê o ATENÇÃO, restaura tudo e a identidade volta a ser a do original")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_PAGE
    for k in ("style0", "style1", "page_res", "w1", "made", "check"): CUR[k] = None
    CUR["orig_calls"] = []
    await ask(pg, "Faça o carrossel funcionar com a cara do site original", 1)
    s0 = (CUR["style0"] or {}) if isinstance(CUR["style0"], dict) else {}
    check("PÁGINA: a identidade medida antes de restaurar já é a escura do site", (s0.get("identidade") or {}).get("mood") == "dark" and "ATENÇÃO" not in str(s0.get("resumo", "")), str(s0)[:200])
    pr = CUR["page_res"] if isinstance(CUR["page_res"], dict) else {}
    check("PÁGINA: restore_original_page restaurou as 9 seções do original", pr.get("secoes_restauradas") == 9, json.dumps(pr)[:240])
    s1 = (CUR["style1"] or {}) if isinstance(CUR["style1"], dict) else {}
    idt = s1.get("identidade") or {}
    check("PÁGINA: depois de restaurar, a identidade medida é a do original (escura, sem aviso de quebrada)", idt.get("mood") == "dark" and not idt.get("note"), "mood=%s pageBg=%s text=%s note=%s" % (idt.get("mood"), idt.get("pageBg"), idt.get("text"), str(idt.get("note"))[:200]))
    look = await pg.evaluate("""() => {
      const d = window.__vaiEditor.Canvas.getDocument(), w = d.defaultView
      const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4) }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]) }
      const back = el => { for (let n = el; n; n = n.parentElement) { const c = w.getComputedStyle(n).backgroundColor; const m = c.match(/[\d.]+/g); if (m && (m.length < 4 || parseFloat(m[3]) > .5)) return c } return 'rgb(255, 255, 255)' }
      const sl = d.querySelector('.tslide'), hero = d.querySelector('.hero') || d.querySelector('section'); const h1 = d.querySelector('h1,h2')
      const ink = w.getComputedStyle(h1).color
      return {cardBack: lum(back(sl)), heroBack: lum(back(hero)), headingInk: lum(ink), slideInk: lum(w.getComputedStyle(sl.querySelector('p') || sl).color)}
    }""")
    check("PÁGINA: o fundo voltou a ser escuro e o texto claro (legível), como no original", look["heroBack"] < 0.12 and look["headingInk"] > 0.5 and look["cardBack"] < 0.2, json.dumps(look))
    mk = CUR["made"] if isinstance(CUR["made"], dict) else {}
    check("PÁGINA: o carrossel gira depois de restaurar", (mk.get("verificacao") or {}).get("verdict") == "gira", json.dumps(mk)[:260])
    chk = CUR["check"] if isinstance(CUR["check"], dict) else {}
    check("PÁGINA: conferência sem problemas em aberto", chk.get("ok") is True, json.dumps(chk)[:260])
    saved, n = await save_and_read(pg)
    flat = saved.replace(" ", "")
    check("PÁGINA: o que é gravado mantém as seções originais, com a classe e o fundo escuro de cada uma", n == 9 and 'class="hero"' in saved and "background-color:rgb(10,22,40)" in flat, "n=%s hero=%s" % (n, 'class="hero"' in saved))
    check("PÁGINA: o que é gravado mantém o carrossel e as bolinhas originais", "vaic-" in saved and "tdots" in saved and "tslide" in saved, saved[:80])
    try:
        await pg.evaluate("() => { const d = window.__vaiEditor.Canvas.getDocument(); d.querySelector('.tcarousel, .vaic').scrollIntoView({block: 'center'}) }")
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=OUT + '/page_restore_editor.png')
    except Exception: pass
    await b.close()


def scen_LEGACY(m):
    return turn(text="Esta página foi clonada no formato antigo e o responsivo do original não pode ser recuperado por edições. O jeito é clonar a página de novo.")

async def sc_LEGACY(p):
    if FIX != "gpy3": print("\n[FORMATO ANTIGO] (pulado: usa o fixture gpy3)"); return
    print("\n[FORMATO ANTIGO] página clonada no formato antigo: a IA é avisada de que o responsivo do original não existe e deve dizer isso, não piorar a página")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_LEGACY
    await ask(pg, "Deixe o site responsivo como o original", 1)
    ft = first_text(CUR["log"])
    check("FORMATO ANTIGO: a primeira mensagem avisa que o responsivo do original não existe nesta página", "FORMATO ANTIGO DA CLONAGEM" in ft and "clonar a página de novo" in ft and "restore_original_page" in ft, ft[ft.find("FORMATO"):][:300])
    pan = await panel_info(pg)
    check("FORMATO ANTIGO: a resposta ao usuário explica e a página não foi alterada", pan["changes"] == 0 and "clonar" in pan["reply"], json.dumps(pan)[:200])
    await b.close()

def scen_REGRESS(m):
    n = run_index(m)
    rs = results(m)
    if n == 0: return turn(tu("add_css", css=".nav-links{display:flex!important;position:static!important}", label="Ajustar o menu"))
    if n == 1: return turn(tu("check_page", viewport="mobile"))
    if n == 2:
        CUR["reg_before"] = rs[0] if rs else None
        return turn(tu("undo_last_change"))
    if n == 3: return turn(tu("check_page", viewport="mobile"))
    CUR["reg_after"] = rs[0] if rs else None
    return turn(text="Desfiz o ajuste do menu porque ele quebrava o celular.")

JS_DRIFT = """async () => { const g = window.__vaiEditor.__guard; if (!g) return {err: 'sem guarda'}; const d = await g.layoutDrift('mobile'); return d }"""

async def sc_REGRESS(p):
    if FIX != "gpy": print("\n[REGRESSÃO NO CELULAR] (pulado: usa o fixture gpy)"); return
    print("\n[REGRESSÃO NO CELULAR] uma regra da IA sem @media que quebra o menu do celular é apontada pelo check_page e desfeita")
    b, pg, errs = await open_editor(p)
    CUR["fn"] = scen_REGRESS; CUR["reg_before"] = None; CUR["reg_after"] = None
    d0 = await pg.evaluate(JS_DRIFT)
    check("CELULAR: o clone novo começa igual ao original no celular (sem diferenças)", isinstance(d0, dict) and not d0.get("elements") and not d0.get("overflow"), json.dumps(d0)[:300])
    await ask(pg, "Ajuste o menu", 1)
    rb = CUR["reg_before"] if isinstance(CUR["reg_before"], dict) else {}
    drift = [i for i in rb.get("issues", []) if i.get("type") == "mobile_drift"]
    check("CELULAR: check_page aponta que a regra sem @media deixou o celular diferente (menu aparece)", bool(drift) and "nav" in drift[0].get("message", ""), json.dumps(rb)[:400])
    ra = CUR["reg_after"] if isinstance(CUR["reg_after"], dict) else {}
    check("CELULAR: depois de desfazer, o celular volta ao que era", not any(i.get("type") == "mobile_drift" for i in ra.get("issues", [])), json.dumps(ra)[:300])
    d1 = await pg.evaluate(JS_DRIFT)
    check("CELULAR: medido por fora, nada difere do original depois do undo", isinstance(d1, dict) and not d1.get("elements"), json.dumps(d1)[:300])
    await b.close()

def scen_GUARD(m):
    n = run_index(m)
    if n == 0: return turn(tu("set_styles", ids=[CUR["navid"]], css={"display": "flex", "justify-content": "flex-start"}, label="Ajustar o menu"))
    if n == 1: return turn(tu("check_page", viewport="mobile"))
    return turn(text="Ajustei o menu.")

async def sc_GUARD(p):
    if FIX != "gpy2": print("\n[PROTEÇÃO] (pulado: usa o fixture gpy2)"); return
    print("\n[PROTEÇÃO] página do formato antigo: uma mudança de layout no Desktop não pode desfazer o desenho do celular")
    b, pg, errs = await open_editor(p)
    nid = await pg.evaluate("() => { const d = window.__vaiEditor.Canvas.getDocument(); const n = d.querySelector('.nav-links'); return n ? n.id : null }")
    CUR["navid"] = nid
    check("PROTEÇÃO: achei o menu da página para o teste", bool(nid), str(nid))
    CUR["fn"] = scen_GUARD
    await ask(pg, "Ajuste o menu no desktop", 1)
    await pg.wait_for_timeout(4500)
    d = await pg.evaluate(JS_DRIFT)
    navdiff = [e for e in (d or {}).get("elements", []) if "nav-links" in (e.get("label") or "") and e.get("prop") == "display"]
    check("PROTEÇÃO: depois da mudança no Desktop o menu continua escondido no celular, como no original", isinstance(d, dict) and not navdiff, json.dumps(d)[:400])
    await b.close()

SC = {"LEGACY": sc_LEGACY, "REGRESS": sc_REGRESS, "GUARD": sc_GUARD, "PAGE": sc_PAGE, "RESTORE": sc_RESTORE, "REPAIR": sc_REPAIR, "CAROUSEL": sc_CAROUSEL, "IDENT": sc_IDENT, "A": sc_A, "B": sc_B, "C": sc_C, "D": sc_D, "E1": sc_E1, "E2": sc_E2, "UNDO": sc_UNDO, "SCOPE": sc_SCOPE, "BAD": sc_BAD, "LOOP": sc_LOOP, "ABORT": sc_ABORT, "SAVE": sc_SAVE, "CONTRAST": sc_CONTRAST, "QUICK": sc_QUICK, "RATE": sc_RATE, "PACE": sc_PACE}

async def main():
    srv = serve()
    async with async_playwright() as p:
        for name, fn in SC.items():
            if ONLY and name != ONLY: continue
            try: await fn(p)
            except Exception as e:
                import traceback; traceback.print_exc()
                check(f"{name}: o cenário rodou até o fim", False, repr(e)[:160])
    srv.terminate()
    bad = [n for n, ok in RESULTS if not ok]
    print(f"\n{len(RESULTS) - len(bad)}/{len(RESULTS)} verificações passaram" + ("" if not bad else "  |  FALHARAM: " + "; ".join(bad)))
asyncio.run(main())
