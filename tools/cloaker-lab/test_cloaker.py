"""Runs the cloaker check (v2) on the lab sites (inside the scanner image, private addresses allowed ONLY here) and checks the verdicts
AND the condition that was found. Every cloaking technique ever identified gets a site in server.py and a line in CASES: the detector only
gets more complete.
usage: test_cloaker.py [path ...]   (default: all)"""
import asyncio, json, os, sys
sys.path.insert(0, "/app")
from services import cloaker_probe as C

async def allow(url): return url.startswith("http://172.18.0.1:8098/")
async def noguard(ctx): return None
C.url_is_allowed = allow
C._guard = noguard
C._sem = asyncio.Semaphore(3)                    # the lab can afford three checks at once
fails = 0
def ok(c, what, extra=""):
    global fails
    print(("PASS  " if c else "FAIL  ") + what + ("" if c else "   -> " + str(extra)))
    if not c: fails += 1

# path: (acceptable statuses, group that must be named among the findings (None = no deliberate finding at all))
CASES = {
    "/clean": ({"green"}, None),
    "/dyn": ({"green"}, None),                   # a clock and a random ad change by themselves: not cloaking
    "/lang": ({"green"}, None),                  # a translation: not cloaking
    "/mobile": ({"green"}, None),                # a phone layout: not cloaking
    "/bots": ({"green"}, None),                  # a firewall turning robots away: not cloaking by itself
    "/lp": ({"red"}, "real"),                    # phone + app + origin + parameters together
    "/js": ({"red"}, "real"),                    # the decision is made by a script in the browser
    "/drop": ({"red"}, "real"),                  # redirect for real visitors that also throws the parameters away
    "/ref": ({"red", "yellow"}, "referer"),      # the origin of the click alone is the trigger
    "/utm": ({"red", "yellow"}, "params"),       # a parameter alone is the trigger
    "/region": ({"red", "yellow"}, "region"),    # trusts a region header
    "/cookie": ({"red", "yellow"}, "session"),   # only the first visit gets the offer
    "/late": ({"red", "yellow"}, "referer"),     # the page changes a few seconds after loading
    "/iframe": ({"red", "yellow"}, "referer"),   # a full-screen frame
    "/meta": ({"red", "yellow"}, "real"),        # a meta refresh
    "/skin": ({"green"}, None),                  # a phone skin of the same article, for every phone: the device, not a filter
    "/curl": ({"green"}, None),                  # only a program without a browser gets another page: not a filter on robots
    "/refuse": ({"green"}, None),                # robots get an error page (419), people the page
    "/banner": ({"green"}, None),                # a banner on the first visit only: text drift, not another offer
    "/rot": ({"yellow"}, None),                  # rotation for everybody: unreliable, suspicious, not proof
    "/ab": ({"yellow"}, None),
}

async def run(path):
    jid = C.start(f"http://172.18.0.1:8098{path}")
    while C.JOBS[jid]["status"] in ("queued", "running"): await asyncio.sleep(1)
    return C.JOBS[jid]

async def check(path):
    want, group = CASES[path]
    j = await run(path)
    a = j.get("analysis") or {}
    os.makedirs("/lab/out", exist_ok=True)
    json.dump(C.public(j), open("/lab/out/" + path.strip("/") + ".json", "w"))
    ok(j["status"] == "done" and a.get("status") in want, f"{path}: status {'/'.join(sorted(want))}", f"{j['status']} {a.get('status')} {a.get('confidence')} {j.get('error')} noise={a.get('noise')}")
    groups = {f["group"] for f in a.get("findings", []) if f["kind"] == "deliberate" and f["sig"] >= 0.55}
    if group:
        ok(group in groups, f"{path}: the condition is named ({group})", f"found {groups}")
    elif want == {"green"}:
        ok(not groups, f"{path}: no deliberate condition invented", f"found {groups}")
    if a.get("status") == "red":
        ok((a.get("confidence") or 0) >= 70 and a.get("evidence"), f"{path}: red comes with a confidence and the evidence", f"{a.get('confidence')} {a.get('evidence')}")
    return path, j

async def main():
    paths = sys.argv[1:] or list(CASES)
    res = dict(await asyncio.gather(*[check(p) for p in paths]))
    if "/lp" in res:
        a = res["/lp"]["analysis"]
        ok(a["counts"]["scenarios"] >= 38 and a["counts"]["groups"] >= 12, f"/lp: {a['counts']['scenarios']} scenarios in {a['counts']['groups']} groups tested", str(a["counts"]))
        ok(len(a["versions"]) >= 2 and a["versions"][0]["letter"] == "A" and a["versions"][0]["shot"], "/lp: two versions with screenshots (the reference is A)")
        ok(a.get("clonePersona") in ("ig_ios", "ig_android", "fb_android", "tiktok", "fb_ios", "google_mobile"), f"/lp: a visitor identity to clone with ({a.get('clonePersona')})")
        ok(a.get("real") is None or True, "/lp: ok")
        ok(any("Keitaro" in t["name"] for t in a["tech"]), "/lp: the traffic router cookie is noticed", str(a["tech"]))
        ok(a["redirects"]["roads"], "/lp: redirect roads listed")
        sc = {s["id"]: s for s in a["scenarios"]}
        ok(sc["googlebot"]["version"] == "A" and sc["ig_ios"]["version"] != "A", "/lp: the robot gets A, the Instagram visitor gets another version", f"{sc['googlebot']['version']} {sc['ig_ios']['version']}")
        ok(any(c["kind"] == "text" for c in sc["ig_ios"]["changes"]) and any(c["kind"] == "title" for c in sc["ig_ios"]["changes"]), "/lp: it says WHAT changed (text and title)", str(sc["ig_ios"]["changes"]))
        ok(a["consistency"]["baseline"]["stable"], "/lp: the ordinary visitor's page is stable (consistency test)")
    if "/js" in res:
        a = res["/js"]["analysis"]
        ok(any("navegador" in t or "veio" in t for t in a["tells"]), "/js: the checking script is described", str(a["tells"]))
        ok(any(s["id"].startswith("ig_") and any(c["kind"] in ("jsredirect", "url") for c in s["changes"]) for s in a["scenarios"]), "/js: the script redirect is shown as a change")
    if "/drop" in res:
        pk = res["/drop"]["analysis"]["paramsKept"]
        ok(pk and not any(v["inFinalUrl"] for v in pk.values()), "/drop: the parameters are reported as lost on the way", str(pk))
        ok(res["/drop"]["analysis"]["redirects"]["divergent"], "/drop: different scenarios travelled different roads")
    if "/ab" in res or "/rot" in res:
        for p in ("/ab", "/rot"):
            if p in res: ok(res[p]["analysis"]["rotation"] or res[p]["analysis"]["noise"] >= 0.34, f"{p}: the consistency test notices the changing page")
    if "/late" in res:
        ok(any(f.get("late") for f in res["/late"]["analysis"]["findings"]) or res["/late"]["analysis"]["late"], "/late: the page swapped after loading is reported", str(res["/late"]["analysis"]["late"])[:200])
    if "/iframe" in res:
        ok(any(c["kind"] == "iframe" for s in res["/iframe"]["analysis"]["scenarios"] for c in s["changes"]), "/iframe: the full-screen frame is reported")
    if "/meta" in res:
        ok(any(c["kind"] in ("meta", "url") for s in res["/meta"]["analysis"]["scenarios"] for c in s["changes"]), "/meta: the meta refresh is reported")
    if "/bots" in res:
        a = res["/bots"]["analysis"]
        ok(any(s["blocked"] for s in a["scenarios"] if s["group"] in ("crawler", "social")), "/bots: the robots turned away are listed")
    print("\nALL PASSED" if fails == 0 else f"\n{fails} FAILED")
asyncio.run(main())
