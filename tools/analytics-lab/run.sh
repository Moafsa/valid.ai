#!/bin/sh
# Runs a TypeScript script of the analytics lab against the real database, with the real lib code of the web app.
#   ./run.sh setup.ts                  create + publish a test project, prints STATE {...}
#   ./run.sh verify.ts <state.json>    compares what the queries say with what the simulator did
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
LAB=/opt/funnelai/tools/publish-lab          # has node_modules (prisma, tsx) already
DBURL=$(grep '^DATABASE_URL=' /opt/funnelai/.env | cut -d= -f2- | tr -d '"')
SCRIPT=${1:-setup.ts}; shift || true
docker run --rm --network funnelai_network -v "$LAB":/lab -v "$HERE":/an:ro -v /opt/funnelai/apps/web/src:/websrc:ro -v /opt/funnelai/packages/db/prisma:/dbprisma:ro \
  -e DATABASE_URL="$DBURL" -e DIRECT_URL="$DBURL" -e WEB="${WEB:-http://web:3000}" -e LAB_WORKSPACE_ID="${LAB_WORKSPACE_ID:-}" -e PORT="${PORT:-3100}" ${DOCKER_EXTRA:-} -w /lab lab-node sh -c '
    mkdir -p prisma && cp /dbprisma/schema.prisma prisma/schema.prisma
    cmp -s prisma/schema.prisma node_modules/.prisma/client/schema.prisma 2>/dev/null || npx prisma generate --schema prisma/schema.prisma 2>&1 | tail -3
    rm -rf src/lib src/app src/components && mkdir -p src && cp -r /websrc/lib /websrc/app /websrc/components src/
    [ -d node_modules/zod ] && [ -d node_modules/react ] || npm i --silent --no-audit --no-fund --legacy-peer-deps >/dev/null 2>&1
    cp /an/'"$SCRIPT"' /lab/.an_run.ts && npx tsx /lab/.an_run.ts '"$*"
