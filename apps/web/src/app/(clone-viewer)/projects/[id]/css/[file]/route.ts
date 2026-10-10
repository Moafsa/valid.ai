import { NextRequest } from 'next/server'
import { brotliCompressSync, gzipSync, constants } from 'zlib'
import { db } from '@funnelai/db'
import { cssHash } from '@/lib/clone-document'

export const dynamic = 'force-dynamic'

// Compressed copies are kept in memory: a hash names exactly one text, so they
// never go stale, and a funnel's visitors all ask for the same file.
const packed = new Map<string, { raw: Buffer; gz: Buffer; br: Buffer }>()

function pack(hash: string, css: string) {
  let hit = packed.get(hash)
  if (!hit) {
    const raw = Buffer.from(css, 'utf8')
    hit = {
      raw,
      gz: gzipSync(raw, { level: 9 }),
      br: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }),
    }
    if (packed.size > 40) packed.delete(packed.keys().next().value as string)
    packed.set(hash, hit)
  }
  return hit
}

// The stylesheet of a cloned page as a standalone file. The name is a hash of
// its text, so the browser may keep it forever: a funnel's steps all share one
// stylesheet and download it once (compressed: the proxy in front only
// compresses HTML, and a Tailwind build is ~200KB of text).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params
  const hash = file.replace(/\.css$/, '')
  if (!/^[a-f0-9]{16}$/.test(hash)) return new Response('Not found', { status: 404 })

  let body = packed.get(hash)
  if (!body) {
    // the working copy and the published snapshot may hold different texts: either one can be asked for
    const [pages, published] = await Promise.all([
      db.page.findMany({ where: { projectId: id }, select: { customCss: true } }),
      db.publishedPage.findMany({ where: { projectId: id }, select: { customCss: true } }),
    ])
    const hit = [...published, ...pages].find(p => p.customCss && cssHash(p.customCss) === hash)
    if (!hit?.customCss) return new Response('Not found', { status: 404 })
    body = pack(hash, hit.customCss)
  }

  const accept = req.headers.get('accept-encoding') || ''
  const headers: Record<string, string> = {
    'content-type': 'text/css; charset=utf-8',
    'cache-control': 'public, max-age=31536000, immutable',
    vary: 'Accept-Encoding',
  }
  let payload = body.raw
  if (/\bbr\b/.test(accept)) { payload = body.br; headers['content-encoding'] = 'br' }
  else if (/\bgzip\b/.test(accept)) { payload = body.gz; headers['content-encoding'] = 'gzip' }
  return new Response(new Uint8Array(payload), { headers })
}
