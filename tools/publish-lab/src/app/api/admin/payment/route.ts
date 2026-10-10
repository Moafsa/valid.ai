import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { currentAdmin } from '@/lib/admin'
import { getPlan } from '@/lib/plans'
import { assignPlan } from '@/lib/plans-admin'

const schema = z.object({
  workspaceId: z.string(), value: z.number().positive().max(1_000_000), billingType: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD', 'MANUAL']).default('PIX'),
  description: z.string().max(200).optional(), plan: z.string().min(1).max(40).optional(), days: z.number().int().min(1).max(366).default(30), credits: z.number().int().min(0).max(1_000_000).optional(),
})

/** The administrator records a payment received outside the system (a Pix, a transfer), so it shows up as paid; optionally sets the plan and gives credits. */
export async function POST(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const b = schema.parse(await req.json())
    const w = await db.workspace.findUnique({ where: { id: b.workspaceId } })
    if (!w) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
    await db.asaasPayment.create({ data: { workspaceId: w.id, asaasPaymentId: `manual_${randomBytes(8).toString('hex')}`, billingType: b.billingType, value: b.value, status: 'CONFIRMED', description: b.description || 'Pagamento registrado pelo administrador' } })
    // a payment keeps a paid plan paid for another period, counted from the due date when it is still ahead
    const target = await getPlan(b.plan || w.planKey)
    if (b.plan && b.plan !== w.planKey && !target.active) return NextResponse.json({ error: 'Esse plano está desativado.' }, { status: 409 })
    if (target.priceCents > 0) {
      const base = w.subscriptionStatus === 'active' && w.planUntil && w.planUntil.getTime() > Date.now() && target.key === w.planKey ? w.planUntil.getTime() : Date.now()
      await assignPlan(w.id, { planKey: target.key, status: 'active', until: new Date(base + b.days * 86400_000) })
    } else if (b.plan) {
      await assignPlan(w.id, { planKey: target.key })
    }
    if (b.credits) {
      const after = w.aiCredits + b.credits
      await db.workspace.update({ where: { id: w.id }, data: { aiCredits: after } })
      await db.creditTransaction.create({ data: { workspaceId: w.id, type: 'PURCHASE', amount: b.credits, balanceAfter: after, description: b.description || 'Compra registrada pelo administrador', operation: 'admin_payment' } })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }
}
