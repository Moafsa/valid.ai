import { NextRequest } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const scannerUrl = process.env.SCANNER_SERVICE_URL || 'http://localhost:8001'

  // Proxy the SSE stream from the scanner service
  const response = await fetch(`${scannerUrl}/api/scanner/progress/${jobId}`, {
    headers: { Accept: 'text/event-stream' },
  })

  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
