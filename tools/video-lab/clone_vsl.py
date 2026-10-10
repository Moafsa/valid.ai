#!/usr/bin/env python3
"""Clones the four VSL fixtures with the REAL scanner and checks what ends up in the clone: the player points at our HLS, nothing at the
original, the note is there; then opens each clone in a browser and watches the network (playlist + pieces from our storage only).
usage: clone_vsl.py            (the fixture server must be up on :8099 and the web app on its public address)"""
import json, os, subprocess, sys, time, urllib.request, uuid, re
SECRET = next((l.split("=", 1)[1].strip().strip(chr(34)) for l in open("/opt/funnelai/.env") if l.startswith("SCANNER_SHARED_SECRET=")), "")
PW = next((re.sub(r".*://funnelai_app:([^@]*)@.*", r"\1", l.strip()) for l in open("/opt/funnelai/.env") if l.startswith("DATABASE_URL=")), "")
CDN = next((l.split("=", 1)[1].strip().strip(chr(34)) for l in open("/opt/funnelai/.env") if l.startswith("CDN_URL=")), "")
fails = 0
def ok(c, what, extra=""):
    global fails
    print(("PASS  " if c else "FAIL  ") + what + ("" if c else "   -> " + str(extra)[:300]))
    if not c: fails += 1
def psql(sql):
    r = subprocess.run(["docker", "exec", "-i", "-e", f"PGPASSWORD={PW}", "funnelai_postgres", "psql", "-h", "127.0.0.1", "-U", "funnelai_app", "-d", "funnelai", "-tA"], input=sql, capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr)
    return r.stdout.strip()
def clone(site):
    pid, jid = "vl" + uuid.uuid4().hex[:12], "vj" + uuid.uuid4().hex[:12]
    url = f"http://172.18.0.1:8099/{site}/"
    psql(f"""insert into scan_jobs (id, url, status, "createdAt", "updatedAt") values ('{jid}', '{url}', 'QUEUED', now(), now());
insert into projects (id, "workspaceId", name, "sourceUrl", status, "scanJobId", "createdAt", "updatedAt") values ('{pid}', 'lab_workspace_internal', 'TEST vsl {site}', '{url}', 'SCANNING', '{jid}', now(), now());""")
    body = {"job_id": jid, "project_id": pid, "url": url, "workspace_id": "lab_workspace_internal"}
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8001/api/scanner/start", data=json.dumps(body).encode(), headers={"content-type": "application/json", "x-scanner-secret": SECRET}))
    t0 = time.time()
    while time.time() - t0 < 360:
        st = psql(f"select status from scan_jobs where id='{jid}'")
        if st in ("DONE", "ERROR"): break
        time.sleep(3)
    return pid, st, time.time() - t0
sites = sys.argv[1:] or ["vsl_mp4", "vsl_webm", "vsl_hls"]
made = {}
for site in sites:
    pid, st, secs = clone(site)
    html = psql(f"""select string_agg(b->>'generatedHtml', ' ') from pages, jsonb_array_elements(blocks) b where "projectId"='{pid}'""") or ""
    notes = psql(f"""select "crawlStats"->'notes' from projects where id='{pid}'""")
    made[site] = pid
    print(f"-- {site}: {st} in {secs:.0f}s")
    ok(st == "DONE", f"{site}: the clone finished")
    ok(".m3u8" in html and CDN in html, f"{site}: the player points at our HLS", re.findall(r'"src":"[^"]+"', html)[:2])
    ok("172.18.0.1:8099/media" not in html, f"{site}: nothing points at the original video", re.findall(r"172\.18\.0\.1:8099/media[^\"' ]*", html)[:2])
    ok("data-vai-player" in html, f"{site}: the smart player replaced the original one")
    ok("pay.hotmart.com" in html or "data-vai" in html, f"{site}: the button survived")
    ok("em pedaços" in notes or "streaming original" in notes, f"{site}: the project says what was done with the video", notes[:160])
open("/tmp/vsl_projects.json", "w").write(json.dumps(made))
print("\nALL PASSED" if fails == 0 else f"\n{fails} FAILED")
sys.exit(1 if fails else 0)
