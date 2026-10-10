#!/bin/sh
# Everything about videos, in one go (about 25 minutes). Do NOT edit the scanner while it runs: a reload fails the running clones.
#   fixtures server on :8099 must be up (python3 -m http.server 8099 --bind 0.0.0.0 in tools/site-lab/www)
HERE=$(cd "$(dirname "$0")" && pwd); cd "$HERE"
python3 gen_fixtures.py > /dev/null
echo "== 1. the processor on four sources";  docker exec -i funnelai_scanner python - < test_video_processor.py 2>&1 | grep -E "FAIL|ALL PASSED|FAILED"
echo "== 2. one fixture per situation";      python3 check_situations.py 2>&1 | grep -E "FAIL|ALL PASSED|FAILED"
echo "== 3. HLS clones play from our storage"; python3 clone_vsl.py 2>&1 | grep -E "FAIL|ALL PASSED|FAILED"
P=$(python3 -c "import json;print(' '.join(f'{k}:{v}' for k,v in json.load(open('/tmp/vsl_projects.json')).items()))" 2>/dev/null)
SLUGS=""; for kv in $P; do n=${kv%%:*}; id=${kv#*:}; s=$(docker exec -e PGPASSWORD="$(grep '^DATABASE_URL' /opt/funnelai/.env | sed 's|.*://funnelai_app:\([^@]*\)@.*|\1|')" funnelai_postgres psql -h 127.0.0.1 -U funnelai_app -d funnelai -tA -c "select slug from pages where \"projectId\"='$id' order by \"order\" limit 1"); SLUGS="$SLUGS $n:$id:$s"; done
docker run --rm --network host -v "$HERE":/lab funnelai-scanner python /lab/play_check.py https://be-vallid.com $SLUGS 2>&1 | grep -E "FAIL|ALL PASSED|FAILED"
