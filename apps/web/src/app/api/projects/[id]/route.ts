import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const workspace = await getCurrentWorkspace()
  if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  // Scoped to the caller's own workspace — deleting a project id that
  // belongs to someone else's workspace matches nothing and no-ops,
  // rather than trusting the id alone.
  const deleted = await db.project.deleteMany({ where: { id, workspaceId: workspace.id } })
  if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
