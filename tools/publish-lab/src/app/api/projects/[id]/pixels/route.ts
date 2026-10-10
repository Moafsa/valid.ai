import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { readPixelSettings, readTrackingConfig } from '@/lib/pixels'
import { detectProject, ownedProject, pixelOverview, savePixelSettings } from '@/lib/pixels-server'

export const dynamic = 'force-dynamic'
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } })

/** Everything the Pixels tab shows: settings, integrations, what the pages contain, what the pixels really did. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const o = await ownedProject(id)
  if (!o) return json({ error: 'Not found' }, 404)
  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 30))
  const [rows, detected, overview] = await Promise.all([
    db.projectTracking.findMany({ where: { projectId: id }, orderBy: { createdAt: 'asc' } }),
    detectProject(id),
    pixelOverview(id, days),
  ])
  return json({
    allowed: o.allowed, message: o.message, published: o.project.status === 'PUBLISHED', slug: o.project.slug,
    settings: readPixelSettings(o.project.pixelSettings),
    integrations: rows.map(r => ({ id: r.id, type: r.type, pixelId: r.pixelId, isActive: r.isActive, config: { ...readTrackingConfig(r.config), code: undefined, hasCode: !!readTrackingConfig(r.config).code } })),
    detected, overview,
  })
}

const eventSchema = z.object({
  id: z.string().max(16), kind: z.string().max(12), name: z.string().max(60), on: z.boolean(),
  trigger: z.object({ type: z.string().max(12), match: z.string().max(120).optional() }),
  value: z.number().nullable().optional(), valueParam: z.string().max(40).optional(), goal: z.boolean().optional(),
})
const putSchema = z.object({
  consent: z.object({ required: z.boolean(), respectDnt: z.boolean(), text: z.string().max(240) }),
  currency: z.string().max(3).optional(),
  events: z.array(eventSchema).max(30),
})

/** Saves the events the project tracks and the privacy settings. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const o = await ownedProject(id)
  if (!o) return json({ error: 'Not found' }, 404)
  if (!o.allowed) return json({ error: o.message, code: 'plan_feature' }, 403)
  try {
    const body = putSchema.parse(await req.json())
    const settings = await savePixelSettings(id, body)
    return json({ ok: true, settings })
  } catch (e) {
    if (e instanceof z.ZodError) return json({ error: 'Confira os campos.' }, 400)
    console.error('save pixel settings', e)
    return json({ error: 'Não consegui salvar agora.' }, 500)
  }
}
