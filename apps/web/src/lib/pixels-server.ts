import { db } from '@funnelai/db'
import { CHECKOUT_RE, forgetProject, readSettings, type Goal } from '@/lib/analytics/goals'
import { tooBusy } from '@/lib/analytics/ingest'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { entitlementsOf, featureGate } from '@/lib/plans'
import {
  CUSTOM_CODE_MAX, INTEGRATIONS, INTEGRATION_KEYS, STATE_RANK, defaultMap, readPixelSettings, readTrackingConfig, validPixelId,
  type Integration, type PixelRuntimeConfig, type PixelSettings, type PixelState, type RuntimeIntegration,
} from '@/lib/pixels'

/* ───────── what a published page is handed ───────── */

interface Built { exp: number; config: PixelRuntimeConfig | null }
const cache = new Map<string, Built>()
export const forgetPixels = (projectId: string) => cache.delete(projectId)

/**
 * The pixels of a project, ready for the runtime: only the integrations that are on, with a valid id, and only when the plan includes them.
 * Cached for a few seconds (every visit of a public page asks).
 */
export async function pixelConfigFor(projectId: string): Promise<PixelRuntimeConfig | null> {
  const hit = cache.get(projectId)
  if (hit && hit.exp > Date.now()) return hit.config
  let config: PixelRuntimeConfig | null = null
  try {
    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, pixelSettings: true, workspace: { select: { id: true, planKey: true, subscriptionStatus: true, planUntil: true } } } })
    if (project && (await entitlementsOf(project.workspace)).features.pixels) {
      const settings = readPixelSettings(project.pixelSettings)
      const rows = await db.projectTracking.findMany({ where: { projectId, isActive: true }, orderBy: { createdAt: 'asc' } })
      const events = settings.events.filter(e => e.on)
      const integrations: RuntimeIntegration[] = []
      for (const r of rows) {
        const type = r.type as Integration
        if (!INTEGRATION_KEYS.includes(type)) continue
        const cfg = readTrackingConfig(r.config)
        if (type === 'CUSTOM') {
          if (!cfg.code || !cfg.code.trim()) continue
          integrations.push({ id: r.id, type, pixelId: cfg.label || 'script', map: Object.keys(cfg.map).length ? cfg.map : defaultMap(type, settings.events), code: cfg.code })
        } else {
          if (!r.pixelId || !validPixelId(type, r.pixelId)) continue
          integrations.push({ id: r.id, type, pixelId: r.pixelId.trim(), map: Object.keys(cfg.map).length ? cfg.map : defaultMap(type, settings.events) })
        }
      }
      if (integrations.length) {
        config = {
          v: 1, p: projectId, consent: settings.consent, currency: settings.currency,
          events: events.map(e => ({ id: e.id, kind: e.kind, name: e.name, trigger: e.trigger, value: e.value ?? null, ...(e.valueParam ? { valueParam: e.valueParam } : {}) })),
          integrations,
        }
      }
    }
  } catch (e) {
    console.error('pixel config', e)          // a pixel problem must never reach the page
  }
  cache.set(projectId, { exp: Date.now() + 20_000, config })
  if (cache.size > 500) cache.clear()
  return config
}

/**
 * What is handed to THIS visitor. Integrations that run code their owner controls (a tag manager, a custom script) are left out for a
 * person who is signed in to this platform (a customer or the administrator): that code would run on the same address as the panel.
 */
export function runtimeForViewer(config: PixelRuntimeConfig | null, cookieHeader: string | null | undefined): PixelRuntimeConfig | null {
  if (!config) return null
  const c = cookieHeader || ''
  const signedIn = /(?:^|;\s*)vai_admin=/.test(c) || /(?:^|;\s*)__session=/.test(c) || /(?:^|;\s*)__client_uat=(?!0(?:;|$))\d+/.test(c)
  if (!signedIn) return config
  const integrations = config.integrations.filter(i => !INTEGRATIONS[i.type].risky)
  return integrations.length ? { ...config, integrations } : null
}

/* ───────── what the pages contain (the events that could be tracked) ───────── */

export interface Detected {
  pages: { slug: string; name: string }[]
  forms: number
  formPages: string[]
  ctas: number
  checkoutLinks: number
  checkoutHosts: string[]
  videos: number
  thanks: { slug: string; name: string }[]
}

const THANKS_RE = /obrigad|thank|sucesso|success|confirm|parab|conclu|pedido|compra|order|welcome|bem-vind/i

/** Reads the project's pages and says what they contain: forms, buttons, checkout links, videos, thank-you steps. */
export async function detectProject(projectId: string): Promise<Detected> {
  const pages = await db.page.findMany({ where: { projectId, NOT: { slug: { endsWith: '__m' } } }, orderBy: { order: 'asc' }, take: 400, select: { slug: true, name: true, blocks: true } })
  const out: Detected = { pages: pages.map(p => ({ slug: p.slug, name: p.name })), forms: 0, formPages: [], ctas: 0, checkoutLinks: 0, checkoutHosts: [], videos: 0, thanks: [] }
  const hosts = new Set<string>()
  for (const p of pages) {
    const html = (Array.isArray(p.blocks) ? (p.blocks as any[]) : []).map(b => String(b?.generatedHtml || '')).join('\n')
    const forms = (html.match(/<form[\s>]/gi) || []).length
    if (forms) { out.forms += forms; out.formPages.push(p.slug) }
    else if (/<input[^>]+type=["']?(email|tel)/i.test(html)) { out.forms += 1; out.formPages.push(p.slug) }
    out.ctas += (html.match(/<button[\s>]|data-vai-next|data-vai-href|role=["']button/gi) || []).length
    out.videos += (html.match(/data-vai-player|<video[\s>]/gi) || []).length
    for (const m of html.matchAll(/(?:href|data-vai-href)=["']([^"']+)["']/gi)) {
      if (!/^https?:/i.test(m[1]) || !CHECKOUT_RE.test(m[1])) continue
      out.checkoutLinks++
      try { hosts.add(new URL(m[1]).hostname.replace(/^www\./, '')) } catch { /* not an address */ }
    }
    if (THANKS_RE.test(p.slug) || THANKS_RE.test(p.name)) out.thanks.push({ slug: p.slug, name: p.name })
  }
  out.checkoutHosts = Array.from(hosts).slice(0, 6)
  return out
}

/* ───────── what the pixels really did ───────── */

export interface PixelStat { integration: string; event: string; key: string; state: string; count: number }
export interface PixelOverview {
  stats: PixelStat[]
  /** distinct visits that fired each project event, any integration */
  visitsByKey: Record<string, number>
  lastSeen: Record<string, string | null>
  revenue: { total: number; purchases: number; currency: string }
  native: { sessions: number; leads: number }
  recent: { id: string; integration: string; event: string; key: string; slug: string | null; state: string; value: number | null; test: boolean; at: string }[]
}

export async function pixelOverview(projectId: string, days = 30): Promise<PixelOverview> {
  const since = new Date(Date.now() - days * 86400_000)
  const where = { projectId, test: false, createdAt: { gte: since } }
  const [groups, keys, last, revenue, sessions, leads, recent] = await Promise.all([
    db.pixelEvent.groupBy({ by: ['integration', 'event', 'key', 'state'], where, _count: true }),
    db.$queryRaw<{ key: string; n: number }[]>`SELECT "key", count(DISTINCT coalesce("sid", id))::int AS n FROM pixel_events WHERE "projectId" = ${projectId} AND test = false AND "createdAt" >= ${since} AND state IN ('sent', 'fired') GROUP BY "key"`,
    db.pixelEvent.groupBy({ by: ['trackingId'], where: { projectId, test: false }, _max: { createdAt: true } }),
    // one purchase counts once even when two pixels told about it: the value of a (visit, page) pair is taken a single time
    db.$queryRaw<{ total: number | null; n: number }[]>`SELECT coalesce(sum(v), 0)::float AS total, count(*)::int AS n FROM (SELECT DISTINCT ON (coalesce("sid", id), coalesce("slug", '')) coalesce("value", 0) AS v FROM pixel_events WHERE "projectId" = ${projectId} AND test = false AND "key" = 'purchase' AND "createdAt" >= ${since} AND state IN ('sent', 'fired') ORDER BY coalesce("sid", id), coalesce("slug", ''), "value" DESC NULLS LAST) x`,
    db.analyticsSession.count({ where: { projectId, startedAt: { gte: since }, isBot: false, mode: 'published' } }),
    db.lead.count({ where: { projectId, createdAt: { gte: since } } }),
    db.pixelEvent.findMany({ where: { projectId, createdAt: { gte: new Date(Date.now() - 3 * 86400_000) } }, orderBy: { updatedAt: 'desc' }, take: 25 }),
  ])
  const lastSeen: Record<string, string | null> = {}
  for (const l of last) if (l.trackingId) lastSeen[l.trackingId] = l._max.createdAt ? l._max.createdAt.toISOString() : null
  return {
    stats: groups.map(g => ({ integration: g.integration, event: g.event, key: g.key, state: g.state, count: g._count })),
    visitsByKey: Object.fromEntries(keys.map(k => [k.key, k.n])),
    lastSeen,
    revenue: { total: Math.round((revenue[0]?.total || 0) * 100) / 100, purchases: revenue[0]?.n || 0, currency: 'BRL' },
    native: { sessions, leads },
    recent: recent.map(r => ({ id: r.id, integration: r.integration, event: r.event, key: r.key, slug: r.slug, state: r.state, value: r.value, test: r.test, at: r.updatedAt.toISOString() })),
  }
}

/** The events a test run sent in the last minutes (the Pixels tab shows them while the person tries the published page). */
export async function testEvents(projectId: string) {
  const rows = await db.pixelEvent.findMany({ where: { projectId, test: true, updatedAt: { gte: new Date(Date.now() - 20 * 60_000) } }, orderBy: { updatedAt: 'desc' }, take: 40 })
  return rows.map(r => ({ id: r.id, trackingId: r.trackingId, integration: r.integration, event: r.event, key: r.key, slug: r.slug, state: r.state, value: r.value, at: r.updatedAt.toISOString() }))
}

/* ───────── what the pages report ───────── */

export interface PxBatch {
  px: 1
  p: string
  s?: string
  test?: boolean
  e: { i: string; tid?: string; n: string; k: string; s?: string; v?: number; c?: string; st: string; dd: string }[]
}

const short = (v: unknown, n: number) => String(v ?? '').slice(0, n)

/** Writes what a page says its pixels did. One row per (visit, integration, event, page); a better state replaces a worse one, never the other way. */
export async function ingestPixels(b: PxBatch, ip: string | null): Promise<void> {
  if (!b || typeof b.p !== 'string' || !Array.isArray(b.e) || b.e.length === 0) return
  if (tooBusy(`${ip || 'x'}|px|${b.p}`, 120)) return
  const config = await pixelConfigFor(b.p)
  if (!config) return                                         // pixels off, plan lapsed or nothing configured: nobody is listening
  const project = await db.project.findUnique({ where: { id: b.p }, select: { id: true, status: true } })
  if (!project || project.status !== 'PUBLISHED') return
  const sid = b.s && /^[\w.-]{4,60}$/.test(b.s) ? b.s : null
  const known = new Map(config.integrations.map(i => [i.id, i]))
  const eventIds = new Set(config.events.map(e => e.id))
  for (const raw of b.e.slice(0, 40)) {
    const ig = raw.tid ? known.get(raw.tid) : undefined
    const state = raw.st as PixelState
    if (!ig || ig.type !== raw.i || !(state in STATE_RANK)) continue
    const key = short(raw.k, 24)
    if (key !== 'consent' && key !== 'load' && !eventIds.has(key)) continue
    const dedupe = `${sid || '-'}|${ig.id}|${short(raw.dd, 90)}${b.test ? '|t' : ''}`
    const value = typeof raw.v === 'number' && Number.isFinite(raw.v) && raw.v >= 0 && raw.v < 1e8 ? Math.round(raw.v * 100) / 100 : null
    try {
      const have = await db.pixelEvent.findUnique({ where: { projectId_dedupe: { projectId: project.id, dedupe } }, select: { id: true, state: true } })
      if (!have) {
        await db.pixelEvent.create({ data: { projectId: project.id, sid, trackingId: ig.id, integration: ig.type, event: short(raw.n, 60), key, slug: raw.s ? short(raw.s, 120) : null, state, value, currency: raw.c ? short(raw.c, 3).toUpperCase() : null, test: !!b.test, dedupe } })
      } else if (STATE_RANK[state] > STATE_RANK[have.state as PixelState]) {
        await db.pixelEvent.update({ where: { id: have.id }, data: { state } })
      }
    } catch { /* a duplicate written at the same moment by another request: the first one wins */ }
  }
}

/* ───────── saving ───────── */

/** The events that count as conversions become goals of the project, so Métricas, the funnel and the experiments see them too. */
export async function syncGoals(projectId: string, settings: PixelSettings): Promise<void> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { analyticsSettings: true } })
  const current = readSettings(project?.analyticsSettings)
  const mine = (g: Goal) => g.id.startsWith('px_')
  const keep = current.goals.filter(g => !mine(g))
  const added: Goal[] = []
  for (const e of settings.events) {
    if (!e.on || !e.goal) continue
    if (e.kind === 'purchase' && e.trigger.match) added.push({ id: 'px_purchase', name: 'Compra', type: 'page', value: e.trigger.match, conversion: true })
    else if (e.kind === 'custom' && e.trigger.match) {
      if (e.trigger.type === 'page') added.push({ id: `px_${e.id}`, name: e.name, type: 'page', value: e.trigger.match, conversion: true })
      else if (!e.trigger.match.startsWith('sel:')) added.push({ id: `px_${e.id}`, name: e.name, type: 'click', value: e.trigger.match, conversion: true })
    }
  }
  const next = { ...current, goals: [...keep, ...added].slice(0, 20) }
  if (JSON.stringify(next.goals) !== JSON.stringify(current.goals)) {
    await db.project.update({ where: { id: projectId }, data: { analyticsSettings: next as any } })
    forgetProject(projectId)
  }
}

export async function savePixelSettings(projectId: string, raw: unknown): Promise<PixelSettings> {
  const settings = readPixelSettings(raw)
  await db.project.update({ where: { id: projectId }, data: { pixelSettings: settings as any } })
  await syncGoals(projectId, settings)
  forgetPixels(projectId)
  return settings
}

export { CUSTOM_CODE_MAX }

/* ───────── the owner's side ───────── */


/** The project, when it belongs to the signed-in person's account (and whether their plan includes pixels). */
export async function ownedProject(id: string) {
  const workspace = await getCurrentWorkspace()
  if (!workspace) return null
  const project = await db.project.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true, name: true, slug: true, status: true, pixelSettings: true, workspaceId: true } })
  if (!project) return null
  const gate = await featureGate(workspace, 'pixels')
  return { project, workspace, allowed: gate.ok, message: gate.ok ? null : gate.message }
}

export function integrationInput(type: string, body: any, events: PixelSettings['events']) {
  if (!INTEGRATION_KEYS.includes(type as Integration)) return { error: 'Integração desconhecida.' as const }
  const t = type as Integration
  const label = short(body?.label, 60).trim()
  if (t === 'CUSTOM') {
    const code = String(body?.code ?? '')
    if (code.trim().length < 5) return { error: 'Cole o código do script.' as const }
    if (code.length > CUSTOM_CODE_MAX) return { error: 'O script é grande demais (máximo de 20 mil caracteres).' as const }
    return { type: t, pixelId: null as string | null, config: { label: label || 'Script personalizado', code, map: defaultMap(t, events) } }
  }
  const pixelId = short(body?.pixelId, 40).trim()
  if (!validPixelId(t, pixelId)) return { error: `O ID não parece certo para ${INTEGRATIONS[t].label}. Exemplo: ${INTEGRATIONS[t].placeholder}` as const }
  return { type: t, pixelId: t === 'GOOGLE_ANALYTICS' || t === 'GOOGLE_TAG' || t === 'GTM' ? pixelId.toUpperCase() : pixelId, config: { label: label || undefined, map: defaultMap(t, events) } }
}
