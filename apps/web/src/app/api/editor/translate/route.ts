import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthUser()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, targetCountry } = await req.json()
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { pages: true },
    })

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const scannerUrl = process.env.SCANNER_SERVICE_URL || 'http://localhost:8001'

    // Call scanner service to translate all blocks in parallel
    const res = await fetch(`${scannerUrl}/api/scanner/translate-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, target_country: targetCountry }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Translation failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
