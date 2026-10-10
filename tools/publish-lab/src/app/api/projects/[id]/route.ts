import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { PublishError, publishProject } from '@/lib/publish'
import { z } from 'zod'

const patchSchema = z
  .object({ name: z.string().min(1).max(80).optional(), slug: z.string().min(1).max(60).optional() })
  .refine(data => data.name !== undefined || data.slug !== undefined, { message: 'Nothing to update' })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const workspace = await getCurrentWorkspace()
    if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { name, slug: rawSlug } = patchSchema.parse(await req.json())

    const project = await db.project.findFirst({ where: { id, workspaceId: workspace.id } })
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (name !== undefined) {
      await db.project.update({ where: { id }, data: { name: name.trim() } })
    }

    if (rawSlug !== undefined) {
      // choosing an address publishes: same code path as the Publicar button (see /publish)
      await publishProject(id, rawSlug)
    }

    const updated = await db.project.findUnique({ where: { id } })
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }
    if (error instanceof PublishError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Update project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
