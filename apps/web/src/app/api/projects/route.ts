import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

const createSchema = z.object({
  url: z.string().url(),
  name: z.string().min(2).max(80),
})

export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthUser()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { url, name } = createSchema.parse(body)

    // Create scan job first
    const jobId = uuidv4()
    const scanJob = await db.scanJob.create({
      data: {
        id: jobId,
        url,
        status: 'QUEUED',
        progress: 0,
        currentStep: 'Na fila...'
      }
    })

    // Get or create active workspace
    let workspace = await db.workspace.findFirst()
    if (!workspace) {
      workspace = await db.workspace.create({
        data: {
          clerkOrgId: 'dev_org',
          name: 'Dev Workspace',
          slug: 'dev-workspace',
          plan: 'FREE',
          aiCredits: 50,
        },
      })
    }

    // Create project
    const project = await db.project.create({
      data: {
        workspaceId: workspace.id,
        name,
        sourceUrl: url,
        type: 'LP', // Will be updated after scan
        status: 'SCANNING',
        scanJobId: scanJob.id,
      }
    })

    // Trigger the scanner service
    const scannerUrl = process.env.SCANNER_SERVICE_URL || 'http://localhost:8001'
    const scanRes = await fetch(`${scannerUrl}/api/scanner/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        project_id: project.id,
        job_id: scanJob.id,
        workspace_id: workspace.id,
      }),
    }).catch(() => null)

    if (!scanRes?.ok) {
      console.warn('Scanner service unavailable, project created but scan not started')
    }

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 })
    }
    console.error('Create project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  const { userId } = await getAuthUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projects = await db.project.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(projects)
}
