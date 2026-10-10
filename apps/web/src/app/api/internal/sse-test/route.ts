import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Diagnostic: streams a few events a couple of seconds apart with exactly the
 * headers the scan progress stream uses, so the whole path (this server, the
 * proxy, the network) can be checked for something holding a stream back.
 * Guarded by the scanner's shared secret.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.SCANNER_SHARED_SECRET || ''
  const given = req.headers.get('x-scanner-secret') || ''
  const a = Buffer.from(secret)
  const b = Buffer.from(given)
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(enc.encode(': connected\n\n'))
      for (let i = 0; i < 6; i++) {
        controller.enqueue(enc.encode(`id: ${i}\ndata: ${JSON.stringify({ i, pad: 'x'.repeat(300) })}\n\n`))
        await new Promise(r => setTimeout(r, 2000))
      }
      controller.close()
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
