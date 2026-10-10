#!/bin/sh
# usage: run.sh <url> <label>
cd /opt/funnelai && docker run --rm --network funnelai_network \
  -e DATABASE_URL="$(docker exec funnelai_web sh -c 'echo $DATABASE_URL')" \
  -e SCANNER_SHARED_SECRET="$(grep '^SCANNER_SHARED_SECRET=' /opt/funnelai/.env | cut -d= -f2- | tr -d '"')" \
  -v /opt/funnelai/tools/site-lab/harness:/work -w /work node:20-slim sh -c \
  "apt-get update -qq >/dev/null && apt-get install -y -qq openssl >/dev/null; [ -d node_modules/.prisma ] || (npm install --silent >/dev/null 2>&1 && npx prisma generate --schema=schema.prisma >/dev/null 2>&1); node harness.mjs '$1' '$2'"
