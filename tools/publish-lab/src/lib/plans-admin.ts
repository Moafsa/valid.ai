import { z } from 'zod'
import { db } from '@funnelai/db'
import { FEATURE_KEYS, LIMIT_KEYS, clearPlanCache, getPlan, type Features, type Limits } from '@/lib/plans'

const limitValue = z.union([z.number().int().min(0).max(100_000_000), z.null()])

export const planInput = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(160).optional().default(''),
  priceCents: z.number().int().min(0).max(100_000_00),
  interval: z.enum(['month', 'year']).default('month'),
  active: z.boolean().default(true),
  visible: z.boolean().default(true),
  highlight: z.boolean().default(false),
  ctaLabel: z.string().trim().max(40).optional().default(''),
  sortOrder: z.number().int().min(0).max(999).default(50),
  benefits: z.array(z.string().trim().min(1).max(120)).max(14).default([]),
  limits: z.record(limitValue).default({}),
  features: z.record(z.boolean()).default({}),
})
export type PlanInput = z.infer<typeof planInput>

/** A stable key from the name ("Plano Especial" -> PLANO_ESPECIAL), made unique with a number when taken. */
export async function newKey(name: string): Promise<string> {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'PLANO'
  for (let i = 0; i < 50; i++) {
    const key = i === 0 ? base : `${base}_${i + 1}`
    if (!(await db.planConfig.findUnique({ where: { key }, select: { id: true } }))) return key
  }
  return `${base}_${Date.now()}`
}

/** Only the known limits and features are kept; a limit that is not a number is unlimited. */
export function cleanLimits(raw: Record<string, number | null | undefined>): Limits {
  const out = {} as Limits
  for (const k of LIMIT_KEYS) out[k] = raw[k] === undefined || raw[k] === null ? null : Number(raw[k])
  return out
}
export function cleanFeatures(raw: Record<string, boolean | undefined>): Features {
  const out = {} as Features
  for (const k of FEATURE_KEYS) out[k] = raw[k] === true
  return out
}

/** Puts an account on a plan and sets the state of its subscription, keeping the old enum column in step for the built-in plans. */
export async function assignPlan(workspaceId: string, opts: { planKey: string; status?: 'none' | 'active' | 'past_due' | 'canceled'; until?: Date | null }) {
  const plan = await getPlan(opts.planKey)
  if (plan.key !== opts.planKey) throw new Error('plan_not_found')
  const paid = plan.priceCents > 0
  const status = opts.status ?? (paid ? 'active' : plan.key === 'UNLIMITED' ? 'active' : 'none')
  const legacy = (['FREE', 'BASIC', 'PRO', 'SCALE'] as const).find(k => k === plan.key)
  await db.workspace.update({
    where: { id: workspaceId },
    data: { planKey: plan.key, subscriptionStatus: status, planUntil: opts.until === undefined ? null : opts.until, ...(legacy ? { plan: legacy } : {}) },
  })
  return plan
}

export const invalidatePlans = clearPlanCache
