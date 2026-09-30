import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { z } from 'zod'

const schema = z.object({ sourceUrl: z.string().url() })

function nameFromUrl(url: string): string {
  try {
    return `Clone de ${new URL(url).hostname}`
  } catch {
    return 'Novo projeto'
  }
}

export async function POST(req: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace()
    if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sourceUrl } = schema.parse(await req.json())

    const project = await db.project.create({
      data: {
        workspaceId: workspace.id,
        name: nameFromUrl(sourceUrl),
        sourceUrl,
        status: 'PENDING',
      },
    })

    return NextResponse.json(project)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'URL inválida' }, { status: 400 })
    }
    console.error('Create project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
