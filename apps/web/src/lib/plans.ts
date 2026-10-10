import { db, getConfig, setConfig } from '@funnelai/db'
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

let creditsMigrated = false
/**
 * Once: the paid plans used to have unlimited AI. Give them a monthly credit allowance (still editable in the admin) so one
 * account cannot burn the platform's AI budget. Only plans still on "unlimited" are touched, and the free plan only if it still has the old default.
 */
async function migrateAiCredits(rows: { id: string; key: string; limits: unknown }[]): Promise<boolean> {
  if (creditsMigrated) return false
  try {
    if (await getConfig('ai_credits_v1')) { creditsMigrated = true; return false }
    const target: Record<string, number> = { FREE: 30, BASIC: 300, PRO: 1000, SCALE: 3000 }
    for (const r of rows) {
      const want = target[r.key]
      if (want === undefined) continue
      const limits = (r.limits && typeof r.limits === 'object' ? r.limits : {}) as Record<string, unknown>
      const cur = limits.aiCalls
      if (cur === null || cur === undefined || (r.key === 'FREE' && cur === 20)) await db.planConfig.update({ where: { id: r.id }, data: { limits: { ...limits, aiCalls: want } as any } })
    }
    await setConfig('ai_credits_v1', '1', { label: 'Créditos de IA por plano (migração feita)', category: 'GENERAL', isSecret: false })
    creditsMigrated = true
    return true
  } catch { return false }
}

let domainCopyMigrated = false
/** Once: the pricing cards said "Domínios próprios (em breve)". The owner chose to drop "(em breve)", so the saved plan lines lose it too. */
async function migrateDomainCopy(rows: { id: string; benefits: unknown }[]): Promise<boolean> {
  if (domainCopyMigrated) return false
  try {
    if (await getConfig('plans_domain_copy_v1')) { domainCopyMigrated = true; return false }
    let touched = false
    for (const r of rows) {
      if (!Array.isArray(r.benefits)) continue
      const next = (r.benefits as any[]).map(b => (b && typeof b.text === 'string' ? { ...b, text: b.text.replace(/\s*\(em breve\)/i, '') } : b))
      if (JSON.stringify(next) !== JSON.stringify(r.benefits)) { await db.planConfig.update({ where: { id: r.id }, data: { benefits: next as any } }); touched = true }
    }
    await setConfig('plans_domain_copy_v1', '1', { label: 'Texto dos planos: domínio próprio sem "em breve" (migração feita)', category: 'GENERAL', isSecret: false })
    domainCopyMigrated = true
    return touched
  } catch { return false }
}

let storageMigrated = false
/** Once: paid plans had unlimited storage; videos are heavy, so each account gets its own allowance (editable in the admin). Only plans still unlimited are touched. */
async function migrateStorage(rows: { id: string; key: string; limits: unknown }[]): Promise<boolean> {
  if (storageMigrated) return false
  try {
    if (await getConfig('storage_limits_v1')) { storageMigrated = true; return false }
    const target: Record<string, number> = { BASIC: 5120, PRO: 15360, SCALE: 40960 }
    let touched = false
    for (const r of rows) {
      const want = target[r.key]
      if (want === undefined) continue
      const limits = (r.limits && typeof r.limits === 'object' ? r.limits : {}) as Record<string, unknown>
      if (limits.storageMb === null || limits.storageMb === undefined) { await db.planConfig.update({ where: { id: r.id }, data: { limits: { ...limits, storageMb: want } as any } }); touched = true }
    }
    await setConfig('storage_limits_v1', '1', { label: 'Armazenamento por plano (migração feita)', category: 'GENERAL', isSecret: false })
    storageMigrated = true
    return touched
  } catch { return false }
}

export async function listPlans(): Promise<PlanView[]> {
  if (cache && Date.now() - cache.at < 15_000) return cache.plans
  try {
    let rows = await db.planConfig.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    if (rows.length === 0 || !rows.some(r => r.key === 'UNLIMITED') || !rows.some(r => r.key === 'FREE')) {
      await seed()
      rows = await db.planConfig.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    }
    const changed = (await migrateAiCredits(rows)) || (await migrateDomainCopy(rows)) || (await migrateStorage(rows))
    if (changed) rows = await db.planConfig.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
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

/** Credits spent since a date. Older log lines have no credit count: each one counts as 1. */
async function aiCreditsUsed(workspaceId: string, since: Date): Promise<number> {
  const where = { workspaceId, operation: { in: AI_OPERATIONS }, createdAt: { gte: since } }
  const [sum, legacy] = await Promise.all([db.aiUsageLog.aggregate({ where, _sum: { creditsUsed: true } }), db.aiUsageLog.count({ where: { ...where, creditsUsed: 0 } })])
  return (sum._sum.creditsUsed ?? 0) + legacy
}

/** Extra credits (given by the administrator or bought) still unspent: they cover what goes past the month's plan allowance. */
async function bonusOf(workspaceId: string): Promise<number> {
  const w = await db.workspace.findUnique({ where: { id: workspaceId }, select: { bonusCredits: true } })
  return Math.max(0, w?.bonusCredits ?? 0)
}

/** What the account has spent this month, what its plan allows (null limit = unlimited) and its extra credits. */
export async function aiCreditsState(account: AccountPlanFields & { id: string }) {
  const [e, used, bonus] = await Promise.all([entitlementsOf(account), aiCreditsUsed(account.id, monthStart()), bonusOf(account.id)])
  const limit = e.limits.aiCalls ?? null
  return { used, limit, plan: e.plan.name, bonus, remaining: limit === null ? null : Math.max(0, limit - used) + bonus }
}

/**
 * Call right AFTER an AI turn was logged: the part of its cost that went past the month's plan allowance is taken from the
 * account's extra credits (never below zero). Inside the allowance nothing is taken, so extra credits are only spent once the plan runs out.
 */
export async function chargeBonusCredits(account: AccountPlanFields & { id: string }, credits: number): Promise<void> {
  if (credits <= 0) return
  const e = await entitlementsOf(account)
  const limit = e.limits.aiCalls
  if (limit === null || limit === undefined) return
  const used = await aiCreditsUsed(account.id, monthStart())
  const over = Math.min(credits, Math.max(0, used - limit))
  if (over <= 0) return
  await db.$executeRaw`UPDATE workspaces SET "bonusCredits" = GREATEST(0, "bonusCredits" - ${over}) WHERE id = ${account.id}`
}

export async function usageOf(workspaceId: string, opts: { storage?: boolean } = {}): Promise<Usage> {
  const since = monthStart()
  const [pages, domains, clones, aiCalls] = await Promise.all([
    db.project.count({ where: { workspaceId, status: 'PUBLISHED' } }),
    db.project.count({ where: { workspaceId, customDomain: { not: null } } }),
    db.project.count({ where: { workspaceId, createdAt: { gte: since } } }),
    aiCreditsUsed(workspaceId, since),
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
  // AI credits: once the plan's monthly allowance is spent, extra credits (if any) keep the account going
  if (used + extra > limit && key === 'aiCalls' && (await bonusOf(account.id)) > 0) return { ok: true }
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

