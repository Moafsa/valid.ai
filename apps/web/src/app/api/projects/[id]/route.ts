import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthUser()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const project = await db.project.findUnique({ where: { id } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    // Lead and AiUsageLog only carry a plain projectId column (no FK/cascade
    // in the schema) — clean those up explicitly. Page and ProjectTracking
    // cascade automatically via their onDelete: Cascade relation. ScanJob is
    // referenced FROM Project (project.scanJobId), not the other way round,
    // so deleting the project never touches it — remove it last by its
    // known id once the referencing project row is gone.
    await db.$transaction([
      db.lead.deleteMany({ where: { projectId: id } }),
      db.aiUsageLog.deleteMany({ where: { projectId: id } }),
      db.project.delete({ where: { id } }),
      ...(project.scanJobId ? [db.scanJob.deleteMany({ where: { id: project.scanJobId } })] : []),
    ])

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Delete project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
