import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { getAuthUser, getCurrentWorkspace } from '@/lib/auth-helper'

const schema = z.object({
  kind: z.enum(['site_not_cloning', 'clone_error', 'bug', 'idea', 'praise', 'other']).default('other'),
  siteUrl: z.string().max(500).optional(),
  projectId: z.string().max(40).optional(),
  message: z.string().min(3, 'Escreva um pouco mais para eu entender').max(4000),
  context: z.record(z.string(), z.union([z.string().max(300), z.number()])).optional(),
})

/** A message from a user to the administrator: a site that did not clone right, an error, an idea. */
export async function POST(req: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace()
    if (!workspace) return NextResponse.json({ error: 'Faça login de novo para enviar.' }, { status: 401 })
    const body = schema.parse(await req.json())
    // a brake against floods: ten messages an hour
    const recent = await db.feedback.count({ where: { workspaceId: workspace.id, createdAt: { gte: new Date(Date.now() - 3600_000) } } })
    if (recent >= 10) return NextResponse.json({ error: 'Muitas mensagens seguidas. Tente de novo daqui a pouco.' }, { status: 429 })
    const { userId } = await getAuthUser()
    let projectId: string | null = null
    if (body.projectId) projectId = (await db.project.findFirst({ where: { id: body.projectId, workspaceId: workspace.id }, select: { id: true } }))?.id ?? null
    const fb = await db.feedback.create({
      data: { workspaceId: workspace.id, clerkUserId: userId, kind: body.kind, siteUrl: body.siteUrl?.trim() || null, projectId, message: body.message.trim(), context: (body.context as any) ?? undefined },
    })
    return NextResponse.json({ ok: true, id: fb.id })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0]?.message || 'Dados inválidos' }, { status: 400 })
    console.error('feedback error', e)
    return NextResponse.json({ error: 'Não consegui enviar agora.' }, { status: 500 })
  }
}
