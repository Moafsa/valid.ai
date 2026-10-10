import { db } from '@funnelai/db'
import { Prisma } from '@funnelai/db'
import { bucketOf, num, pct, sessionWhere, TZ, type Filters } from './filters'
import { countryName } from './geo'

/**
 * Everything the overview, pages, sources and sessions screens read. All of it is computed from the rows the
 * collector wrote; nothing here invents a number.
 */

export interface Totals {
  sessions: number; visitors: number; newVisitors: number; pageviews: number
  leads: number; conversions: number; conversionRate: number
  avgActiveSec: number; avgDurationSec: number; avgScroll: number; avgPages: number
  bounceRate: number; abandonRate: number
  videoSessions: number; ctaSessions: number; rageSessions: number; deadSessions: number
  /** visits whose browser also reported behaviour (the rest were seen by the server only) */
  jsSessions: number
}

export async function totals(projectId: string, f: Filters): Promise<Totals> {
  const where = sessionWhere(projectId, f)
  const [r] = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*) AS sessions,
      count(DISTINCT s."visitorId") AS visitors,
      count(DISTINCT s."visitorId") FILTER (WHERE s."isNew") AS "newVisitors",
      coalesce(sum(s."pageCount"), 0) AS pageviews,
      count(*) FILTER (WHERE s."leadId" IS NOT NULL) AS leads,
      count(*) FILTER (WHERE s.converted) AS conversions,
      coalesce(avg(s."activeMs"), 0) AS "avgActive",
      coalesce(avg(s."durationMs"), 0) AS "avgDuration",
      coalesce(avg(s."maxScroll"), 0) AS "avgScroll",
      coalesce(avg(s."pageCount"), 0) AS "avgPages",
      count(*) FILTER (WHERE s."pageCount" <= 1 AND NOT s.interacted) AS bounces,
      count(*) FILTER (WHERE s."videoPlays" > 0) AS "videoSessions",
      count(*) FILTER (WHERE s."ctaClicks" > 0) AS "ctaSessions",
      count(*) FILTER (WHERE s."rageCount" > 0) AS "rageSessions",
      count(*) FILTER (WHERE s."deadCount" > 0) AS "deadSessions",
      count(*) FILTER (WHERE s."jsSeen") AS "jsSessions"
    FROM analytics_sessions s WHERE ${where}`)
  const sessions = num(r.sessions)
  return {
    sessions, visitors: num(r.visitors), newVisitors: num(r.newVisitors), pageviews: num(r.pageviews),
    leads: num(r.leads), conversions: num(r.conversions), conversionRate: pct(num(r.conversions), sessions),
    avgActiveSec: Math.round(num(r.avgActive) / 1000), avgDurationSec: Math.round(num(r.avgDuration) / 1000),
    avgScroll: Math.round(num(r.avgScroll)), avgPages: Math.round(num(r.avgPages) * 10) / 10,
    bounceRate: pct(num(r.bounces), sessions), abandonRate: pct(sessions - num(r.conversions), sessions),
    videoSessions: num(r.videoSessions), ctaSessions: num(r.ctaSessions), rageSessions: num(r.rageSessions), deadSessions: num(r.deadSessions), jsSessions: num(r.jsSessions),
  }
}

/** the period right before this one, same length: what "up 12%" is measured against */
export function previousPeriod(f: Filters): Filters {
  const span = f.to.getTime() - f.from.getTime()
  return { ...f, from: new Date(f.from.getTime() - span), to: new Date(f.from.getTime() - 1) }
}

export interface SeriesPoint { t: string; sessions: number; visitors: number; conversions: number; leads: number }

export async function timeseries(projectId: string, f: Filters): Promise<{ bucket: 'hour' | 'day'; points: SeriesPoint[] }> {
  const bucket = bucketOf(f)
  const where = sessionWhere(projectId, f)
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT to_char(date_trunc(${bucket}, (s."startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}), 'YYYY-MM-DD"T"HH24:MI:SS') AS t,
      count(*) AS sessions, count(DISTINCT s."visitorId") AS visitors,
      count(*) FILTER (WHERE s.converted) AS conversions, count(*) FILTER (WHERE s."leadId" IS NOT NULL) AS leads
    FROM analytics_sessions s WHERE ${where} GROUP BY 1 ORDER BY 1`)
  const byT = new Map(rows.map(r => [String(r.t), r]))
  // days or hours with no visit are zeros, not holes
  const points: SeriesPoint[] = []
  const step = bucket === 'hour' ? 3600_000 : 86400_000
  const local = (d: Date) => new Date(d.toLocaleString('en-US', { timeZone: TZ }))
  const startLocal = local(f.from.getTime() <= 0 ? new Date(rows.length ? rows[0].t + 'Z' : Date.now()) : f.from)
  if (bucket === 'hour') startLocal.setMinutes(0, 0, 0); else startLocal.setHours(0, 0, 0, 0)
  const endLocal = local(f.to)
  const fmt = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }
  for (let t = startLocal.getTime(), n = 0; t <= endLocal.getTime() && n < 800; t += step, n++) {
    const key = fmt(new Date(t))
    const r = byT.get(key)
    points.push({ t: key, sessions: num(r?.sessions), visitors: num(r?.visitors), conversions: num(r?.conversions), leads: num(r?.leads) })
  }
  return { bucket, points }
}

const DIMENSIONS = {
  source: Prisma.sql`coalesce(s."source", 'direct')`,
  channel: Prisma.sql`coalesce(s."channel", 'direct')`,
  campaign: Prisma.sql`coalesce(s."utmCampaign", '(sem campanha)')`,
  medium: Prisma.sql`coalesce(s."utmMedium", '(sem mídia)')`,
  content: Prisma.sql`coalesce(s."utmContent", '(sem anúncio)')`,
  term: Prisma.sql`coalesce(s."utmTerm", '(sem termo)')`,
  device: Prisma.sql`coalesce(s."device", 'desktop')`,
  browser: Prisma.sql`coalesce(s."browser", 'Outro')`,
  os: Prisma.sql`coalesce(s."os", 'Outro')`,
  country: Prisma.sql`coalesce(s."country", '??')`,
  region: Prisma.sql`coalesce(s."country", '??') || coalesce('/' || s."region", '')`,
  host: Prisma.sql`coalesce(s."host", '(desconhecido)')`,
  landing: Prisma.sql`coalesce(s."landingSlug", '(sem página)')`,
  exit: Prisma.sql`coalesce(s."exitSlug", '(sem página)')`,
  referrer: Prisma.sql`coalesce(s."referrerDomain", '(direto)')`,
  language: Prisma.sql`coalesce(s."language", '??')`,
  variant: Prisma.sql`coalesce(s."variant", '(sem teste)')`,
} as const
export type Dimension = keyof typeof DIMENSIONS
export const DIMENSION_KEYS = Object.keys(DIMENSIONS) as Dimension[]

export interface BreakdownRow {
  key: string; label: string; sessions: number; visitors: number; conversions: number; conversionRate: number; leads: number
  avgActiveSec: number; avgScroll: number; bounceRate: number; share: number
}

export async function breakdown(projectId: string, f: Filters, dim: Dimension, opts: { limit?: number; skipOwnFilter?: boolean } = {}): Promise<BreakdownRow[]> {
  const where = sessionWhere(projectId, f)
  const expr = DIMENSIONS[dim]
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT ${expr} AS key, count(*) AS sessions, count(DISTINCT s."visitorId") AS visitors,
      count(*) FILTER (WHERE s.converted) AS conversions, count(*) FILTER (WHERE s."leadId" IS NOT NULL) AS leads,
      coalesce(avg(s."activeMs"), 0) AS "avgActive", coalesce(avg(s."maxScroll"), 0) AS "avgScroll",
      count(*) FILTER (WHERE s."pageCount" <= 1 AND NOT s.interacted) AS bounces
    FROM analytics_sessions s WHERE ${where} GROUP BY 1 ORDER BY sessions DESC, key LIMIT ${opts.limit ?? 20}`)
  const total = rows.reduce((t, r) => t + num(r.sessions), 0)
  return rows.map(r => {
    const sessions = num(r.sessions)
    const key = String(r.key)
    return {
      key, label: dim === 'country' ? countryName(key === '??' ? null : key) : key,
      sessions, visitors: num(r.visitors), conversions: num(r.conversions), conversionRate: pct(num(r.conversions), sessions), leads: num(r.leads),
      avgActiveSec: Math.round(num(r.avgActive) / 1000), avgScroll: Math.round(num(r.avgScroll)), bounceRate: pct(num(r.bounces), sessions),
      share: pct(sessions, Math.max(total, 1)),
    }
  })
}

export interface PageRow {
  slug: string; views: number; sessions: number; avgActiveSec: number; avgScroll: number
  entries: number; exits: number; exitRate: number; conversions: number; conversionRate: number
}

export async function pagesTable(projectId: string, f: Filters): Promise<PageRow[]> {
  // the page filter would hide every other page: this table is the one place that ignores it
  const where = sessionWhere(projectId, f, ['page'])
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    WITH vs AS (SELECT s.id, s.converted, s."landingSlug" FROM analytics_sessions s WHERE ${where}),
    pv AS (
      SELECT p.slug, p."sessionId", p."activeMs", p."maxScroll", vs.converted,
        row_number() OVER (PARTITION BY p."sessionId" ORDER BY p.seq DESC) = 1 AS is_last
      FROM analytics_pageviews p JOIN vs ON vs.id = p."sessionId" WHERE p.slug IS NOT NULL
    )
    SELECT slug, count(*) AS views, count(DISTINCT "sessionId") AS sessions,
      coalesce(avg("activeMs"), 0) AS "avgActive", coalesce(avg("maxScroll"), 0) AS "avgScroll",
      count(*) FILTER (WHERE is_last) AS exits,
      count(DISTINCT "sessionId") FILTER (WHERE converted) AS conversions,
      (SELECT count(*) FROM vs WHERE vs."landingSlug" = pv.slug) AS entries
    FROM pv GROUP BY slug ORDER BY views DESC LIMIT 60`)
  return rows.map(r => ({
    slug: String(r.slug), views: num(r.views), sessions: num(r.sessions), avgActiveSec: Math.round(num(r.avgActive) / 1000), avgScroll: Math.round(num(r.avgScroll)),
    entries: num(r.entries), exits: num(r.exits), exitRate: pct(num(r.exits), num(r.views)), conversions: num(r.conversions), conversionRate: pct(num(r.conversions), num(r.sessions)),
  }))
}

export interface SessionRow {
  id: string; startedAt: string; source: string | null; channel: string | null; campaign: string | null; content: string | null
  landingSlug: string | null; exitSlug: string | null; device: string | null; browser: string | null; os: string | null
  country: string | null; region: string | null; city: string | null
  pageCount: number; activeSec: number; durationSec: number; maxScroll: number; clickCount: number; rageCount: number; deadCount: number
  videoMaxPct: number; videoPlays: number; converted: boolean; goal: string | null; isNew: boolean
  lead: { id: string; name: string | null; email: string | null; phone: string | null } | null
  recording: boolean
  brand: string | null; model: string | null; inApp: string | null; score: number
}

export async function sessionsList(projectId: string, f: Filters, o: { page?: number; size?: number; sort?: string; lead?: boolean; rec?: boolean } = {}): Promise<{ rows: SessionRow[]; total: number }> {
  const where = sessionWhere(projectId, f)
  const size = Math.min(100, o.size || 30), offset = Math.max(0, ((o.page || 1) - 1) * size)
  const order = ({
    recent: Prisma.sql`s."startedAt" DESC`, long: Prisma.sql`s."activeMs" DESC`, clicks: Prisma.sql`s."clickCount" DESC`,
    frustrated: Prisma.sql`(s."rageCount" * 3 + s."deadCount") DESC, s."startedAt" DESC`, pages: Prisma.sql`s."pageCount" DESC`,
  } as Record<string, Prisma.Sql>)[o.sort || 'recent'] || Prisma.sql`s."startedAt" DESC`
  const extra: Prisma.Sql[] = []
  if (o.lead) extra.push(Prisma.sql`s."leadId" IS NOT NULL`)
  if (o.rec) extra.push(Prisma.sql`EXISTS (SELECT 1 FROM analytics_recordings r WHERE r."sessionId" = s.id)`)
  const w = extra.length ? Prisma.sql`${where} AND ${Prisma.join(extra, ' AND ')}` : where
  const [count] = await db.$queryRaw<any[]>(Prisma.sql`SELECT count(*) AS n FROM analytics_sessions s WHERE ${w}`)
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT s.*, l.id AS "lid", l.name AS "lname", l.email AS "lemail", l.phone AS "lphone",
      EXISTS (SELECT 1 FROM analytics_recordings r WHERE r."sessionId" = s.id) AS "hasRec"
    FROM analytics_sessions s LEFT JOIN leads l ON l."sessionId" = s.id
    WHERE ${w} ORDER BY ${order} LIMIT ${size} OFFSET ${offset}`)
  return {
    total: num(count.n),
    rows: rows.map(r => ({
      id: r.id, startedAt: new Date(r.startedAt).toISOString(), source: r.source, channel: r.channel, campaign: r.utmCampaign, content: r.utmContent,
      landingSlug: r.landingSlug, exitSlug: r.exitSlug, device: r.device, browser: r.browser, os: r.os, country: r.country, region: r.region, city: r.city,
      pageCount: r.pageCount, activeSec: Math.round(r.activeMs / 1000), durationSec: Math.round(r.durationMs / 1000), maxScroll: r.maxScroll,
      clickCount: r.clickCount, rageCount: r.rageCount, deadCount: r.deadCount, videoMaxPct: r.videoMaxPct, videoPlays: r.videoPlays,
      converted: r.converted, goal: r.goal, isNew: r.isNew,
      lead: r.lid ? { id: r.lid, name: r.lname, email: r.lemail, phone: r.lphone } : null, recording: !!r.hasRec,
      brand: r.deviceBrand, model: r.deviceModel, inApp: r.inApp, score: r.score,
    })),
  }
}

export type TimelineKind = 'page' | 'click' | 'rage' | 'dead' | 'scroll' | 'video' | 'form' | 'lead' | 'goal' | 'checkout' | 'outbound' | 'contact' | 'exit' | 'custom'
export interface TimelineItem { ts: string; kind: TimelineKind; label: string; detail?: string; slug?: string | null }

export async function sessionDetail(projectId: string, id: string) {
  const s = await db.analyticsSession.findFirst({ where: { id, projectId } })
  if (!s) return null
  const [pageviews, clicks, events, videos, lead, recording] = await Promise.all([
    db.analyticsPageview.findMany({ where: { sessionId: id }, orderBy: { seq: 'asc' } }),
    db.analyticsClick.findMany({ where: { sessionId: id }, orderBy: { ts: 'asc' }, take: 400 }),
    db.analyticsEvent.findMany({ where: { sessionId: id }, orderBy: { ts: 'asc' }, take: 600 }),
    db.videoView.findMany({ where: { sessionId: id } }),
    db.lead.findFirst({ where: { sessionId: id, projectId } }),
    db.recording.findUnique({ where: { sessionId: id }, select: { id: true, durationMs: true, events: true, bytes: true } }),
  ])
  const t: TimelineItem[] = []
  const iso = (d: Date) => d.toISOString()
  for (const p of pageviews) {
    t.push({ ts: iso(p.enteredAt), kind: 'page', label: `Abriu ${p.slug || p.path || 'página'}`, detail: `${Math.round(p.activeMs / 1000)}s ativos · rolou até ${p.maxScroll}% · ${p.clicks} cliques`, slug: p.slug })
    if (p.leftAt && p.exitKind && p.exitKind !== 'navigate') t.push({ ts: iso(p.leftAt), kind: 'exit', label: p.exitKind === 'leave' ? `Saiu em ${p.slug || 'página'}` : `Parou em ${p.slug || 'página'}`, slug: p.slug })
  }
  for (const c of clicks) t.push({ ts: iso(c.ts), kind: c.rage ? 'rage' : c.dead ? 'dead' : 'click', label: `${c.rage ? 'Cliques repetidos em' : c.dead ? 'Clique sem resposta em' : 'Clicou em'} ${c.text ? `"${c.text}"` : c.tag || 'elemento'}`, detail: c.href || undefined, slug: c.slug })
  const labels: Record<string, [TimelineKind, string]> = {
    scroll: ['scroll', 'Rolou a página'], video_play: ['video', 'Apertou play no vídeo'], form_start: ['form', 'Começou a preencher um formulário'], form_submit: ['form', 'Enviou um formulário'],
    lead: ['lead', 'Virou lead'], goal: ['goal', 'Atingiu um objetivo'], checkout: ['checkout', 'Foi para o checkout'], outbound: ['outbound', 'Saiu por um link externo'], contact: ['contact', 'Abriu um contato'], custom: ['custom', 'Evento'],
  }
  for (const e of events) {
    const d = (e.data || {}) as any
    const m = labels[e.type]
    if (!m) continue
    let label = m[1], detail: string | undefined
    if (e.type === 'scroll') label = `Rolou até ${d.pct}% da página`
    if (e.type === 'goal') label = `Objetivo: ${d.name}`
    if (e.type === 'outbound' || e.type === 'contact') detail = d.href
    if (e.type === 'checkout') detail = d.href
    if (e.type === 'custom') label = `Evento: ${d.name}`
    t.push({ ts: iso(e.ts), kind: m[0], label, detail, slug: e.slug })
  }
  for (const v of videos) t.push({ ts: iso(v.firstPlayAt || s.startedAt), kind: 'video', label: `Assistiu ${v.watchedSecs}s do vídeo`, detail: v.duration ? `${Math.round(Math.min(100, (v.maxTime / v.duration) * 100))}% do vídeo (${v.duration}s), parou em ${v.leftAt ?? v.maxTime}s${v.ended ? ' · chegou ao fim' : ''}` : undefined, slug: v.slug })
  t.sort((a, b) => a.ts.localeCompare(b.ts))
  return { session: s, pageviews, videos, lead, recording, timeline: t }
}
