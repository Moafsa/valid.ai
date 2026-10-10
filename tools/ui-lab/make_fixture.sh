#!/bin/sh
# usage: make_fixture.sh <projectId> <name>   -> dist/editor_<name>.html (the real editor on that clone)
PID=$1; NAME=$2
docker exec funnelai_postgres psql -U funnelai_app -d funnelai -tAc "select json_build_object('projectId', p.\"projectId\", 'pageId', p.id, 'slug', p.slug, 'blocks', p.blocks, 'pageCss', coalesce(p.\"customCss\", (select \"customCss\" from pages where \"projectId\"=p.\"projectId\" and \"customCss\" is not null order by \"order\" limit 1)), 'shell', p.shell) from pages p where p.\"projectId\"='$PID' order by p.\"order\" limit 1" > /tmp/fx_$NAME.json
python3 - "$NAME" <<'PY'
import json,sys
n=sys.argv[1]
d=json.load(open(f'/tmp/fx_{n}.json'))
open(f'/opt/funnelai/tools/ui-lab/dist/data/editor_{n}.js','w').write('window.__FIXTURE = '+json.dumps(d)+';')
html=open('/opt/funnelai/tools/ui-lab/dist/editor.html').read().replace('data/editor.js',f'data/editor_{n}.js')
open(f'/opt/funnelai/tools/ui-lab/dist/editor_{n}.html','w').write(html)
print(n, 'blocks', len(d['blocks']), 'css', len(d['pageCss'] or ''))
PY
