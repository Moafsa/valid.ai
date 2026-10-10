#!/bin/sh
# usage: build.sh <entry>   (entries/<entry>.tsx -> dist/<entry>.html)
docker run --rm -v /opt/funnelai/tools/ui-lab:/ui -v /opt/funnelai/apps/web:/web:ro -w /ui node:20-slim sh -c "node build.mjs $1 && /ui/node_modules/.bin/tailwindcss -c /ui/tailwind.config.js -i /ui/app.css -o /ui/dist/tailwind.css --minify 2>&1 | tail -2"
