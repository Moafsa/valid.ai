import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'

export const dynamic = 'force-dynamic'

/**
 * Where a clone stands, read from the database. The live progress stream is
 * the nice way to follow a scan; this is the one that cannot be fooled by a
 * proxy holding the stream back: the scanner saves the finished clone itself,
 * so the project turns READY (or ERROR) here whatever the browser saw.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const workspace = await getCurrentWorkspace()
  if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId } = await params
  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId: workspace.id },
    select: { status: true, scanJobId: true },
  })
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const job = project.scanJobId
    ? await db.scanJob.findUnique({ where: { id: project.scanJobId }, select: { status: true, errorMsg: true } })
    : null
  return NextResponse.json({ status: project.status, jobStatus: job?.status ?? null, error: job?.errorMsg ?? null })
}
