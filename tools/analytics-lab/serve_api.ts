// The analytics API of the web app, served from the lab: the REAL route handlers against the real database,
// without Clerk (acts as the owner of LAB_WORKSPACE_ID). Used by the UI lab to look at the screens with real numbers.
import { createServer } from 'node:http'
import { NextRequest } from 'next/server'
import * as route from '@/app/api/projects/[id]/analytics/[view]/route'

const PORT = Number(process.env.PORT || 3100)
createServer(async (req, res) => {
  try {
    const u = new URL(req.url || '/', 'http://lab')
    const m = u.pathname.match(/^\/api\/projects\/([^/]+)\/analytics\/([^/]+)$/)
    if (!m) { res.writeHead(404).end('no'); return }
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = Buffer.concat(chunks).toString('utf8')
    const nreq = new NextRequest(u.toString(), { method: req.method, body, headers: req.headers as any })
    const handler = req.method === 'POST' ? route.POST : route.GET
    const r = await handler(nreq as any, { params: Promise.resolve({ id: m[1], view: m[2] }) })
    res.writeHead(r.status, { 'content-type': 'application/json' }).end(await r.text())
  } catch (e: any) {
    console.error(e)
    res.writeHead(500).end(JSON.stringify({ error: String(e?.message || e) }))
  }
}).listen(PORT, '0.0.0.0', () => console.log('analytics API on', PORT))
