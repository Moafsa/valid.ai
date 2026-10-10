import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { currentAdmin } from '@/lib/admin'
import { cleanFeatures, cleanLimits, invalidatePlans, planInput } from '@/lib/plans-admin'
import { FEATURE_KEYS, LIMIT_KEYS } from '@/lib/plans'

export const dynamic = 'force-dynamic'

/** The administrator edits a plan. The accounts on it get the new limits right away. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const { id } = await params
    const plan = await db.planConfig.findUnique({ where: { id } })
    if (!plan) return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 })
    const b = planInput.parse(await req.json())
    // the unlimited plan stays unlimited with everything on; the free plan is the floor a lapsed account falls to: it must stay available and free
    const unlimited = plan.key === 'UNLIMITED'
    const free = plan.key === 'FREE'
    const limits = unlimited ? Object.fromEntries(LIMIT_KEYS.map(k => [k, null])) : cleanLimits(b.limits)
    const features = unlimited ? Object.fromEntries(FEATURE_KEYS.map(k => [k, true])) : cleanFeatures(b.features)
    const highlight = unlimited || free ? false : b.highlight
    if (highlight && !plan.highlight) await db.planConfig.updateMany({ where: { NOT: { id } }, data: { highlight: false } })     // only one plan is the recommended one
    await db.planConfig.update({
      where: { id },
      data: {
        name: b.name, description: b.description, priceCents: unlimited || free ? 0 : b.priceCents, interval: b.interval, active: unlimited || free ? true : b.active,
        visible: unlimited ? false : b.visible, highlight, ctaLabel: b.ctaLabel, sortOrder: b.sortOrder, benefits: b.benefits.map(text => ({ text })), limits: limits as any, features: features as any,
      },
    })
    invalidatePlans()
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Confira os campos do plano.' }, { status: 400 })
    console.error('edit plan', e)
    return NextResponse.json({ error: 'Não consegui salvar o plano.' }, { status: 500 })
  }
}

/** Only a plan nobody is on can be removed (and never a built-in one): otherwise the plan is deactivated instead. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params
  const plan = await db.planConfig.findUnique({ where: { id } })
  if (!plan) return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 })
  if (plan.isSystem) return NextResponse.json({ error: 'Os planos Gratuito e Ilimitado fazem parte do sistema e não podem ser apagados.' }, { status: 409 })
  const users = await db.workspace.count({ where: { planKey: plan.key } })
  if (users > 0) return NextResponse.json({ error: `${users} ${users === 1 ? 'conta está' : 'contas estão'} nesse plano. Desative o plano em vez de apagar: quem já tem continua com ele.` }, { status: 409 })
  await db.planConfig.delete({ where: { id } })
  invalidatePlans()
  return NextResponse.json({ ok: true })
}
