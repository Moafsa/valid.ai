#!/bin/bash
# Type-checks the web app against the current sources in about a minute (the real image build takes ~7).
#   tools/tc/run.sh            prisma generate (if the schema changed) + tsc
# The dependencies live in tools/tc/ws (npm install of the workspace, done once).
set -e
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
docker run --rm \
  -e DATABASE_URL=postgresql://x:x@localhost:5432/x -e DIRECT_URL=postgresql://x:x@localhost:5432/x \
  -v "$HERE/ws":/ws \
  -v "$ROOT/apps/web/src":/ws/apps/web/src:ro -v "$ROOT/apps/web/tsconfig.json":/ws/apps/web/tsconfig.json:ro \
  -v "$ROOT/apps/web/next-env.d.ts":/ws/apps/web/next-env.d.ts:ro -v "$ROOT/apps/web/next.config.ts":/ws/apps/web/next.config.ts:ro \
  -v "$ROOT/packages/db/src":/ws/packages/db/src:ro -v "$ROOT/packages/db/prisma":/ws/packages/db/prisma:ro -v "$ROOT/packages/db/tsconfig.json":/ws/packages/db/tsconfig.json:ro \
  -v "$ROOT/packages/types/src":/ws/packages/types/src:ro \
  -w /ws lab-node sh -c '
    if [ ! -f /ws/.generated ] || [ /ws/packages/db/prisma/schema.prisma -nt /ws/.generated ]; then
      npx prisma generate --schema=packages/db/prisma/schema.prisma >/tmp/gen.log 2>&1 || { cat /tmp/gen.log; exit 1; }
      touch /ws/.generated
    fi
    cd apps/web && npx tsc --noEmit --incremental false 2>&1 | head -${TC_LINES:-60}'
