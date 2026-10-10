#!/bin/sh
# Publishing integration test: the REAL lib/publish.ts + lib/clone-document.ts against the real database,
# then the live web server over HTTP. usage: ./run.sh [source-project-id]
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
DBURL=$(docker inspect lab_batch --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^DATABASE_URL=' | cut -d= -f2-)
[ -n "$DBURL" ] || DBURL=$(grep '^DATABASE_URL=' /opt/funnelai/.env | cut -d= -f2- | tr -d '"')
docker run --rm --network funnelai_network -v "$HERE":/lab -v /opt/funnelai/apps/web/src:/websrc:ro -v /opt/funnelai/packages/db/prisma:/dbprisma:ro \
  -e DATABASE_URL="$DBURL" -e DIRECT_URL="$DBURL" -e SRC_PROJECT="$1" -e SCRIPT="$SCRIPT" -e WEB="${WEB:-http://web:3000}" -w /lab lab-node sh -c '
    [ -d node_modules/tsx ] || npm i --silent --no-audit --no-fund >/dev/null 2>&1
    mkdir -p prisma && cp /dbprisma/schema.prisma prisma/schema.prisma
    grep -q PublishedPage node_modules/.prisma/client/index.d.ts 2>/dev/null || npx prisma generate --schema prisma/schema.prisma 2>&1 | tail -3
    mkdir -p src/lib && for f in publish clone-document page-css legacy-base-css utils; do cp /websrc/lib/$f.ts src/lib/; done
    npx tsx ${SCRIPT:-e2e_publish.ts}'
