import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { z } from 'zod'

const schema = z.object({ projectId: z.string(), url: z.string().url() })

export async function POST(req: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace()
    if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, url } = schema.parse(await req.json())

    const project = await db.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const scanJob = await db.scanJob.create({ data: { url, status: 'QUEUED' } })
    await db.project.update({
      where: { id: projectId },
      data: { status: 'SCANNING', scanJobId: scanJob.id },
    })

    const scannerUrl = process.env.SCANNER_SERVICE_URL ?? 'http://scanner:8001'
    const res = await fetch(`${scannerUrl}/api/scanner/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: scanJob.id, project_id: projectId, url, workspace_id: workspace.id }),
    })
    if (!res.ok) {
      await db.project.update({ where: { id: projectId }, data: { status: 'ERROR' } })
      return NextResponse.json({ error: 'Falha ao iniciar o scanner' }, { status: 502 })
    }

    return NextResponse.json({ jobId: scanJob.id })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 })
    }
    console.error('Start scan error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
