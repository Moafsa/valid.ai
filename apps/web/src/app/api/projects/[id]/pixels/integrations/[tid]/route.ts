import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { CUSTOM_CODE_MAX, INTEGRATIONS, readTrackingConfig, validPixelId, type Integration } from '@/lib/pixels'
import { forgetPixels, ownedProject } from '@/lib/pixels-server'

export const dynamic = 'force-dynamic'
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } })

/** Turns an integration on or off, changes its id, its name, its script or which events go to it. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; tid: string }> }) {
  const { id, tid } = await params
  const o = await ownedProject(id)
  if (!o) return json({ error: 'Not found' }, 404)
  if (!o.allowed) return json({ error: o.message, code: 'plan_feature' }, 403)
  const row = await db.projectTracking.findFirst({ where: { id: tid, projectId: id } })
  if (!row) return json({ error: 'Not found' }, 404)
  const body = await req.json().catch(() => ({}))
  const type = row.type as Integration
  const cfg = readTrackingConfig(row.config)
  const data: Record<string, unknown> = {}
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive
  if (typeof body.pixelId === 'string' && type !== 'CUSTOM') {
    const v = body.pixelId.trim().slice(0, 40)
    if (!validPixelId(type, v)) return json({ error: `O ID não parece certo para ${INTEGRATIONS[type].label}. Exemplo: ${INTEGRATIONS[type].placeholder}` }, 400)
    data.pixelId = type === 'GOOGLE_ANALYTICS' || type === 'GOOGLE_TAG' || type === 'GTM' ? v.toUpperCase() : v
  }
  const next = { ...cfg }
  if (typeof body.label === 'string') next.label = body.label.trim().slice(0, 60) || undefined
  if (typeof body.code === 'string' && type === 'CUSTOM') {
    if (body.code.trim().length < 5 || body.code.length > CUSTOM_CODE_MAX) return json({ error: 'Cole o código do script (até 20 mil caracteres).' }, 400)
    next.code = body.code
  }
  if (body.map && typeof body.map === 'object') next.map = readTrackingConfig({ map: body.map }).map
  data.config = next as any
  await db.projectTracking.update({ where: { id: tid }, data })
  forgetPixels(id)
  return json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; tid: string }> }) {
  const { id, tid } = await params
  const o = await ownedProject(id)
  if (!o) return json({ error: 'Not found' }, 404)
  await db.projectTracking.deleteMany({ where: { id: tid, projectId: id } })
  forgetPixels(id)
  return json({ ok: true })
}
