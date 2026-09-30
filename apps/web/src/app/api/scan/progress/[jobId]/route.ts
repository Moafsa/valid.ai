import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth-helper'

export const dynamic = 'force-dynamic'

/**
 * Straight pass-through of the scanner service's own SSE stream — the
 * browser can't reach the scanner container directly (internal network
 * only), so this just relays the same bytes rather than re-implementing
 * polling/streaming logic on this side.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { userId } = await getAuthUser()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const { jobId } = await params
  const scannerUrl = process.env.SCANNER_SERVICE_URL ?? 'http://scanner:8001'
  const upstream = await fetch(`${scannerUrl}/api/scanner/progress/${jobId}`)

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
