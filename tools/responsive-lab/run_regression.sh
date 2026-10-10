#!/bin/sh
# Responsive + editing + publishing regression suite. Run it after ANY change to the capture engine, the runtime,
# the editor or the publishing code:
#
#   tools/responsive-lab/run_regression.sh [quick|full]
#
# quick (default): clones the 14 synthetic responsive pages with the REAL scanner, compares each clone with its
#                  page at 5 screen sizes, runs the editor's responsiveness tests and the edit->save->compare test
# full:            the same at 12 screen sizes (desktop, notebook, tablet, several phones) plus the publishing test
#
# Needs: the scanner and web containers up, and the fixture server (see README.md).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
LAB=/opt/funnelai/tools
MODE=${1:-quick}
WIDTHS=1440,1024,768,480,375
[ "$MODE" = full ] && WIDTHS=1920,1440,1280,1024,820,768,600,480,414,390,360,320

curl -s -o /dev/null -w "" http://127.0.0.1:8099/resp/mq_basic.html || { echo "fixture server not running: cd $LAB/site-lab/www && python3 -m http.server 8099 --bind 0.0.0.0"; exit 2; }
DBURL=$(grep '^DATABASE_URL=' /opt/funnelai/.env | cut -d= -f2- | tr -d '"')
[ -n "$DBURL" ] || DBURL=$(docker inspect lab_batch --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | cut -d= -f2-)

echo "== 1. cloning the responsive fixtures with the real scanner"
python3 - <<'PY'
rows=[l.rstrip('\n').split('\t') for l in open('/opt/funnelai/tools/site-lab/sites/resp_fixtures.tsv')]
tag=__import__('time').strftime('%H%M%S')
open('/tmp/resp_fixtures_run.tsv','w').write(''.join(f"{int(r[0])+100000+int(tag)%1000*100}\t{r[1]}\t{r[2]}\t200\n" for r in rows))
PY
rm -f /tmp/scan_regress.jsonl
docker rm -f lab_regress >/dev/null 2>&1 || true
docker run --rm --name lab_regress --network funnelai_network -v $LAB/site-lab:/lab -v /tmp:/tmp -w /lab/harness -e DATABASE_URL="$DBURL" -e SCANNER_SHARED_SECRET="$(grep "^SCANNER_SHARED_SECRET=" /opt/funnelai/.env | cut -d= -f2- | tr -d '"')" lab-node node batch_scan.mjs /tmp/resp_fixtures_run.tsv /tmp/scan_regress.jsonl 3 1 1000000 2>&1 | tail -3
python3 $HERE/build_pairs.py /tmp/scan_regress.jsonl /tmp/pairs_regress.tsv

echo "== 2. clone vs original at $WIDTHS"
rm -rf $HERE/out/regress
docker run --rm --network funnelai_network -v $HERE:/rl -v /tmp:/tmp funnelai-scanner:latest python /rl/responsive_compare.py /tmp/pairs_regress.tsv /rl/out/regress --widths $WIDTHS --workers 3 | sort
python3 $HERE/summarize.py $HERE/out/regress || FAIL=1

echo "== 3. editor: responsiveness of edits (UI lab)"
$LAB/ui-lab/build.sh editor >/dev/null 2>&1
docker run --rm --network funnelai_network -v $LAB/ui-lab:/ui funnelai-scanner:latest python /ui/tests/editor_guard.py || FAIL=1
docker run --rm --network funnelai_network -v $LAB/ui-lab:/ui funnelai-scanner:latest python /ui/tests/editor_publish.py || FAIL=1

echo "== 3b. pressing things on the clones (FAQ, accordion, tabs, menu on a phone)"
IX=$(grep -P "\t[0-9]+\thttp" /tmp/pairs_regress.tsv | grep interactions | cut -f3)
[ -n "$IX" ] || IX=$(grep -P "interactions" /tmp/pairs_regress.tsv | cut -f3)
docker run --rm --network funnelai_network -v $HERE:/rl funnelai-scanner:latest python /rl/interactions_check.py "$IX" || FAIL=1

echo "== 4. edit -> save -> compare at several sizes"
python3 $HERE/regress_edit.py || FAIL=1

if [ "$MODE" = full ]; then
  echo "== 5. publishing: edit -> Publicar -> public address"
  # the publishing test copies a real clone: the one of mq_basic (it declares a viewport, unlike the no_viewport fixture that happens to be the newest)
  SRC=$(grep mq_basic /tmp/pairs_regress.tsv | cut -f3 | sed 's#.*/projects/\([a-z0-9]*\)/p/.*#\1#')
  $LAB/publish-lab/run.sh "$SRC" || FAIL=1
fi
[ -z "$FAIL" ] && echo "REGRESSION SUITE: ALL PASSED" || { echo "REGRESSION SUITE: FAILURES"; exit 1; }
