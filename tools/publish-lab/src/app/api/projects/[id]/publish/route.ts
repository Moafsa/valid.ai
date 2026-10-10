import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { PublishError, hasUnpublishedChanges, publishProject, unpublishProject } from '@/lib/publish'
import { z } from 'zod'

const schema = z.object({ slug: z.string().min(1).max(60).optional() })

async function owned(id: string) {
  const workspace = await getCurrentWorkspace()
  if (!workspace) return null
  return db.project.findFirst({ where: { id, workspaceId: workspace.id } })
}

/** State of the public site: where it lives, when it was published and whether the editor is ahead of it. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await owned(id)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    published: project.status === 'PUBLISHED',
    slug: project.slug,
    publishedAt: project.publishedAt,
    unpublishedChanges: await hasUnpublishedChanges(id),
  })
}

/**
 * Publicar: freezes what the editor has saved right now as the public version of the site.
 * Clicking it again replaces the public version with the new one.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const project = await owned(id)
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { slug } = schema.parse(await req.json().catch(() => ({})))
    const result = await publishProject(id, slug)
    return NextResponse.json({ ok: true, ...result, url: `/s/${result.slug}` })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    if (error instanceof PublishError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Publish error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Tirar do ar: the address answers 404 again; the project and its editor pages stay as they are. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await owned(id)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await unpublishProject(id)
  return NextResponse.json({ ok: true })
}
