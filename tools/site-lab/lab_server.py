#!/usr/bin/env python3
"""Lab web server: static files from www/ plus misbehaving sites (slow, 500s, redirect chains, bot wall...)."""
import os, sys, time, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "www")
HITS = {}
LOCK = threading.Lock()

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a):
        pass
    def _send(self, code, body=b"", ctype="text/html; charset=utf-8", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        path = u.path
        with LOCK:
            HITS[path] = HITS.get(path, 0) + 1
            n = HITS[path]
        if "delay" in q:
            time.sleep(float(q["delay"][0]))
        if path.startswith("/x/err500"):
            if n <= 2:
                return self._send(500, b"<h1>Internal Server Error</h1>")
            self.path = "/q_state_auto/"
            return super().do_GET()
        if path.startswith("/x/redir1"):
            return self._send(302, b"", extra={"Location": "/x/redir2"})
        if path.startswith("/x/redir2"):
            return self._send(302, b"", extra={"Location": "/x/redir3"})
        if path.startswith("/x/redir3"):
            return self._send(302, b"", extra={"Location": "/q_state_auto/"})
        if path.startswith("/x/block"):
            return self._send(403, "<html><body><h1>Access denied</h1><p>Cloudflare: you are blocked (bot wall)</p></body></html>".encode())
        if path.startswith("/x/slow"):
            time.sleep(7)
            self.path = "/q_state_auto/"
            return super().do_GET()
        if path.startswith("/x/jserr"):
            return self._send(200, b"""<!DOCTYPE html><html><head><meta charset=utf-8><title>js errors</title></head><body>
<h1>Pagina com erros de JS</h1><p>Texto normal da pagina.</p><button id=b>Comprar</button>
<script>setInterval(function(){ throw new Error('boom ' + Date.now()) }, 300); document.getElementById('b').onclick = function(){ undefinedFunction() }</script></body></html>""")
        if path.startswith("/x/empty"):
            return self._send(200, b"<!DOCTYPE html><html><head><title>vazio</title></head><body></body></html>")
        if path.startswith("/x/jsredirect"):
            return self._send(200, b"<!DOCTYPE html><html><head><meta charset=utf-8><title>redir</title></head><body><h1>Redirecionando...</h1><script>setTimeout(function(){location.replace('/q_state_auto/')}, 1800)</script></body></html>")
        if path.startswith("/x/bightml"):
            para = "<p>" + ("Lorem ipsum dolor sit amet consectetur adipiscing elit. " * 30) + "</p>"
            body = "<!DOCTYPE html><html><head><meta charset=utf-8><title>big</title></head><body><h1>Pagina gigante</h1>" + para * 1200 + "</body></html>"
            return self._send(200, body.encode())
        if path.startswith("/x/infloader"):
            return self._send(200, b"""<!DOCTYPE html><html><head><meta charset=utf-8><title>loader</title></head><body style='font-family:system-ui;text-align:center'>
<h1>Carregando seu plano...</h1><div style='width:80%;height:14px;background:#ddd;margin:20px auto'><i id=i style='display:block;height:100%;width:0;background:#d0541f'></i></div><b id=p>0%</b>
<script>var p=0;setInterval(function(){p=Math.min(99,p+1);document.getElementById('i').style.width=p+'%';document.getElementById('p').textContent=p+'%'},200)</script></body></html>""")
        return super().do_GET()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
