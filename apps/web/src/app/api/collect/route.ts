import { NextRequest } from 'next/server'
import { ingest, tooBusy, type Batch } from '@/lib/analytics/ingest'
import { clientIp } from '@/lib/analytics/geo'

/**
 * Public collector (no login: the visitors of a published site are anonymous, see middleware.ts).
 * The page's script posts small batches of what a visit did; they are tied to the visit and the browser and stored.
 * Always answers 204: the page has nothing useful to do with a failure, and must never be slowed by one.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const empty = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })

export async function POST(req: NextRequest) {
  try {
    const len = Number(req.headers.get('content-length') || 0)
    if (len > 300_000) return empty()
    const text = await req.text()
    if (text.length > 300_000) return empty()
    const body = JSON.parse(text) as Batch
    if (!body || typeof body !== 'object' || typeof body.p !== 'string') return empty()
    const ip = clientIp(req.headers)
    if (tooBusy(`${ip || 'x'}|${body.p}`)) return empty()
    await ingest(body, ip)
  } catch (e) {
    console.error('collect error:', e instanceof Error ? e.message : e)
  }
  return empty()
}
