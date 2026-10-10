#!/bin/sh
# The whole analytics check: a published test project, 46 real visitors with known behaviour, the numbers the queries give,
# an A/B test with 24 more, and a look at every screen (needs the web image with the analytics code running).
#   ./run_all.sh            (about 6 minutes)   reads/writes out/
set -e
HERE=$(cd "$(dirname "$0")" && pwd); cd "$HERE"; mkdir -p out
./run.sh setup.ts 2>&1 | grep '^STATE ' | sed 's/^STATE //' > out/state.json
PID=$(python3 -c "import json;print(json.load(open('out/state.json'))['projectId'])"); SLUG=$(python3 -c "import json;print(json.load(open('out/state.json'))['slug'])")
docker run --rm --network funnelai_network -v "$HERE":/an funnelai-scanner python /an/traffic.py /an/out/state.json /an/out/truth.json | tail -3
./run.sh verify.ts /an/out/truth.json 2>&1 | grep -v 'npm notice' | tail -60
./run.sh exp_setup.ts "$PID" 2>&1 | grep EXP
docker run --rm --network funnelai_network -v "$HERE":/an funnelai-scanner python /an/ab.py /an/out/state.json /an/out/truth_ab.json | tail -2
./run.sh verify_ab.ts /an/out/truth_ab.json 2>&1 | grep -v 'npm notice' | tail -10
# the screens, with the real numbers (the API of the lab is the real route code against the database)
docker rm -f an_api >/dev/null 2>&1 || true
WS=$(docker exec -i funnelai_postgres psql -U funnelai_app -d funnelai -tAc "select \"workspaceId\" from projects where id='$PID'")
LAB_WORKSPACE_ID=$WS DOCKER_EXTRA="-d --name an_api" ./run.sh serve_api.ts >/dev/null 2>&1; sleep 25
(cd ../ui-lab && ./build.sh analytics >/dev/null 2>&1 && docker run --rm --network funnelai_network -v /opt/funnelai/tools/ui-lab:/ui funnelai-scanner python /ui/tests/analytics_ui.py "$PID" "$SLUG" | tail -8)
docker rm -f an_api >/dev/null 2>&1 || true
# plans (limits, subscription state, enforcement) and pixels (config, risky code, ingestion without duplicates, goals) against the real database
SEC=$(grep '^SCANNER_SHARED_SECRET=' /opt/funnelai/.env | cut -d= -f2- | tr -d '"')
DOCKER_EXTRA="-e SCANNER_SHARED_SECRET=$SEC -e SCANNER_SERVICE_URL=http://scanner:8001" ./run.sh plans_pixels.ts 2>&1 | grep -E 'FAIL|ALL PASSED|FAILED'
# the pixel runtime in a real browser (vendors faked): ../pixel-lab/pixel_e2e.py
docker run --rm -v /opt/funnelai/apps/web/public:/web/public:ro -v /opt/funnelai/tools/pixel-lab:/lab funnelai-scanner python /lab/pixel_e2e.py 2>&1 | grep -E 'FAIL|ALL PASSED|FAILED'
