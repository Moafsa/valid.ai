import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { gate, gateResponse } from '@/lib/plans'
import { signVideoToken } from '@/lib/video-token'

const schema = z.object({ projectId: z.string().min(1).max(60), sizeBytes: z.number().int().min(0).max(2 * 1024 ** 3).optional() })

/** Hands the editor a signed token to upload a video directly to the scanner (big files do not go through this app). */
export async function POST(req: NextRequest) {
  const workspace = await getCurrentWorkspace()
  if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  if (!process.env.SCANNER_SHARED_SECRET) return NextResponse.json({ error: 'Envio de vídeo não configurado no servidor' }, { status: 500 })
  const project = await db.project.findFirst({ where: { id: parsed.data.projectId, workspaceId: workspace.id }, select: { id: true } })
  if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  const room = await gate(workspace, 'storageMb', Math.max(1, Math.ceil((parsed.data.sizeBytes ?? 0) / 1048576)))
  if (!room.ok) return NextResponse.json(gateResponse(room), { status: 403 })
  return NextResponse.json({
    token: signVideoToken(workspace.id, project.id),
    base: (process.env.SCANNER_PUBLIC_URL || 'https://api.be-vallid.com').replace(/\/$/, ''),
  })
}
