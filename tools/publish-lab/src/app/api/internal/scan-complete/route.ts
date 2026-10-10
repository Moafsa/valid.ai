import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { persistScanResult } from '@/lib/scan-persist'

export const dynamic = 'force-dynamic'

/**
 * Where the scanner delivers a finished clone, server to server over the
 * private docker network. Doing it here instead of through the visitor's
 * browser means a clone completes even if the tab was closed or the stream
 * dropped, and a big funnel never has to squeeze through the browser and the
 * proxy's body limit. Guarded by a shared secret.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SCANNER_SHARED_SECRET || ''
  const given = req.headers.get('x-scanner-secret') || ''
  const a = Buffer.from(secret)
  const b = Buffer.from(given)
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { jobId, projectId, result, error } = (await req.json()) as {
      jobId?: string
      projectId?: string
      result?: any
      error?: string
    }
    if (!projectId || (!result && !error)) return NextResponse.json({ error: 'projectId and (result or error) are required' }, { status: 400 })
    const outcome = await persistScanResult({ jobId, projectId, result, scanError: error })
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('Internal scan-complete error:', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
