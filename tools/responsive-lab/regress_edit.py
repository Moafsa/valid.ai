#!/usr/bin/env python3
"""A cloned page stays responsive after the person edits it.

For each responsive fixture (a clone made by the real scanner from a known test page):
  1. the real editor (headless, in the UI lab) edits the clone: text, a Desktop font-size, a colour, a picture,
     a duplicated section and a new one, then saves (what the editor would POST to the server is captured)
  2. a copy of the project is made with those saved blocks, as the server would hold them after saving
  3. the unedited clone and the edited copy are compared at several screen sizes (responsive_compare.py): every part
     the person did not touch must sit where it did before, on every screen, and the menu must still open

usage: regress_edit.py [fixture names...]      (default: all)
"""
import json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
PAIRS = {l.split("\t")[0]: l.rstrip("\n").split("\t") for l in open(f"{HERE}/pairs_fx2.tsv")}
# fixture name (ui-lab) -> pair id (clone of that test page)
FIXTURES = {"mq": "9101", "jsl": "9103", "car": "9104", "pic": "9105", "burger": "9106", "sticky": "9108", "aspect": "9112", "util": "9114"}
WIDTHS = "1440,1024,768,480,375"


def sh(cmd, **kw):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, **kw)


def psql(sql: str) -> str:
    r = subprocess.run(["docker", "exec", "-i", "funnelai_postgres", "psql", "-U", "funnelai_app", "-d", "funnelai", "-tA"], input=sql, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr[:300])
    return r.stdout.strip()


def project_of(url: str) -> str:
    return re.search(r"/projects/([a-z0-9]+)/p/", url).group(1)


def make_copy(src_pid: str, saved: dict) -> tuple[str, str]:
    """A copy of the project whose first page holds the blocks the editor saved. Returns (project id, page slug)."""
    new = "regr" + format(int(time.time() * 1000), "x")[-10:]
    blocks = json.dumps(saved["blocks"], ensure_ascii=False).replace("$", "\\u0024")
    psql(f"""
insert into projects (id, "workspaceId", name, "sourceUrl", status, "createdAt", "updatedAt")
  select '{new}', "workspaceId", 'REGR edited ' || name, "sourceUrl", 'READY', now(), now() from projects where id='{src_pid}';
insert into pages (id, "projectId", name, slug, "order", blocks, "customCss", shell, "createdAt", "updatedAt")
  select 'pg' || '{new}' || "order", '{new}', name, slug, "order", case when "order" = 0 then $jsonblk${blocks}$jsonblk$::jsonb else blocks end, "customCss", shell, now(), now()
  from pages where "projectId"='{src_pid}';
""")
    slug = psql(f"""select slug from pages where "projectId"='{new}' order by "order" limit 1""")
    return new, slug


def main():
    names = sys.argv[1:] or list(FIXTURES)
    os.makedirs(f"{HERE}/out/edit", exist_ok=True)
    pairs = []
    created = []
    failures = 0
    for n in names:
        pid_pair = FIXTURES[n]
        orig_clone = PAIRS[pid_pair][2]
        src_pid = project_of(orig_clone)
        r = sh(f"docker run --rm --network funnelai_network -v /opt/funnelai/tools/ui-lab:/ui funnelai-scanner python /ui/tests/edit_session.py {n}")
        print(r.stdout.strip() or r.stderr.strip()[:300])
        saved_path = f"/opt/funnelai/tools/ui-lab/out/{n}_saved.json"
        if not os.path.exists(saved_path):
            print(f"FAIL  {n}: the editor session produced nothing"); failures += 1; continue
        saved = json.load(open(saved_path))
        if not saved.get("saved") or not saved["saved"].get("blocks"):
            print(f"FAIL  {n}: the editor did not save", saved.get("errors")); failures += 1; continue
        new_pid, slug = make_copy(src_pid, saved["saved"])
        created.append(new_pid)
        pairs.append((pid_pair, orig_clone, f"http://web:3000/projects/{new_pid}/p/{slug}"))
    with open(f"{HERE}/pairs_edit.tsv", "w") as f:
        for i, o, c in pairs:
            f.write(f"{i}\t{o}\t{c}\n")
    sh(f"rm -rf {HERE}/out/edit/*")
    r = sh(f"docker run --rm --network funnelai_network -v {HERE}:/rl funnelai-scanner python /rl/responsive_compare.py /rl/pairs_edit.tsv /rl/out/edit --widths {WIDTHS} --workers 3")
    print(r.stdout.strip()[-1500:])
    for i, _, _ in pairs:
        res = json.load(open(f"{HERE}/out/edit/{int(i):03d}/result.json"))
        # the edited heading / picture are expected to be unmatched; everything else must sit exactly where it did
        def broken(v):
            if v.get("fail"):
                return True
            nbad = round(v["bad"] * v["matched"] * v["n"])
            # one part may legitimately move (the heading was made bigger, the picture replaced); the rest must not
            return bool(nbad > 1 or v["bad"] > 0.06 and nbad > 2 or v["matched"] < 0.7 or (v["overflowC"] and not v["overflowO"]) or v.get("menuBroken"))
        bad = {w: v for w, v in res["widths"].items() if broken(v)}
        name = [k for k, v in FIXTURES.items() if v == i][0]
        if bad:
            failures += 1
            print(f"FAIL  {name}: edited page is not faithful at", {w: (v.get("fail") or {k: v[k] for k in ("matched", "bad", "overflowC", "menuBroken") if k in v}) for w, v in bad.items()})
        else:
            print(f"PASS  {name}: the edited page keeps the layout of the original on every screen size")
    if created:
        psql("delete from projects where id in (" + ",".join(f"'{p}'" for p in created) + ");")
    print("\nALL PASSED" if failures == 0 else f"\n{failures} FAILED")
    sys.exit(1 if failures else 0)


main()
