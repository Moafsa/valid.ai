"""The pixel runtime (public/vai-e.js) in a real browser, against the real vai-runtime.js, with the vendors' servers faked.
Checks: the right event reaches the right integration, once; the page keeps working when every vendor is blocked; consent / do-not-track
keep the pixels out; test mode shows a panel and flags the batches; nothing throws.
usage (scanner image):  docker run --rm -v /opt/funnelai/apps/web/public:/web/public:ro -v /opt/funnelai/tools/pixel-lab:/lab funnelai-scanner python /lab/pixel_e2e.py"""
import asyncio, json, re, sys
from playwright.async_api import async_playwright

PUB = "/web/public"
ORIGIN = "http://lab.test"
fails = 0
def ok(c, what, extra=""):
    global fails
    print(("PASS  " if c else "FAIL  ") + what + ("" if c else "   -> " + str(extra)))
    if not c: fails += 1

INTEGRATIONS = [
    {"id": "t_meta", "type": "META_PIXEL", "pixelId": "123456789012345", "map": {}},
    {"id": "t_ga4", "type": "GOOGLE_ANALYTICS", "pixelId": "G-ABCDEF1234", "map": {}},
    {"id": "t_ads", "type": "GOOGLE_TAG", "pixelId": "AW-1234567890", "map": {}},
    {"id": "t_tt", "type": "TIKTOK_PIXEL", "pixelId": "C1ABCDE2FGHI3JKL4MNO", "map": {}},
    {"id": "t_gtm", "type": "GTM", "pixelId": "GTM-ABCD123", "map": {}},
    {"id": "t_cu", "type": "CUSTOM", "pixelId": "meu script", "map": {}, "code": "<script>window.__custom = 1; window.__customEvents = []; window.addEventListener('vai:pixel', function(e){ window.__customEvents.push(e.detail.event) })</script>"},
]
EVENTS = [
    {"id": "pageview", "kind": "pageview", "name": "Visualização de página", "trigger": {"type": "pageview"}, "value": None},
    {"id": "cta", "kind": "cta", "name": "Clique em botões e CTAs", "trigger": {"type": "cta"}, "value": None},
    {"id": "lead", "kind": "lead", "name": "Lead", "trigger": {"type": "form"}, "value": None},
    {"id": "checkout", "kind": "checkout", "name": "Início de checkout", "trigger": {"type": "checkout"}, "value": None},
    {"id": "video", "kind": "video", "name": "Vídeo", "trigger": {"type": "video"}, "value": None},
    {"id": "purchase", "kind": "purchase", "name": "Compra", "trigger": {"type": "page", "match": "obrigado"}, "value": 97.0},
    {"id": "c_wpp1", "kind": "custom", "name": "Clicou no WhatsApp", "trigger": {"type": "click", "match": "WhatsApp"}, "value": None},
]
def config(consent=None, only=None):
    igs = []
    for i in INTEGRATIONS:
        if only and i["type"] not in only: continue
        m = {e["id"]: {"on": True, **({"label": "AbC-D_efG"} if i["type"] == "GOOGLE_TAG" and e["kind"] in ("lead", "checkout", "purchase") else {})} for e in EVENTS}
        igs.append({**i, "map": m})
    return {"v": 1, "p": "proj_lab_1", "consent": consent or {"required": False, "respectDnt": True, "text": "Aceita?"}, "currency": "BRL", "events": EVENTS, "integrations": igs}

def page_html(slug="home", cfg=None, runtime=True, owner=False):
    v = {"projectId": "proj_lab_1", "pageId": "pg1", "basePath": "/s/lab", "rules": [], "slug": slug, "mode": "published", "sid": "sid_lab_abcdef", "vid": "vid_lab_abcdef", **({"owner": True} if owner else {})}
    return f"""<!doctype html><html><head><meta charset=utf-8><title>Oferta</title></head><body>
<div data-vai-root><h1>Oferta</h1>
<button id=cta class="btn">Quero agora</button>
<a id=wpp href="https://wa.me/5511999999999" class="btn">Falar no WhatsApp</a>
<a id=buy href="https://pay.hotmart.com/X123?off=abc" class="btn">Comprar agora</a>
<form id=f><input name=email type=email value="a@b.co"><button type=submit>Enviar</button></form>
<video id=v></video><p id=ok></p></div>
<script>window.__VAI={json.dumps(v)}</script>
<script>window.__VAI_PX={json.dumps(cfg if cfg is not None else config()).replace('<', chr(92) + 'u003c')}</script>
<script>document.addEventListener('click',function(e){{var a=e.target.closest&&e.target.closest('a');if(a)e.preventDefault();window.__pageClicks=(window.__pageClicks||0)+1;document.getElementById('ok').textContent='clicked '+window.__pageClicks}})</script>
{'<script src="/vai-runtime.js" defer></script>' if runtime else ''}<script src="/vai-e.js" defer></script></body></html>"""

# the vendors' libraries, faked just enough to send the request the real ones send
FB_JS = """(function(){var f=window.fbq;function h(a){a=Array.prototype.slice.call(a);var m=a[0];if(m==='trackSingle'||m==='trackSingleCustom'){new Image().src='https://www.facebook.com/tr/?id='+a[1]+'&ev='+encodeURIComponent(a[2]);}}
f.callMethod=function(){h(arguments)};(f.queue||[]).forEach(h);f.queue=[];})();"""
GTAG_JS = """(function(){function send(a){if(a[0]==='event'){var p=a[2]||{};fetch('https://www.google-analytics.com/g/collect?v=2&en='+encodeURIComponent(a[1])+'&tid='+encodeURIComponent(p.send_to||''),{method:'POST',keepalive:true}).catch(function(){});}}
var dl=window.dataLayer;dl.forEach(function(x){send(x)});var orig=dl.push;dl.push=function(x){send(x);return orig.apply(dl,arguments)};})();"""
TT_JS = """(function(){var t=window.ttq;function send(n){fetch('https://analytics.tiktok.com/api/v2/pixel?ev='+encodeURIComponent(n),{method:'POST',keepalive:true}).catch(function(){});}
t.instance=function(id){return{track:function(n){send(n)},page:function(){send('Pageview')}}};Object.keys(t._i||{}).forEach(function(id){(t._i[id]||[]).forEach(function(c){send(c[0]==='page'?'Pageview':c[1])})});})();"""

VENDOR = re.compile(r"(connect\.facebook\.net|facebook\.com/tr|googletagmanager\.com|google-analytics\.com|analytics\.tiktok\.com|googleadservices\.com)")

async def run(browser, name, *, cfg=None, runtime=True, block=False, abort_re=None, noop_lib=False, init=None, url="/lp?vai_test=1", owner=False, actions=None, wait=6.5, ctxopts=None):
    ctx = await browser.new_context(**(ctxopts or {}))
    if init: await ctx.add_init_script(init)
    pg = await ctx.new_page()
    errors, px, beacons, vendor_hits = [], [], [], []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    async def fulfill_page(route):
        u = route.request.url
        if u.endswith("/vai-runtime.js") or u.endswith("/vai-e.js"):
            await route.fulfill(body=open(PUB + u.replace(ORIGIN, ""), "rb").read(), content_type="application/javascript"); return
        if u.startswith(ORIGIN + "/api/track"):
            body = route.request.post_data or ""
            try:
                j = json.loads(body)
                (px if j.get("px") == 1 else beacons).append(j)
            except Exception: pass
            await route.fulfill(status=204); return
        if u.startswith(ORIGIN):
            await route.fulfill(body=page_html(slug=url.split("/")[-1].split("?")[0] or "home", cfg=cfg, runtime=runtime, owner=owner), content_type="text/html"); return
        if VENDOR.search(u):
            vendor_hits.append(u)
            if block or (abort_re and re.search(abort_re, u)): await route.abort(); return
            if "fbevents.js" in u: await route.fulfill(body="/* loads, sends nothing */" if noop_lib else FB_JS, content_type="application/javascript"); return
            if "gtag/js" in u: await route.fulfill(body=GTAG_JS, content_type="application/javascript"); return
            if "analytics.tiktok.com/i18n" in u: await route.fulfill(body=TT_JS, content_type="application/javascript"); return
            if "gtm.js" in u: await route.fulfill(body="/* gtm */", content_type="application/javascript"); return
            await route.fulfill(status=200, body="GIF89a", content_type="image/gif"); return
        await route.fulfill(status=204)
    await pg.route("**/*", fulfill_page)
    await pg.goto(ORIGIN + url)
    await pg.wait_for_timeout(700)
    if actions: await actions(pg)
    await pg.wait_for_timeout(int(wait * 1000))
    # report what was still unresolved, like a visitor leaving would
    await pg.evaluate("window.dispatchEvent(new Event('pagehide'))")
    await pg.wait_for_timeout(500)
    events = [e for b in px for e in b["e"]]
    return dict(pg=pg, ctx=ctx, errors=errors, px=px, events=events, beacons=beacons, vendor=vendor_hits)

def find(events, **kw):
    return [e for e in events if all(e.get(k) == v for k, v in kw.items())]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()

        # ── 1. everything on: each integration is told, once, and the browser's request is seen ──
        async def acts(pg):
            await pg.click("#cta"); await pg.click("#cta"); await pg.click("#cta")
            await pg.click("#buy"); await pg.click("#buy")
            await pg.click("#wpp")
            await pg.evaluate("document.getElementById('f').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))")   # the runtime takes the lead (and replaces the form)
            await pg.evaluate("window.dispatchEvent(new CustomEvent('vai:bus',{detail:{t:'lead'}}));window.dispatchEvent(new CustomEvent('vai:bus',{detail:{t:'lead'}}))")  # and two more announcements of the same lead
            await pg.evaluate("""(function(){var v=document.getElementById('v');Object.defineProperty(v,'duration',{value:100});Object.defineProperty(v,'currentTime',{value:60,configurable:true});
              v.dispatchEvent(new Event('play'));v.dispatchEvent(new Event('timeupdate'));v.dispatchEvent(new Event('timeupdate'));v.dispatchEvent(new Event('ended'));})()""")
        r = await run(b, "all", actions=acts)
        ev = r["events"]
        ok(not r["errors"], "1: no script errors on the page", r["errors"][:2])
        ok(int(await r["pg"].evaluate("window.__pageClicks||0")) >= 6, "1: the page's own buttons kept working")
        ok(await r["pg"].evaluate("window.__custom") == 1, "1: the custom script ran")
        for t, name in (("META_PIXEL", "PageView"), ("GOOGLE_ANALYTICS", "page_view"), ("TIKTOK_PIXEL", "Pageview"), ("GTM", "vai_page_view")):
            ok(len(find(ev, i=t, k="pageview")) == 1, f"1: {t} got exactly one {name}", [e for e in ev if e["i"] == t and e["k"] == "pageview"])
        ok(len(find(ev, i="META_PIXEL", k="lead", n="Lead")) == 1, "1: Meta got one Lead for three announcements of the lead", find(ev, i="META_PIXEL", k="lead"))
        ok(len(find(ev, i="GOOGLE_ANALYTICS", k="lead", n="generate_lead")) == 1, "1: GA4 got one generate_lead")
        ok(len(find(ev, i="META_PIXEL", k="checkout", n="InitiateCheckout")) == 1, "1: one InitiateCheckout for two clicks on the same payment link", find(ev, i="META_PIXEL", k="checkout"))
        ok(len([e for e in find(ev, i="META_PIXEL", k="cta") if e["n"] == "CTA_Click"]) <= 3 and len(find(ev, i="META_PIXEL", k="cta")) >= 1, "1: CTA clicks reported without flooding", len(find(ev, i="META_PIXEL", k="cta")))
        ok(len(find(ev, i="META_PIXEL", k="c_wpp1")) == 1, "1: the custom click event fired once", find(ev, i="META_PIXEL", k="c_wpp1"))
        ok(len(find(ev, i="GOOGLE_ANALYTICS", k="video")) == 3, "1: video start, 50% and end for GA4", [e["n"] for e in find(ev, i="GOOGLE_ANALYTICS", k="video")])
        ok(len(find(ev, i="GOOGLE_TAG", k="lead")) == 1 and find(ev, i="GOOGLE_TAG", k="lead")[0]["n"] == "conversion", "1: Google Ads got a conversion for the lead (it has a label)")
        ok(len(find(ev, i="GOOGLE_TAG", k="pageview")) == 0, "1: Google Ads got no page view (no label for it)")
        # states: the request was really seen
        ok(find(ev, i="META_PIXEL") and all(e["st"] == "sent" for e in find(ev, i="META_PIXEL")), "1: Meta events are 'sent' (the request was seen)", [(e["k"], e["st"]) for e in find(ev, i="META_PIXEL")])
        ok(find(ev, i="TIKTOK_PIXEL") and all(e["st"] == "sent" for e in find(ev, i="TIKTOK_PIXEL")), "1: TikTok events are 'sent'", [(e["k"], e["st"]) for e in find(ev, i="TIKTOK_PIXEL")])
        ok(find(ev, i="GOOGLE_ANALYTICS") and all(e["st"] == "sent" for e in find(ev, i="GOOGLE_ANALYTICS")), "1: GA4 events are 'sent'", [(e["k"], e["st"]) for e in find(ev, i="GOOGLE_ANALYTICS")])
        ok(find(ev, i="GTM") and all(e["st"] == "sent" for e in find(ev, i="GTM")), "1: GTM events are 'sent' (container loaded, pushed to dataLayer)")
        ok(any(x.get("k") == "lead" for x in find(ev, i="META_PIXEL")) and not any(x.get("st") == "blocked" for x in ev), "1: nothing reported as blocked")
        ok(all(x.get("test") == 0 for x in r["px"]), "1: batches are not flagged as test")
        ok(all(x["s"] == "sid_lab_abcdef" and x["p"] == "proj_lab_1" for x in r["px"]), "1: batches carry the visit and the project")
        ok("lead" in (await r["pg"].evaluate("window.__customEvents") or []), "1: the custom script heard the events (vai:pixel)", await r["pg"].evaluate("window.__customEvents"))
        await r["ctx"].close()

        # ── 2. the purchase page: a different step, value from the config, counted once ──
        async def to_thanks(pg):
            for _ in range(3):
                await pg.evaluate("window.dispatchEvent(new CustomEvent('vai:bus',{detail:{t:'view',slug:'obrigado'}}))")
        r = await run(b, "purchase", actions=to_thanks)
        pur = find(r["events"], i="META_PIXEL", k="purchase")
        ok(len(pur) == 1 and pur[0]["n"] == "Purchase" and pur[0].get("v") == 97.0 and pur[0].get("c") == "BRL", "2: Purchase once, with value 97 BRL, for three arrivals at the thank-you step", pur)
        ok(len(find(r["events"], i="META_PIXEL", k="pageview")) == 2, "2: one PageView per step (home and obrigado)", [e["s"] for e in find(r["events"], i="META_PIXEL", k="pageview")])
        await r["ctx"].close()

        # ── 3. every vendor blocked: the page works, the states say so ──
        r = await run(b, "blocked", block=True, actions=acts)
        ok(not r["errors"], "3: blocked vendors: no script errors", r["errors"][:2])
        ok(int(await r["pg"].evaluate("window.__pageClicks||0")) >= 6, "3: blocked vendors: buttons still work")
        ok(await r["pg"].inner_text("#ok") != "", "3: blocked vendors: the page responded to clicks")
        st = {e["i"]: e["st"] for e in r["events"] if e["k"] == "pageview"}
        ok(st.get("META_PIXEL") == "blocked" and st.get("TIKTOK_PIXEL") == "blocked", "3: blocked vendors are reported as blocked", st)
        ok(not any(e["st"] == "sent" for e in r["events"] if e["i"] != "CUSTOM"), "3: nothing is claimed as sent", [(e["i"], e["st"]) for e in r["events"]][:8])
        await r["ctx"].close()

        # ── 4. the library loads but never sends the request (consent mode off, a blocker acting on the calls): not confirmed, never "sent" ──
        r = await run(b, "silent", cfg=config(only=["META_PIXEL", "GOOGLE_ANALYTICS"]), noop_lib=True)
        meta = find(r["events"], i="META_PIXEL", k="pageview"); ga = find(r["events"], i="GOOGLE_ANALYTICS", k="pageview")
        ok(meta and meta[0]["st"] == "unconfirmed", "4: Meta call without a request leaving is 'unconfirmed'", meta)
        ok(ga and ga[0]["st"] == "sent", "4: GA4 next to it is still 'sent'", ga)
        ok(not r["errors"] and await r["pg"].inner_text("h1") == "Oferta", "4: the page is unaffected")
        await r["ctx"].close()

        # ── 5. consent required: nothing before "Aceitar", then the page view; "Recusar" keeps them out ──
        cc = config(consent={"required": True, "respectDnt": True, "text": "Aceita?"})
        r = await run(b, "consent", cfg=cc, wait=0.3)
        ok(await r["pg"].locator("#vai-consent").count() == 1, "5: the consent bar is there")
        ok(not [u for u in r["vendor"] if "facebook" in u or "google" in u or "tiktok" in u], "5: no vendor was contacted before consent", r["vendor"][:3])
        await r["pg"].click("#vai-consent button:has-text('Aceitar')")
        await r["pg"].wait_for_timeout(6200)
        await r["pg"].evaluate("window.dispatchEvent(new Event('pagehide'))"); await r["pg"].wait_for_timeout(400)
        ev = [e for b_ in r["px"] for e in b_["e"]]
        ok(len(find(ev, i="META_PIXEL", k="pageview")) == 1, "5: after Aceitar the page view is sent once", find(ev, i="META_PIXEL", k="pageview"))
        await r["ctx"].close()
        r = await run(b, "refuse", cfg=cc, wait=0.3)
        await r["pg"].click("#vai-consent button:has-text('Recusar')")
        await r["pg"].wait_for_timeout(1800)
        await r["pg"].evaluate("window.dispatchEvent(new Event('pagehide'))"); await r["pg"].wait_for_timeout(400)
        ev = [e for b_ in r["px"] for e in b_["e"]]
        ok(find(ev, st="skipped") and not [u for u in r["vendor"] if "facebook" in u], "5: after Recusar the pixels are 'skipped' and never loaded", [e["st"] for e in ev][:4])
        await r["ctx"].close()

        # ── 6. do not track ──
        r = await run(b, "dnt", init="Object.defineProperty(navigator,'doNotTrack',{get:()=>'1'})", wait=1.5)
        ok(not [u for u in r["vendor"] if "facebook" in u], "6: Do Not Track: no pixel is loaded")
        ok(all(e["st"] == "skipped" for e in r["events"]) and r["events"], "6: Do Not Track: reported as skipped", [e["st"] for e in r["events"]][:3])
        await r["ctx"].close()

        # ── 7. test mode: a panel, and the batches are flagged ──
        r = await run(b, "test", url="/lp?vai_pxtest=1&vai_test=1", wait=5.2, actions=acts)
        ok(await r["pg"].evaluate("document.body.innerText.includes('Modo de teste dos pixels')"), "7: test mode shows its panel")
        ok(r["px"] and all(x.get("test") == 1 for x in r["px"]), "7: test batches are flagged", [x.get("test") for x in r["px"]])
        await r["ctx"].close()

        # ── 8. the page owner, a thumbnail and a robot never fire ──
        r = await run(b, "owner", owner=True, wait=1.5)
        ok(not r["px"] and not [u for u in r["vendor"] if "facebook" in u], "8: the owner's own visit fires nothing")
        await r["ctx"].close()

        # ── 9. no runtime (blocked): the first page view still counts, once ──
        r = await run(b, "noruntime", runtime=False, wait=6.5)
        ok(len(find(r["events"], i="META_PIXEL", k="pageview")) == 1, "9: without vai-runtime.js the first page view is still sent once", find(r["events"], i="META_PIXEL", k="pageview"))
        await r["ctx"].close()

        # ── 10. a broken config never breaks the page ──
        r = await run(b, "broken", cfg={"v": 1, "p": "proj_lab_1", "events": None, "integrations": [{"id": "x", "type": "META_PIXEL"}]}, wait=1.5)
        ok(not r["errors"] and await r["pg"].inner_text("h1") == "Oferta", "10: a broken pixel config is ignored without an error")
        await r["ctx"].close()
        await b.close()
    print("\nALL PASSED" if fails == 0 else f"\n{fails} FAILED")
    sys.exit(1 if fails else 0)
asyncio.run(main())
