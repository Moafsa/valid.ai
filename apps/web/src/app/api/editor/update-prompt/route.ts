import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthUser()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { blockId, currentCode, instruction } = await req.json()
    const scannerUrl = process.env.SCANNER_SERVICE_URL || 'http://localhost:8001'

    const res = await fetch(`${scannerUrl}/api/scanner/update-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_id: blockId, current_code: currentCode, instruction }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to update prompt' }, { status: 500 })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
