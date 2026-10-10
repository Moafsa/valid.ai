import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { currentAdmin } from '@/lib/admin'
import { assignPlan } from '@/lib/plans-admin'
import { getPlan } from '@/lib/plans'

const schema = z.object({
  id: z.string(),
  /** a plan key (BASIC, PRO, UNLIMITED, or any plan created in the panel) */
  planKey: z.string().min(1).max(40).optional(),
  subscriptionStatus: z.enum(['none', 'active', 'past_due', 'canceled']).optional(),
  /** paid through (YYYY-MM-DD); empty = no expiry */
  planUntil: z.string().max(10).nullable().optional(),
  addCredits: z.number().int().min(-100000).max(100000).optional(),
})

/** The administrator changes a customer's plan and subscription, or gives (or takes) credits; every credit change is written to the ledger. */
export async function POST(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const b = schema.parse(await req.json())
    const w = await db.workspace.findUnique({ where: { id: b.id } })
    if (!w) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const until = b.planUntil === undefined ? undefined : b.planUntil ? new Date(`${b.planUntil}T23:59:59`) : null
    if (until instanceof Date && Number.isNaN(until.getTime())) return NextResponse.json({ error: 'Data inválida' }, { status: 400 })
    if (b.planKey && b.planKey !== w.planKey && !(await getPlan(b.planKey)).active) return NextResponse.json({ error: 'Esse plano está desativado: reative em Planos para colocar alguém nele.' }, { status: 409 })
    if (b.planKey) {
      await assignPlan(w.id, { planKey: b.planKey, status: b.subscriptionStatus, until: until === undefined ? (b.planKey === w.planKey ? w.planUntil : null) : until })
    } else if (b.subscriptionStatus !== undefined || until !== undefined) {
      await db.workspace.update({ where: { id: w.id }, data: { ...(b.subscriptionStatus !== undefined ? { subscriptionStatus: b.subscriptionStatus } : {}), ...(until !== undefined ? { planUntil: until } : {}) } })
    }
    if (b.addCredits) {
      const after = Math.max(0, w.aiCredits + b.addCredits)
      await db.workspace.update({ where: { id: w.id }, data: { aiCredits: after } })
      await db.creditTransaction.create({ data: { workspaceId: w.id, type: b.addCredits > 0 ? 'GRANT' : 'CONSUME', amount: b.addCredits, balanceAfter: after, description: 'Ajuste feito pelo administrador', operation: 'admin_adjust' } })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.message === 'plan_not_found') return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 })
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }
}
