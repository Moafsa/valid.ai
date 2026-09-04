import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const token = req.headers.get('x-internal-token')
  if (token !== process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { aiCredits: true },
  })
  return NextResponse.json({ balance: workspace?.aiCredits ?? 0 })
}
