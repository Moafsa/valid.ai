import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { normalizeSlug } from '@/lib/utils'
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
      // Publishing: picking a domain is only meaningful once there's
      // something real to show at it.
      if (!['READY', 'PUBLISHED'].includes(project.status)) {
        return NextResponse.json({ error: 'Publique depois que a clonagem terminar' }, { status: 400 })
      }
      const slug = normalizeSlug(rawSlug)
      if (!slug) return NextResponse.json({ error: 'Domínio inválido' }, { status: 400 })

      const taken = await db.project.findFirst({ where: { slug, NOT: { id } } })
      if (taken) return NextResponse.json({ error: 'Esse domínio já está em uso, escolha outro' }, { status: 409 })

      await db.project.update({ where: { id }, data: { slug, status: 'PUBLISHED' } })
    }

    const updated = await db.project.findUnique({ where: { id } })
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }
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
