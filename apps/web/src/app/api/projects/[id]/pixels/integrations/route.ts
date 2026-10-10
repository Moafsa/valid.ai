import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { INTEGRATIONS, readPixelSettings } from '@/lib/pixels'
import { forgetPixels, integrationInput, ownedProject } from '@/lib/pixels-server'

export const dynamic = 'force-dynamic'
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } })

/** Adds an integration (a pixel, an analytics id, a tag manager or a custom script) to the project. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const o = await ownedProject(id)
  if (!o) return json({ error: 'Not found' }, 404)
  if (!o.allowed) return json({ error: o.message, code: 'plan_feature' }, 403)
  const body = await req.json().catch(() => ({}))
  const made = integrationInput(String(body?.type || ''), body, readPixelSettings(o.project.pixelSettings).events)
  if ('error' in made) return json({ error: made.error }, 400)
  if (made.pixelId) {
    const dup = await db.projectTracking.findFirst({ where: { projectId: id, type: made.type, pixelId: made.pixelId }, select: { id: true } })
    if (dup) return json({ error: `Esse ${INTEGRATIONS[made.type].label} já está nesta página.` }, 409)
  }
  if ((await db.projectTracking.count({ where: { projectId: id } })) >= 12) return json({ error: 'Máximo de 12 integrações por página.' }, 400)
  const row = await db.projectTracking.create({ data: { projectId: id, type: made.type, pixelId: made.pixelId, config: made.config as any, isActive: true } })
  forgetPixels(id)
  return json({ ok: true, id: row.id })
}
