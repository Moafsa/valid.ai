#!/usr/bin/env python3
"""Test sites that cloak in the ways real ones do, with known answers (port 8098).
  /lp      server-side cloaker: phone + Instagram/Facebook/TikTok (app UA, referrer or fbclid) get the offer, everyone else a recipe blog
  /js      script cloaker: the HTML is always the blog; a script sends real-looking visitors to /money (and checks navigator.webdriver)
  /ab      a link that splits traffic between two offers at random
  /clean   the same page for everybody
  /drop    redirects real visitors to the offer but throws the utm/fbclid away on the way
  /bots    shows an error (403) to ad robots, the offer to everybody else
  /ref     origin-only cloak: any visitor that comes from Instagram gets the offer (no phone needed)
  /utm     parameter-only cloak: utm_source=ig gets the offer
  /region  trusts the CF-IPCountry header: BR gets the offer
  /cookie  first visit gets the offer and a cookie, every later visit the blog
  /late    blog first, a script swaps in the offer after 3 s for Instagram visitors
  /iframe  Instagram visitors get a page that is only a full-screen frame of the offer
  /meta    phone + Instagram visitors are sent away by a meta refresh
  /rot     everybody gets a different page on every request (rotation, caches)
  --- NOT cloaked (must not be flagged) ---
  /lang    English visitors get the English version of the same blog
  /mobile  phones get the phone layout of the same blog
  /dyn     the same blog with a clock and a random ad that change on every request
  /skin    every phone (also the Instagram app, also ad visitors) gets another skin of the same article (menu, "download PDF"): the device, not a filter (Wikipedia does this)
  /curl    only a program without a browser gets another page (language/cookie negotiation); real robots and people get the same one (mozilla.org did this)
  /refuse  robots are answered with an error page (HTTP 419 "Sorry"), people get the page (Hacker News does this)
  /banner  the first visit shows a newsletter/cookie banner, later visits do not (text drift between visits, not a different offer)
"""
import itertools, random, re, sys
_ab = itertools.count()
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

SAFE = "<!doctype html><title>Receitas da Vovó</title><body><h1>Receitas da Vovó</h1><p>Bolo de cenoura, pão caseiro, doce de leite e mais receitas simples para a família. Veja o passo a passo, dicas de ingredientes e truques de cozinha para o dia a dia.</p><p>Assine nossa newsletter para receber uma receita nova toda semana.</p></body>"
def money(tag="A"):
    return f"<!doctype html><title>Oferta secreta {tag}</title><body><h1>Emagreça 12kg em 30 dias</h1><p>O método revolucionário que clínicas não querem que você conheça. Garanta agora a sua vaga com desconto de 70% e bônus exclusivos. Garantia de 30 dias.</p><a id=buy href='https://pay.hotmart.com/X123?off=abc'>COMPRAR AGORA R$ 97</a><form action='/lead'><input name=email></form></body>"

def real(h, q):
    ua = h.get('User-Agent', ''); ref = h.get('Referer', '')
    app = re.search(r'Instagram|FB_IAB|FBAN|musical_ly', ua)
    mobile = 'Mobile' in ua or 'iPhone' in ua
    social = re.search(r'instagram|facebook|tiktok', ref) or 'fbclid' in q or 'ttclid' in q
    return bool(mobile and (app or social))

def bot(h):
    return bool(re.search(r'bot|spider|crawler|facebookexternalhit|python|curl|AdsBot', h.get('User-Agent', ''), re.I))

EN = "<!doctype html><title>Grandma's Recipes</title><body><h1>Grandma's Recipes</h1><p>Carrot cake, homemade bread, caramel and many more simple recipes for the family. See the step by step, ingredient tips and kitchen tricks for everyday life.</p><p>Subscribe to our newsletter to get a new recipe every week.</p></body>"
MOBILE = "<!doctype html><title>Receitas da Vovó</title><meta name=viewport content='width=device-width'><body style='font-size:20px'><h1>Receitas da Vovó</h1><p>Bolo de cenoura, pão caseiro, doce de leite e mais receitas simples para a família. Veja o passo a passo, dicas de ingredientes e truques de cozinha para o dia a dia.</p><p>Assine nossa newsletter para receber uma receita nova toda semana.</p><p>Toque no menu para ver as categorias.</p></body>"
_rot = itertools.count()
_seen = set()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body, ctype='text/html; charset=utf-8', headers=None):
        b = body.encode(); self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(b)))
        for k, v in (headers or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        u = urlsplit(self.path); q = parse_qs(u.query); p = u.path
        if p == '/lp':
            return self.send(200, money() if real(self.headers, q) and not bot(self.headers) else SAFE, headers={'Set-Cookie': '_subid=abc123; Path=/'})
        if p == '/js':
            return self.send(200, SAFE.replace('</body>', "<script>if(!navigator.webdriver && /instagram|facebook|tiktok/.test(document.referrer) && /Mobile/.test(navigator.userAgent)){location.replace('/money')}</script></body>"))
        if p == '/money':
            return self.send(200, money())
        if p == '/ab':
            n = next(_ab) % 2
            return self.send(200, money('AB'[n]).replace('Emagreça 12kg em 30 dias', ['Emagreça 12kg em 30 dias', 'Seque a barriga sem dieta maluca'][n]))
        if p == '/clean':
            return self.send(200, SAFE)
        if p == '/drop':
            if real(self.headers, q) and not bot(self.headers):
                self.send_response(302); self.send_header('Location', '/money'); self.end_headers(); return
            return self.send(200, SAFE)
        ig = 'instagram' in self.headers.get('Referer', '')
        if p == '/ref':
            return self.send(200, money() if ig else SAFE)
        if p == '/utm':
            return self.send(200, money() if q.get('utm_source', [''])[0] == 'ig' else SAFE)
        if p == '/region':
            return self.send(200, money() if self.headers.get('CF-IPCountry') == 'BR' else SAFE)
        if p == '/cookie':
            if 'seen=1' in self.headers.get('Cookie', ''):
                return self.send(200, SAFE)
            return self.send(200, money(), headers={'Set-Cookie': 'seen=1; Path=/'})
        if p == '/late':
            return self.send(200, SAFE.replace('</body>', "<script>if(/instagram/.test(document.referrer)){setTimeout(function(){document.body.innerHTML=" + repr(money().split('<body>')[1].split('</body>')[0]) + "},3000)}</script></body>"))
        if p == '/iframe':
            return self.send(200, "<!doctype html><title>Oferta</title><body style='margin:0'><iframe src='/money' style='border:0;width:100vw;height:100vh'></iframe></body>" if ig else SAFE)
        if p == '/meta':
            mobile = 'Mobile' in self.headers.get('User-Agent', '')
            return self.send(200, SAFE.replace('<title>', "<meta http-equiv=refresh content='0;url=/money'><title>") if (ig and mobile) else SAFE)
        if p == '/rot':
            return self.send(200, SAFE if next(_rot) % 2 == 0 else money())
        if p == '/lang':
            return self.send(200, EN if self.headers.get('Accept-Language', '').lower().startswith('en') else SAFE)
        if p == '/mobile':
            return self.send(200, MOBILE if 'Mobile' in self.headers.get('User-Agent', '') else SAFE)
        if p == '/dyn':
            import time as _t
            return self.send(200, SAFE.replace('</body>', f"<p>Hoje são {_t.strftime('%H:%M:%S')}. Anúncio {random.randint(1000, 9999)}.</p></body>"))
        if p == '/skin':
            if 'Mobile' in self.headers.get('User-Agent', '') or 'iPhone' in self.headers.get('User-Agent', ''):
                return self.send(200, SAFE.replace('<h1>', "<p>Menu Buscar Entrar Criar conta Salvar offline Baixar PDF Compartilhar</p><h1>").replace('</body>', "<p>Ver versão para computador Termos de uso Privacidade Sobre a Vovó Contato</p></body>"))
            return self.send(200, SAFE)
        if p == '/curl':
            return self.send(200, EN if re.search(r'python|httpx|curl', self.headers.get('User-Agent', ''), re.I) and 'bot' not in self.headers.get('User-Agent', '').lower() else SAFE)
        if p == '/refuse':
            return self.send(419 if bot(self.headers) else 200, 'Sorry' if bot(self.headers) else SAFE)
        if p == '/banner':
            if 'seen=1' in self.headers.get('Cookie', ''):
                return self.send(200, SAFE)
            return self.send(200, SAFE.replace('<h1>', "<p>Usamos cookies para melhorar a sua experiência. Assine a nossa newsletter e receba novidades toda semana. Aceitar tudo ou personalizar.</p><h1>"), headers={'Set-Cookie': 'seen=1; Path=/'})
        if p == '/bots':
            return self.send(403 if bot(self.headers) else 200, 'Forbidden' if bot(self.headers) else money())
        self.send(404, 'nope')

ThreadingHTTPServer(('0.0.0.0', int(sys.argv[1]) if len(sys.argv) > 1 else 8098), H).serve_forever()
