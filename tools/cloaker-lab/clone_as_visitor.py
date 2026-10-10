#!/usr/bin/env python3
"""Clones a cloaked test link twice with the REAL scanner: as everybody (gets the blog) and as an Instagram visitor (gets the offer).
usage: clone_as_visitor.py <path e.g. /lp> [persona]"""
import json, os, subprocess, sys, time, urllib.request, uuid
SECRET = os.environ.get("SCANNER_SHARED_SECRET") or next((l.split("=", 1)[1].strip().strip(chr(34)) for l in open("/opt/funnelai/.env") if l.startswith("SCANNER_SHARED_SECRET=")), "")
path = sys.argv[1]; persona = sys.argv[2] if len(sys.argv) > 2 else None
def psql(sql):
    r = subprocess.run(["docker", "exec", "-i", "funnelai_postgres", "psql", "-U", "funnelai_app", "-d", "funnelai", "-tA"], input=sql, capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr)
    return r.stdout.strip()
def clone(persona):
    pid, jid = "cl" + uuid.uuid4().hex[:12], "cj" + uuid.uuid4().hex[:12]
    url = f"http://172.18.0.1:8098{path}"
    psql(f"""insert into scan_jobs (id, url, status, "createdAt", "updatedAt") values ('{jid}', '{url}', 'QUEUED', now(), now());
insert into projects (id, "workspaceId", name, "sourceUrl", status, "scanJobId", "createdAt", "updatedAt") values ('{pid}', 'lab_workspace_internal', 'TEST cloaker {persona or "plain"}', '{url}', 'SCANNING', '{jid}', now(), now());""")
    body = {"job_id": jid, "project_id": pid, "url": url, "workspace_id": "lab_workspace_internal"}
    if persona: body["persona"] = persona
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8001/api/scanner/start", data=json.dumps(body).encode(), headers={"content-type": "application/json", "x-scanner-secret": SECRET}))
    for _ in range(120):
        st = psql(f"select status from scan_jobs where id='{jid}'")
        if st in ("DONE", "ERROR"): break
        time.sleep(3)
    html = psql(f"""select string_agg(b->>'generatedHtml', ' ') from pages, jsonb_array_elements(blocks) b where "projectId"='{pid}'""")
    err = psql(f"select \"errorMsg\" from scan_jobs where id='{jid}'")
    psql(f"delete from projects where id='{pid}'; delete from scan_jobs where id='{jid}'")
    return st, html or "", err
bad = 0
for p in (None, persona):
    if p is None and persona is None: pass
    st, html, err = clone(p)
    text = html.lower()
    print(f"{'persona ' + p if p else 'as everybody':<18} -> {st}  offer={'emagre' in text}  blog={'receitas da vov' in text}  {err[:80]}")
    want_offer = bool(p)
    if st != "DONE" or ('emagre' in text) != want_offer: bad += 1
print("ALL PASSED" if not bad else f"{bad} FAILED")
sys.exit(1 if bad else 0)
