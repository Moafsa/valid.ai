import { db } from '@funnelai/db'
import {
  AI_OPERATIONS, DEFAULT_PLANS, FEATURE_DEFS, limitMessage, stateOf, toView,
  type AccountPlanFields, type Entitlements, type FeatureKey, type Gate, type LimitKey, type PlanView,
} from './plans-shared'

/**
 * Plans, limits and what an account may do (server side: reads the database).
 *
 * A plan is a row of `plan_configs` the administrator edits (price, benefits, limits, features). An account points at one
 * through `workspaces.planKey`. What an account really gets (`entitlementsOf`) also depends on its subscription: a paid plan
 * only counts while it is paid (a few days of grace after the due date); after that the account falls back to the free plan's
 * limits, and nothing that already exists is deleted. The pure parts (types, texts, the subscription rules) live in plans-shared.ts.
 */
export * from './plans-shared'

let cache: { at: number; plans: PlanView[] } | null = null
export const clearPlanCache = () => { cache = null }

/** Writes the built-in plans the first time (and any built-in one that was lost). Never touches a plan that exists. */
async function seed(): Promise<void> {
  const have = new Set((await db.planConfig.findMany({ select: { key: true } })).map(p => p.key))
  for (const p of DEFAULT_PLANS) {
    if (have.has(p.key)) continue
    await db.planConfig.create({ data: { key: p.key, name: p.name, description: p.description, priceCents: p.priceCents, interval: p.interval, active: p.active, visible: p.visible, highlight: p.highlight, ctaLabel: p.ctaLabel, sortOrder: p.sortOrder, benefits: p.benefits.map(text => ({ text })), limits: p.limits as any, features: p.features as any, isSystem: p.isSystem } }).catch(() => {})
  }
}

export async function listPlans(): Promise<PlanView[]> {
  if (cache && Date.now() - cache.at < 15_000) return cache.plans
  try {
    let rows = await db.planConfig.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    if (rows.length === 0 || !rows.some(r => r.key === 'UNLIMITED') || !rows.some(r => r.key === 'FREE')) {
      await seed()
      rows = await db.planConfig.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    }
    cache = { at: Date.now(), plans: rows.map(toView) }
    return cache.plans
  } catch {
    return DEFAULT_PLANS.map(p => ({ ...p, id: p.key }))
  }
}

export async function getPlan(key: string | null | undefined): Promise<PlanView> {
  const all = await listPlans()
  return all.find(p => p.key === key) ?? all.find(p => p.key === 'FREE') ?? { ...DEFAULT_PLANS[0], id: 'FREE' }
}

/** The plans shown on the public pricing page: visible and active, cheapest first. */
export async function publicPlans(): Promise<PlanView[]> {
  return (await listPlans()).filter(p => p.visible && p.active).sort((a, b) => a.priceCents - b.priceCents || a.sortOrder - b.sortOrder)
}

export async function entitlementsOf(account: AccountPlanFields): Promise<Entitlements> {
  const plan = await getPlan(account.planKey)
  const { state, message } = stateOf(plan, account)
  const effective = state === 'lapsed' ? await getPlan('FREE') : plan
  return { plan, effective, state, message, limits: effective.limits, features: effective.features }
}

/* ───────── usage and gates ───────── */

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) }

export interface Usage { pages: number; domains: number; clones: number; aiCalls: number; storageMb: number }

/** Re-measures a project's stored size when it is older than this (the scanner lists the bucket). */
const STORAGE_FRESH_MS = 6 * 3600_000

async function refreshStorage(workspaceId: string): Promise<number> {
  const projects = await db.project.findMany({ where: { workspaceId }, select: { id: true, storageKb: true, storageAt: true } })
  const stale = projects.filter(p => !p.storageAt || Date.now() - p.storageAt.getTime() > STORAGE_FRESH_MS).slice(0, 12)
  const scanner = process.env.SCANNER_SERVICE_URL ?? 'http://scanner:8001'
  const sizes = new Map<string, number>()
  for (let i = 0; i < stale.length; i += 4) {
    await Promise.all(stale.slice(i, i + 4).map(async p => {
      try {
        const res = await fetch(`${scanner}/api/storage/${p.id}`, { headers: { 'x-scanner-secret': process.env.SCANNER_SHARED_SECRET || '' }, signal: AbortSignal.timeout(6000), cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json()
        const kb = Math.ceil(Number(j.bytes || 0) / 1024)
        sizes.set(p.id, kb)
        await db.project.update({ where: { id: p.id }, data: { storageKb: kb, storageAt: new Date() } })
      } catch { /* the bucket being slow must never break a page: the last measurement is used */ }
    }))
  }
  return projects.reduce((t, p) => t + (sizes.get(p.id) ?? p.storageKb ?? 0), 0)
}

export async function usageOf(workspaceId: string, opts: { storage?: boolean } = {}): Promise<Usage> {
  const since = monthStart()
  const [pages, domains, clones, aiCalls] = await Promise.all([
    db.project.count({ where: { workspaceId, status: 'PUBLISHED' } }),
    db.project.count({ where: { workspaceId, customDomain: { not: null } } }),
    db.project.count({ where: { workspaceId, createdAt: { gte: since } } }),
    db.aiUsageLog.count({ where: { workspaceId, operation: { in: AI_OPERATIONS }, createdAt: { gte: since } } }),
  ])
  const kb = opts.storage === false ? 0 : await refreshStorage(workspaceId).catch(() => 0)
  return { pages, domains, clones, aiCalls, storageMb: Math.round((kb / 1024) * 10) / 10 }
}

/** Can this account add one more of `key`? (`extra` = how many it wants to add, default 1.) */
export async function gate(account: AccountPlanFields & { id: string }, key: LimitKey, extra = 1): Promise<Gate> {
  const e = await entitlementsOf(account)
  const limit = e.limits[key]
  if (limit === null || limit === undefined) return { ok: true }
  const u = await usageOf(account.id, { storage: key === 'storageMb' })
  const used = u[key]
  if (used + extra > limit) return { ok: false, code: 'plan_limit', message: limitMessage(key, e.plan, limit, used, e.state === 'lapsed'), limit, used }
  return { ok: true }
}

export async function featureGate(account: AccountPlanFields, key: FeatureKey): Promise<Gate> {
  const e = await entitlementsOf(account)
  if (e.features[key]) return { ok: true }
  const where = e.state === 'lapsed' ? `plano atual (${e.plan.name}, vencido)` : `plano ${e.plan.name}`
  return { ok: false, code: 'plan_feature', message: `${FEATURE_DEFS[key].label} não está incluído no seu ${where}. Mude de plano para usar.`, limit: null, used: 0 }
}

export async function hasFeature(account: AccountPlanFields, key: FeatureKey): Promise<boolean> {
  return (await entitlementsOf(account)).features[key]
}

