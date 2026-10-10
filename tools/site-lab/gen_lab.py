#!/usr/bin/env python3
"""Generates the lab: many kinds of funnel/landing/VSL/waiting sites to stress the cloner.
Each site gets www/<name>/index.html and an entry in expected.json (ground truth: screens of the
main path, all reachable screens, features)."""
import json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(ROOT, "www")
EXPECTED = {}

SVG = lambda color, label: "data:image/svg+xml;utf8," + (
    "%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='640' height='360' fill='%23" + color + "'/%3E"
    "%3Ctext x='320' y='190' font-size='40' text-anchor='middle' fill='white' font-family='sans-serif'%3E" + label + "%3C/text%3E%3C/svg%3E")


def page(name, head_extra="", body="", title=None):
    d = os.path.join(WWW, name)
    os.makedirs(d, exist_ok=True)
    html = f"""<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title or name}</title>{head_extra}</head><body>{body}</body></html>"""
    open(os.path.join(d, "index.html"), "w").write(html)


def quiz(name, steps=None, route="state", advance="auto", transition="none", ids=False, wrap=None, extra=None, gen=None, title=None, features=None):
    cfg = {"route": route, "advance": advance, "transition": transition, "ids": ids}
    if extra:
        cfg.update(extra)
    if gen:
        cfg["gen"] = gen
    else:
        cfg["steps"] = steps
    inner = '<div id="app"></div>'
    if wrap == "next":
        inner = '<div id="__next"><main id="main"><div id="app"></div></main></div>'
    body = inner + f'<script>window.QUIZ={json.dumps(cfg, ensure_ascii=False)}</script><script src="/quizlib.js"></script>'
    page(name, '<link rel="stylesheet" href="/quiz.css">', body, title or f"Quiz {name}")
    # ground truth
    S = steps
    if gen:
        n = gen["n"]
        S = []
        for k in range(1, n + 1):
            if gen.get("kind") == "mixed" and k % 7 == 0:
                S.append({"type": "info", "title": f"Você está indo bem! ({k})"})
            elif gen.get("kind") == "mixed" and k % 11 == 0:
                S.append({"type": "loader", "title": f"Calculando bloco {k}"})
            else:
                S.append({"type": "single", "title": f"Pergunta {k} de {n}"})
        S.append({"type": "result", "title": "Resultado final"})
    path, i, seen = [], 0, set()
    while i < len(S) and i not in seen:
        seen.add(i)
        path.append(S[i]["title"])
        s = S[i]
        nxt = i + 1
        if s.get("options") and isinstance(s["options"][0], dict) and s["options"][0].get("next") is not None:
            nxt = s["options"][0]["next"]
        elif s.get("next") is not None:
            nxt = s["next"]
        i = nxt
    reach = set()
    stack = [0]
    while stack:
        i = stack.pop()
        if i in reach or i >= len(S):
            continue
        reach.add(i)
        s = S[i]
        nexts = [i + 1]
        if s.get("next") is not None:
            nexts = [s["next"]]
        if s.get("options") and isinstance(s["options"][0], dict):
            nexts = [o.get("next", i + 1) for o in s["options"]]
        stack += nexts
    EXPECTED[name] = {"kind": "quiz", "main_path": path, "main_len": len(path), "reachable": len(reach), "total": len(S), "features": features or [], "route": route}


def static_site(name, html, kind, features=None, title=None):
    page(name, "", html, title or name)
    EXPECTED[name] = {"kind": kind, "features": features or []}


SIMPLE = [
    {"type": "info", "title": "Descubra seu plano ideal", "sub": "Responda 6 perguntas rápidas", "img": SVG("d0541f", "Bem-vindo"), "cta": "Começar"},
    {"type": "single", "title": "Qual é o seu objetivo?", "options": ["Emagrecer", "Ganhar massa", "Mais energia"]},
    {"type": "single", "title": "Como é sua rotina?", "options": ["Sedentária", "Ativa", "Muito ativa"]},
    {"type": "single", "title": "Quanto tempo você tem?", "options": ["10 minutos", "30 minutos", "1 hora"]},
    {"type": "single", "title": "Você já treinou antes?", "options": ["Nunca", "Um pouco", "Sempre"]},
    {"type": "loader", "title": "Montando seu plano…", "secs": 3, "msgs": ["Analisando respostas", "Escolhendo exercícios", "Finalizando"]},
    {"type": "result", "title": "Seu plano está pronto!", "sub": "Acesso imediato", "cta": "QUERO MEU PLANO", "href": "https://example.com/checkout", "cd": True},
]


def main():
    os.makedirs(WWW, exist_ok=True)

    # ---------- quizzes (different engines of routing / advancing / transitions) ----------
    quiz("q_state_auto", SIMPLE, ids=True, transition="fade", features=["state-swap", "auto-advance", "builder-ids", "loader", "countdown"])
    steps2 = [dict(s) for s in SIMPLE]
    steps2[2] = {"type": "multi", "title": "Quais são seus maiores desafios?", "options": ["Falta de tempo", "Falta de motivação", "Alimentação", "Sono ruim", "Dores"]}
    steps2[3] = {"type": "multi", "title": "O que você quer melhorar?", "options": ["Abdômen", "Pernas", "Braços", "Costas"]}
    quiz("q_state_cont", steps2, advance="continue", transition="slide", ids=False, features=["select-continue", "multi-select", "no-ids", "slide"])
    quiz("q_push", SIMPLE, route="push", ids=False, wrap="next", features=["pushState", "generic-ids"], transition="fade")
    quiz("q_hash", SIMPLE, route="hash", ids=True, features=["hash-routing"])
    forms = [
        {"type": "info", "title": "Vamos personalizar", "cta": "Começar"},
        {"type": "input", "title": "Qual é o seu nome?", "fields": [{"label": "Nome", "ph": "Seu nome"}]},
        {"type": "input", "title": "Seus contatos", "fields": [{"label": "E-mail", "type": "email", "ph": "voce@email.com"}, {"label": "WhatsApp", "type": "tel", "ph": "(11) 99999-0000"}]},
        {"type": "select", "title": "Qual a sua idade?", "options": ["18-24", "25-34", "35-44", "45+"]},
        {"type": "slider", "title": "Quantos kg quer perder?", "min": 0, "max": 30},
        {"type": "result", "title": "Obrigado, receba no seu e-mail", "cta": "ACESSAR", "href": "https://example.com/obrigado"},
    ]
    quiz("q_forms", forms, advance="continue", ids=True, features=["text-input", "email", "tel", "select", "slider", "lead-capture"])
    branch = [
        {"type": "single", "title": "Qual é o seu perfil?", "options": [{"t": "Iniciante", "next": 1}, {"t": "Intermediário", "next": 3}, {"t": "Avançado", "next": 5}]},
        {"type": "info", "title": "Trilha iniciante A", "next": 2},
        {"type": "single", "title": "Iniciante: o que mais te trava?", "options": [{"t": "Tempo", "next": 7}, {"t": "Dinheiro", "next": 7}]},
        {"type": "info", "title": "Trilha intermediária", "next": 4},
        {"type": "single", "title": "Intermediário: seu foco?", "options": [{"t": "Força", "next": 7}, {"t": "Resistência", "next": 7}]},
        {"type": "info", "title": "Trilha avançada", "next": 6},
        {"type": "single", "title": "Avançado: competição?", "options": [{"t": "Sim", "next": 7}, {"t": "Não", "next": 7}]},
        {"type": "result", "title": "Seu plano personalizado", "cta": "QUERO", "href": "https://example.com/oferta"},
    ]
    quiz("q_branch", branch, ids=True, features=["branching", "join"])
    loaders = [
        {"type": "info", "title": "Vamos analisar seu perfil", "cta": "Analisar"},
        {"type": "loader", "title": "Nível 1: perfil", "secs": 4, "msgs": ["Lendo perfil", "Comparando dados"]},
        {"type": "loader", "title": "Nível 2: metas", "secs": 4, "msgs": ["Lendo metas", "Calculando"]},
        {"type": "loader", "title": "Nível 3: rotina", "secs": 4, "msgs": ["Lendo rotina", "Ajustando"]},
        {"type": "loader", "title": "Nível 4: plano", "secs": 4, "msgs": ["Gerando plano", "Quase pronto"]},
        {"type": "loader", "title": "Nível 5: finalizando", "secs": 4, "msgs": ["Salvando", "Pronto!"]},
        {"type": "result", "title": "Plano pronto", "cta": "VER MEU PLANO", "href": "https://example.com/plano", "cd": True, "lateCta": 4},
    ]
    quiz("q_loaders", loaders, ids=False, transition="fade", features=["chained-loaders", "late-cta", "countdown"])
    quiz("q_cookie_popup", SIMPLE[:5] + [SIMPLE[-1]], ids=True, extra={"cookie": True, "popupAt": 6000}, features=["cookie-banner", "popup-6s"])
    quiz("q_csr_delay", SIMPLE, ids=True, extra={"renderDelay": 4000}, features=["client-render-4s"])
    same = [{"type": "single", "title": "Pergunta", "options": [f"Opção {k}-{j}" for j in range(1, 4)]} for k in range(1, 9)] + [{"type": "result", "title": "Fim", "cta": "OK", "href": "https://example.com/x"}]
    quiz("q_same_titles", same, ids=False, extra={"progress": False}, features=["identical-titles", "no-progress", "no-ids"])
    quiz("q_slow_anim", SIMPLE, transition="slide", ids=True, extra={"pickDelay": 700}, features=["slow-transitions"])

    # ---------- scale ----------
    quiz("big_60", gen={"n": 60, "kind": "plain"}, ids=True, features=["scale"])
    quiz("big_300", gen={"n": 300, "kind": "mixed"}, ids=True, features=["scale"])
    quiz("big_1000", gen={"n": 1000, "kind": "plain"}, ids=False, features=["scale"])
    quiz("big_5000", gen={"n": 5000, "kind": "plain"}, ids=True, features=["scale"])

    # ---------- option markup variants ----------
    quiz("q_div_options", SIMPLE, ids=True, extra={"optTag": "div"}, transition="fade", features=["clickable-divs-no-role"])
    quiz("q_label_options", steps2, advance="continue", ids=False, extra={"optTag": "label"}, features=["radio-label-options"])

    pers = [
        {"type": "info", "title": "Vamos começar", "cta": "Começar"},
        {"type": "input", "title": "Como podemos te chamar?", "fields": [{"label": "Nome", "ph": "Seu nome"}], "saveName": True},
        {"type": "single", "title": "Prazer, {nome1}! Qual é o seu objetivo?", "sub": "Vamos montar o plano de {nome}", "options": ["Emagrecer", "Ganhar massa"]},
        {"type": "result", "title": "{nome1}, seu plano está pronto", "sub": "Plano personalizado de {nome}", "cta": "ACESSAR", "href": "https://example.com/plano"},
    ]
    quiz("q_personalized", pers, advance="continue", ids=True, features=["personalization-by-name", "gated-button"])

    # ---------- hostile ----------
    quiz("x_endless", gen={"n": 100000, "kind": "plain"}, ids=False, features=["endless"])
    quiz("x_popup_every_step", SIMPLE[:5] + [SIMPLE[-1]], ids=True, extra={"cookie": True, "popupAt": 1500}, features=["popup-every-step"])

    # ---------- VSL / waiting ----------
    vsl = [
        {"type": "video", "title": "Assista ao vídeo até o final", "ctaAt": 3, "controls": False, "cd": True, "href": "https://example.com/comprar", "cta": "QUERO COMPRAR AGORA"},
    ]
    quiz("v_native", vsl, ids=True, features=["vsl", "late-cta-by-video-time", "countdown"], extra={"footer": True})
    quiz("v_controls", [{"type": "video", "title": "Vídeo com controles", "controls": True, "ctaAt": 2, "href": "https://example.com/comprar"}], ids=False, features=["vsl-controls"])
    quiz("v_autoplay", [{"type": "video", "title": "Vídeo que começa sozinho", "autoplay": True, "lateTimer": 6, "ctaAt": 999, "href": "https://example.com/comprar"}], ids=True, features=["vsl-autoplay", "late-cta-timer"])
    quiz("v_pause_rule", [
        {"type": "video", "title": "VSL com regra de pausa", "ctaAt": 3, "pauseGoto": 1, "href": "https://example.com/comprar"},
        {"type": "result", "title": "Espere! Um presente para você", "cta": "RESGATAR", "href": "https://example.com/presente"},
    ], ids=True, features=["pause-rule"])
    quiz("v_iframe", [{"type": "video", "title": "Vídeo do YouTube", "iframe": "https://www.youtube.com/embed/dQw4w9WgXcQ", "ctaAt": 4, "href": "https://example.com/comprar"}], ids=False, features=["iframe-video"])
    quiz("v_in_quiz", [
        {"type": "single", "title": "Antes do vídeo: você quer emagrecer?", "options": ["Sim", "Com certeza"]},
        {"type": "video", "title": "Veja como funciona", "ctaAt": 3, "href": None, "cta": "CONTINUAR"},
        {"type": "single", "title": "Depois do vídeo: qual plano?", "options": ["Básico", "Completo"]},
        {"type": "result", "title": "Pronto", "cta": "COMPRAR", "href": "https://example.com/checkout"},
    ], ids=True, features=["video-inside-quiz"])
    quiz("wait_room", [
        {"type": "countdown", "title": "Você está na fila", "sub": "Sua vaga é liberada quando o tempo acabar", "autoNext": 9, "cta": "Pular espera"},
        {"type": "result", "title": "Sua vez chegou!", "sub": "Vaga liberada", "cta": "ENTRAR AGORA", "href": "https://example.com/entrar", "cd": True},
    ], ids=True, features=["waiting-room", "auto-advance-9s", "countdown"])
    quiz("wait_only", [
        {"type": "loader", "title": "Estamos preparando tudo…", "secs": 6, "msgs": ["Conectando", "Verificando", "Liberando acesso"], "next": 1},
        {"type": "result", "title": "Acesso liberado", "cta": "ENTRAR", "href": "https://example.com/entrar"},
    ], ids=False, features=["waiting-only", "loader"])

    # ---------- static landings ----------
    faq = "".join(f'<details><summary>Pergunta frequente {k}?</summary><p>Resposta detalhada número {k}. Lorem ipsum dolor sit amet.</p></details>' for k in range(1, 7))
    sections = "".join(
        f'<section class="sec"><h2>Benefício {k}</h2><p>Texto do benefício {k}, explicando por que isso muda tudo para você.</p>'
        f'<img src="{SVG("%02x%02x%02x" % (40 + k * 25, 90, 160 - k * 15), "Imagem " + str(k))}" alt="" width="640" height="360" loading="lazy"></section>'
        for k in range(1, 8))
    landing = f"""<style>body{{margin:0;font-family:system-ui;color:#222}}header{{padding:14px 20px;background:#111;color:#fff;display:flex;justify-content:space-between}}
.hero{{background:linear-gradient(135deg,#d0541f,#7a1f5c);color:#fff;padding:60px 20px;text-align:center}}.hero h1{{font-size:38px;margin:0 0 12px}}
.sec{{max-width:760px;margin:0 auto;padding:36px 20px}}.sec img{{width:100%;height:auto;border-radius:12px}}
.btn{{display:inline-block;background:#fff;color:#d0541f;padding:14px 28px;border-radius:99px;font-weight:800;text-decoration:none}}
details{{max-width:760px;margin:10px auto;padding:12px 20px;border:1px solid #ddd;border-radius:10px}}
#sticky{{position:fixed;left:0;right:0;bottom:0;background:#d0541f;color:#fff;padding:12px;text-align:center;transform:translateY(100%);transition:transform .3s}}#sticky.on{{transform:none}}</style>
<header><b>MarcaLab</b><nav><a href="#faq" style="color:#fff">FAQ</a></nav></header>
<div class="hero"><h1>Transforme sua rotina em 21 dias</h1><p>Método simples, resultado real.</p><a class="btn" href="https://example.com/comprar">QUERO COMEÇAR</a></div>
{sections}<div id="faq">{faq}</div><footer style="text-align:center;padding:30px;color:#777">© 2026 MarcaLab</footer>
<div id="sticky">Oferta por tempo limitado · <a href="https://example.com/comprar" style="color:#fff">Garantir agora</a></div>
<script>addEventListener('scroll',function(){{document.getElementById('sticky').classList.toggle('on',scrollY>600)}})</script>"""
    static_site("landing_long", landing, "landing", ["accordion", "sticky-cta-on-scroll", "lazy-images", "svg-images"])

    heavy_imgs = "".join(f'<section style="max-width:760px;margin:0 auto;padding:20px"><h2>Foto {k}</h2><img src="/media/big{k % 4}.png" alt="" style="width:100%;height:auto" width="1600" height="1000" loading="lazy"></section>' for k in range(1, 13))
    heavy = f"""<style>body{{font-family:system-ui;margin:0}}.bg{{height:420px;background:url(/media/big0.png) center/cover;color:#fff;display:flex;align-items:center;justify-content:center;font-size:36px}}</style>
<div class="bg"><b>Landing pesada</b></div>{heavy_imgs}<p style="text-align:center"><a href="https://example.com/comprar">Comprar</a></p>"""
    static_site("landing_heavy", heavy, "landing", ["heavy-images", "css-bg"])

    shadow = """<style>body{font-family:system-ui;margin:0}</style><h1 style="text-align:center">Landing com web components</h1>
<fancy-card data-t="Plano Básico" data-p="R$ 47"></fancy-card><fancy-card data-t="Plano Pro" data-p="R$ 97"></fancy-card>
<script>
class FancyCard extends HTMLElement{connectedCallback(){const r=this.attachShadow({mode:'open'});r.innerHTML=`<style>div{border:2px solid #d0541f;border-radius:14px;padding:20px;margin:16px auto;max-width:360px;text-align:center;font-family:system-ui}b{font-size:28px;color:#d0541f}button{background:#d0541f;color:#fff;border:0;padding:12px 24px;border-radius:99px;font-size:17px}</style><div><h2>${this.dataset.t}</h2><b>${this.dataset.p}</b><p><button>Assinar</button></p></div>`}}
customElements.define('fancy-card',FancyCard)</script>"""
    static_site("shadow_landing", shadow, "landing", ["shadow-dom"])

    modal = """<style>body{font-family:system-ui;margin:0}.hero{padding:70px 20px;text-align:center;background:#eef}.btn{background:#d0541f;color:#fff;padding:14px 26px;border-radius:99px;text-decoration:none;font-weight:700}</style>
<div id="gate" style="position:fixed;inset:0;background:#000d;color:#fff;display:flex;align-items:center;justify-content:center;z-index:99;flex-direction:column"><h2>Você tem mais de 18 anos?</h2><button onclick="document.getElementById('gate').remove()">Sim, tenho</button></div>
<div class="hero"><h1>Oferta especial de lançamento</h1><p>Só hoje com 50% off</p><a class="btn" href="https://example.com/comprar">GARANTIR</a></div>
<section style="max-width:700px;margin:30px auto;padding:20px"><h2>Como funciona</h2><p>Três passos simples para começar.</p></section>
<script>setTimeout(function(){var d=document.createElement('div');d.id='newsletter';d.style.cssText='position:fixed;inset:0;background:#0008;display:flex;align-items:center;justify-content:center;z-index:98';d.innerHTML='<div style=\"background:#fff;padding:26px;border-radius:12px\"><h3>Receba novidades</h3><button onclick=\"this.closest(\\'#newsletter\\').remove()\">Fechar</button></div>';document.body.appendChild(d)},5000)</script>"""
    static_site("landing_modal", modal, "landing", ["age-gate", "newsletter-popup"])

    # ---------- more kinds of pages ----------
    chat = """<style>body{margin:0;font-family:system-ui;background:#e9e4da}#c{max-width:480px;margin:0 auto;padding:16px 14px 100px}.b{background:#fff;border-radius:16px;padding:12px 14px;margin:10px 0;max-width:82%;animation:pop .35s both}.me{background:#d0541f;color:#fff;margin-left:auto}@keyframes pop{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.o{display:block;width:100%;margin:8px 0;padding:14px;border:2px solid #d0541f;background:#fff;color:#d0541f;border-radius:99px;font-size:17px;cursor:pointer}.typing{opacity:.6}</style>
<div id="c"><h1 style="font-size:20px">Assistente Lia</h1><div id="m"></div><div id="opts"></div></div>
<script>
var msgs=['Oi! Eu sou a Lia 👋','Vou montar seu plano em 1 minuto.','Primeiro: qual é o seu objetivo?'], m=document.getElementById('m'), opts=document.getElementById('opts');
function say(t,cls,cb){var d=document.createElement('div');d.className='b typing '+(cls||'');d.textContent='digitando…';m.appendChild(d);setTimeout(function(){d.className='b '+(cls||'');d.textContent=t;cb&&cb()},900)}
function seq(i){ if(i<msgs.length) return say(msgs[i],'',function(){setTimeout(function(){seq(i+1)},500)}); var b=document.createElement('button');b.className='o';b.textContent='Emagrecer';var b2=b.cloneNode();b2.textContent='Ganhar massa';opts.appendChild(b);opts.appendChild(b2);[b,b2].forEach(function(x){x.onclick=function(){opts.innerHTML='';say(x.textContent,'me',function(){say('Perfeito! Última pergunta: quanto tempo você tem por dia?','',function(){var c=document.createElement('button');c.className='o';c.textContent='30 minutos';opts.appendChild(c);c.onclick=function(){location.href='https://example.com/plano'}})})}}) }
seq(0)</script>"""
    static_site("q_chat", chat, "chat", ["chat-bubbles-sequential", "options-after-typing"])

    reveal = """<style>body{margin:0;font-family:system-ui}.sec{max-width:720px;margin:0 auto;padding:50px 20px;opacity:0;transform:translateY(40px);transition:all .7s}.sec.in{opacity:1;transform:none}.btn{display:inline-block;background:#d0541f;color:#fff;padding:14px 26px;border-radius:99px;text-decoration:none}</style>
<header style="padding:30px 20px;text-align:center"><h1>Landing com revelação ao rolar</h1><a class="btn" href="https://example.com/comprar">QUERO</a></header>
""" + "".join(f'<section class="sec"><h2>Seção {k}</h2><p>Conteúdo da seção {k} que só aparece quando entra na tela.</p></section>' for k in range(1, 9)) + """
<script>var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)e.target.classList.add('in')})},{threshold:.15});document.querySelectorAll('.sec').forEach(function(s){io.observe(s)})</script>"""
    static_site("landing_reveal", reveal, "landing", ["scroll-reveal-IO"])

    slider = """<style>body{margin:0;font-family:system-ui;text-align:center}.sl{position:relative;max-width:560px;height:200px;margin:30px auto}.sl .s{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#fff3ea;border-radius:16px;opacity:0;transition:opacity .6s;padding:20px;font-size:20px}.sl .s.on{opacity:1}</style>
<h1>Depoimentos</h1><div class="sl"><div class="s on">"Perdi 8kg em 30 dias!" — Ana</div><div class="s">"Mudou minha rotina." — Bruno</div><div class="s">"Melhor investimento." — Carla</div></div><a href="https://example.com/comprar" style="display:inline-block;background:#d0541f;color:#fff;padding:14px 26px;border-radius:99px;text-decoration:none">QUERO TAMBÉM</a>
<script>var i=0,s=document.querySelectorAll('.s');setInterval(function(){s[i].classList.remove('on');i=(i+1)%s.length;s[i].classList.add('on')},2500)</script>"""
    static_site("landing_slider", slider, "landing", ["js-carousel"])

    onepage = """<style>body{margin:0;font-family:system-ui;background:#faf7f2}form{max-width:520px;margin:0 auto;padding:20px}fieldset{border:0;margin:20px 0;padding:0}legend{font-weight:700;font-size:20px;margin-bottom:8px}label{display:block;padding:10px;border:2px solid #e2d9cb;border-radius:12px;margin:6px 0;background:#fff;cursor:pointer}input[type=text],input[type=email]{width:100%;padding:12px;border:2px solid #e2d9cb;border-radius:10px;font-size:16px}button{width:100%;background:#d0541f;color:#fff;border:0;padding:16px;border-radius:99px;font-size:18px;font-weight:700}</style>
<form id="f"><h1>Pesquisa rápida</h1>
<fieldset><legend>1. Qual é o seu objetivo?</legend><label><input type="radio" name="a" value="1"> Emagrecer</label><label><input type="radio" name="a" value="2"> Ganhar massa</label></fieldset>
<fieldset><legend>2. Como é sua rotina?</legend><label><input type="radio" name="b" value="1"> Sedentária</label><label><input type="radio" name="b" value="2"> Ativa</label></fieldset>
<fieldset><legend>3. Seus dados</legend><input type="text" name="nome" placeholder="Seu nome" required><br><br><input type="email" name="email" placeholder="Seu e-mail" required></fieldset>
<button type="submit">RECEBER MEU PLANO</button></form>
<script>document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();fetch('/api/lead',{method:'POST',body:new FormData(e.target)}).finally(function(){document.getElementById('f').innerHTML='<h1>Obrigado! Enviamos para o seu e-mail.</h1>'})})</script>"""
    static_site("form_onepage", onepage, "form", ["single-page-form", "lead-submit-fetch"])

    exitpop = """<style>body{font-family:system-ui;margin:0}.hero{padding:80px 20px;text-align:center;background:#eef}.btn{background:#d0541f;color:#fff;padding:14px 26px;border-radius:99px;text-decoration:none}#ep{position:fixed;inset:0;background:#000a;display:none;align-items:center;justify-content:center;z-index:99}#ep div{background:#fff;padding:30px;border-radius:14px;text-align:center}</style>
<div class="hero"><h1>Curso completo de receitas</h1><p>7 dias grátis</p><a class="btn" href="https://example.com/comprar">COMEÇAR</a></div>
<div id="ep"><div><h2>Espere! Antes de ir...</h2><p>Leve 30% de desconto agora.</p><a class="btn" href="https://example.com/oferta30">QUERO O DESCONTO</a><p><a href="#" onclick="document.getElementById('ep').style.display='none';return false">Não, obrigado</a></p></div></div>
<script>document.addEventListener('mouseleave',function(e){if(e.clientY<=0)document.getElementById('ep').style.display='flex'})</script>"""
    static_site("landing_exitpopup", exitpop, "landing", ["exit-intent-popup"])

    timerredir = """<!DOCTYPE html><body style="font-family:system-ui;text-align:center;padding:60px"><h1>Oferta única</h1><p>Você será levado ao checkout em instantes.</p><a href="https://example.com/comprar" style="background:#d0541f;color:#fff;padding:14px 26px;border-radius:99px;text-decoration:none">IR AGORA</a>
<script>setTimeout(function(){location.href='/x/offer2.html'},9000)</script></body>"""
    static_site("vsl_timer_redirect", timerredir, "landing", ["timed-redirect-9s"])

    rtl = """<html dir="rtl" lang="ar"><body style="font-family:system-ui;padding:30px;text-align:center"><h1>مرحبا بكم في موقعنا 🌟</h1><p>هذا نص تجريبي بالعربية مع رموز تعبيرية 🚀✨ و中文字符 و日本語。</p><a href="https://example.com/buy" style="background:#d0541f;color:#fff;padding:14px 26px;border-radius:99px;text-decoration:none">اشتر الآن</a></body></html>"""
    static_site("landing_rtl", rtl, "landing", ["rtl", "unicode", "emoji"])

    # ---------- multipage (real navigation) ----------
    n = 8
    for k in range(1, n + 1):
        d = os.path.join(WWW, "mp_quiz")
        os.makedirs(d, exist_ok=True)
        nxt = f"{k + 1}.html" if k < n else "https://example.com/checkout"
        opts = "".join(f'<a class="opt" href="{nxt}" style="display:block;margin:10px 0;padding:14px;border:2px solid #e2d9cb;border-radius:12px;text-decoration:none;color:#222">Resposta {j} da pergunta {k}</a>' for j in range(1, 4))
        open(os.path.join(d, "index.html" if k == 1 else f"{k}.html"), "w").write(
            f'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pergunta {k}</title><link rel="stylesheet" href="/quiz.css"></head>'
            f'<body><div id="app"><div class="progress"><i style="width:{round(k / n * 100)}%"></i></div><h2 class="title">Pergunta {k} de {n}</h2>{opts}</div></body></html>')
    EXPECTED["mp_quiz"] = {"kind": "multipage", "main_path": [f"Pergunta {k} de {n}" for k in range(1, n + 1)], "main_len": n, "reachable": n, "features": ["real-navigation"], "route": "pages"}

    json.dump(EXPECTED, open(os.path.join(ROOT, "expected.json"), "w"), indent=1, ensure_ascii=False)
    print(len(EXPECTED), "sites:", ", ".join(EXPECTED))


main()
