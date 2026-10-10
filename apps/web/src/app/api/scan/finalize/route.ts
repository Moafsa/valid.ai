import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { persistScanResult } from '@/lib/scan-persist'

/**
 * Persists the scan result produced by the scanner service. Normally the
 * scanner hands its result over directly (see /api/internal/scan-complete);
 * this route is the fallback for when that did not work and the browser got
 * the result instead.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthUser()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { jobId, projectId, result, error: scanError } = body as {
      jobId?: string
      projectId?: string
      result?: any
      error?: string
    }

    if (!projectId || (!result && !scanError)) {
      console.error('Finalize scan: missing projectId/result', { projectId, hasResult: !!result, hasScanError: !!scanError })
      return NextResponse.json({ error: 'projectId and (result or error) are required' }, { status: 400 })
    }

    const outcome = await persistScanResult({ jobId, projectId, result, scanError })
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Finalize scan error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
