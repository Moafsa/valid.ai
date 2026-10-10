"""Helpers for the UI lab: serve dist/ over http (so /api mocks work) and open a page."""
import asyncio, json, subprocess, sys, time
from playwright.async_api import async_playwright

PROXY = r"""
import http.server, socketserver, urllib.request, os, sys
DIST = '/ui/dist'
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=DIST, **k)
    def log_message(self, *a): pass
    def do_GET(self):
        path = self.path.split('?')[0]
        if os.path.exists(DIST + path) and path != '/':
            return super().do_GET()
        try:
            r = urllib.request.urlopen(urllib.request.Request('http://web:3000' + self.path, headers={'User-Agent': self.headers.get('User-Agent', '')}), timeout=30)
            body = r.read()
            self.send_response(r.status)
            for k, v in r.getheaders():
                if k.lower() in ('content-type', 'cache-control', 'content-security-policy', 'x-frame-options'): self.send_header(k, v)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers(); self.wfile.write(body)
        except Exception as e:
            self.send_response(502); self.end_headers(); self.wfile.write(str(e).encode())
class T(socketserver.ThreadingMixIn, http.server.HTTPServer): daemon_threads = True
T(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
"""

def serve(port=8123):
    """Serves dist/ and passes every other path to the real web app (so iframes of real clone pages are same-origin)."""
    p = subprocess.Popen([sys.executable, "-c", PROXY, str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    return p

AI_MOCK = {"mode": "nokey"}

async def mock_api(route):
    req = route.request
    if "/api/editor/agent" in req.url:
        # the agent endpoint: with no AI connected the panel falls back to its small built-in interpreter
        await route.fulfill(status=503, content_type="application/json", body=json.dumps({"error": "A IA ainda não foi conectada neste projeto.", "code": "no_ai_key"}))
    elif "ai-assist" in req.url:
        if AI_MOCK["mode"] == "nokey":
            await route.fulfill(status=503, content_type="application/json", body=json.dumps({"error": "A IA ainda não foi conectada neste projeto.", "code": "no_ai_key"}))
        else:
            await route.fulfill(status=200, content_type="application/json", body=json.dumps(AI_MOCK["body"]))
    else:
        await route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "url": "https://placehold.co/10", "slug": "teste"}))
