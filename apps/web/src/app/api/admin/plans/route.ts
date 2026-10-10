import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { currentAdmin } from '@/lib/admin'
import { cleanFeatures, cleanLimits, invalidatePlans, newKey, planInput } from '@/lib/plans-admin'
import { listPlans } from '@/lib/plans'

export const dynamic = 'force-dynamic'

/** The administrator creates a plan. */
export async function POST(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const b = planInput.parse(await req.json())
    await listPlans()                                      // makes sure the built-in plans exist before anything is added next to them
    const key = await newKey(b.name)
    if (b.highlight) await db.planConfig.updateMany({ data: { highlight: false } })
    const row = await db.planConfig.create({
      data: { key, name: b.name, description: b.description, priceCents: b.priceCents, interval: b.interval, active: b.active, visible: b.visible, highlight: b.highlight, ctaLabel: b.ctaLabel, sortOrder: b.sortOrder, benefits: b.benefits.map(text => ({ text })), limits: cleanLimits(b.limits) as any, features: cleanFeatures(b.features) as any, isSystem: false },
    })
    invalidatePlans()
    return NextResponse.json({ ok: true, id: row.id, key })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Confira os campos do plano.' }, { status: 400 })
    console.error('create plan', e)
    return NextResponse.json({ error: 'Não consegui criar o plano.' }, { status: 500 })
  }
}
