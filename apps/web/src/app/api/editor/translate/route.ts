import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { z } from 'zod'

const schema = z.object({
  projectId: z.string(),
  targetCountry: z.string(),
})

/**
 * Translates a project into a new, separate project rather than overwriting
 * the original — the source keeps its own content, and you end up with one
 * project per locale (matching "pegue o funil em PT e gere em ES/EN").
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthUser()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, targetCountry } = schema.parse(await req.json())

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { pages: { orderBy: { order: 'asc' } } },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (project.pages.length === 0) {
      return NextResponse.json({ error: 'Projeto ainda não tem páginas geradas' }, { status: 400 })
    }

    const scannerUrl = process.env.SCANNER_SERVICE_URL || 'http://localhost:8001'
    const res = await fetch(`${scannerUrl}/api/scanner/translate-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_country: targetCountry,
        pages: project.pages.map(p => ({
          name: p.name,
          slug: p.slug,
          order: p.order,
          blocks: p.blocks,
        })),
      }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Falha na tradução' }, { status: 502 })
    }

    const { pages: translatedPages } = (await res.json()) as {
      pages: { name: string; slug: string; order: number; blocks: any[] }[]
    }

    const newProject = await db.project.create({
      data: {
        workspaceId: project.workspaceId,
        name: `${project.name} (${targetCountry})`,
        sourceUrl: project.sourceUrl,
        type: project.type,
        status: 'READY',
        pages: {
          create: translatedPages.map(p => ({
            name: p.name,
            slug: p.slug,
            order: p.order,
            blocks: p.blocks,
          })),
        },
      },
    })

    return NextResponse.json({ success: true, projectId: newProject.id })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 })
    }
    console.error('Translate project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
