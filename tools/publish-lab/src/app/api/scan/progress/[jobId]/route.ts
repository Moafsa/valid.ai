import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth-helper'

export const dynamic = 'force-dynamic'

/**
 * Straight pass-through of the scanner service's own SSE stream — the
 * browser can't reach the scanner container directly (internal network
 * only), so this just relays the same bytes rather than re-implementing
 * polling/streaming logic on this side.
 *
 * `no-transform` is what keeps this alive: Next gzips responses by default
 * and its compressor holds a stream back until it ends, so a scan longer than
 * the client's 90s silence limit looked dead for its whole run and was
 * reported as "o scanner parou de responder" even though it was working.
 * `X-Accel-Buffering: no` asks the proxy in front not to hold it either.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { userId } = await getAuthUser()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const { jobId } = await params
  const scannerUrl = process.env.SCANNER_SERVICE_URL ?? 'http://scanner:8001'
  // a reconnecting EventSource says where it was: resume there
  const lastId = req.headers.get('last-event-id')
  const upstream = await fetch(`${scannerUrl}/api/scanner/progress/${jobId}`, {
    headers: { 'x-scanner-secret': process.env.SCANNER_SHARED_SECRET || '', ...(lastId ? { 'Last-Event-ID': lastId } : {}) },
    signal: req.signal,
  })

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  })
}
