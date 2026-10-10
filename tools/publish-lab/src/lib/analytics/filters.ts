import { Prisma } from '@funnelai/db'

/**
 * The filters of the analytics center. Every screen asks the same question ("which visits?") and gets the same answer
 * from here: one WHERE over analytics_sessions, so the numbers of different screens always agree with each other.
 */
export const TZ = process.env.ANALYTICS_TZ || 'America/Sao_Paulo'

export interface Filters {
  from: Date
  to: Date
  /** a page of the project (slug): visits that saw it */
  page?: string
  host?: string
  source?: string
  channel?: string
  campaign?: string
  medium?: string
  content?: string
  device?: string
  browser?: string
  os?: string
  country?: string
  /** new | returning */
  visitor?: 'new' | 'returning'
  /** converted | not */
  outcome?: 'converted' | 'not'
  /** all | published | draft */
  mode?: 'all' | 'published' | 'draft'
  exp?: string
  variant?: string
}

export const FILTER_KEYS = ['page', 'host', 'source', 'channel', 'campaign', 'medium', 'content', 'device', 'browser', 'os', 'country', 'visitor', 'outcome', 'mode', 'exp', 'variant'] as const

const DAY = 86400_000

/** 7d, 30d, today, yesterday, 90d, all or from/to dates (yyyy-mm-dd) */
export function parseFilters(q: URLSearchParams | Record<string, string | string[] | undefined>, now = new Date()): Filters & { period: string } {
  const get = (k: string): string | undefined => {
    const v = q instanceof URLSearchParams ? q.get(k) : q[k]
    const s = Array.isArray(v) ? v[0] : v
    return s && s !== 'all' ? s : undefined
  }
  const period = (q instanceof URLSearchParams ? q.get('period') : (Array.isArray(q.period) ? q.period[0] : q.period)) || '7d'
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0)
  let from = new Date(now.getTime() - 7 * DAY), to = now
  if (period === 'today') from = startOfToday
  else if (period === 'yesterday') { from = new Date(startOfToday.getTime() - DAY); to = startOfToday }
  else if (period === '24h') from = new Date(now.getTime() - DAY)
  else if (period === '7d') from = new Date(now.getTime() - 7 * DAY)
  else if (period === '30d') from = new Date(now.getTime() - 30 * DAY)
  else if (period === '90d') from = new Date(now.getTime() - 90 * DAY)
  else if (period === 'all') from = new Date(0)
  else if (period === 'custom') {
    const f = get('from'), t = get('to')
    const fd = f ? new Date(f + 'T00:00:00') : null, td = t ? new Date(t + 'T23:59:59') : null
    if (fd && !isNaN(+fd)) from = fd
    if (td && !isNaN(+td)) to = td
  }
  const out: Filters & { period: string } = { period, from, to }
  for (const k of FILTER_KEYS) {
    const v = get(k)
    if (v) (out as any)[k] = v.slice(0, 150)
  }
  if (out.visitor && out.visitor !== 'new' && out.visitor !== 'returning') delete out.visitor
  if (out.outcome && out.outcome !== 'converted' && out.outcome !== 'not') delete out.outcome
  if (out.mode && !['published', 'draft'].includes(out.mode)) delete out.mode
  return out
}

/** the filters written back as URL parameters (for links and for the UI to remember them) */
export function filtersToQuery(f: Partial<Filters> & { period?: string }): URLSearchParams {
  const p = new URLSearchParams()
  if (f.period) p.set('period', f.period)
  for (const k of FILTER_KEYS) { const v = (f as any)[k]; if (v) p.set(k, String(v)) }
  return p
}

const DIRECT = 'direct'

/**
 * WHERE for analytics_sessions (aliased `s`). Robots and visits without a description are never counted.
 * `skip` leaves one filter out, which is how a breakdown shows the other options of the filter that is being applied.
 */
export function sessionWhere(projectId: string, f: Filters, skip: Array<keyof Filters> = []): Prisma.Sql {
  const w: Prisma.Sql[] = [
    Prisma.sql`s."projectId" = ${projectId}`,
    Prisma.sql`s."startedAt" >= ${f.from}`,
    Prisma.sql`s."startedAt" <= ${f.to}`,
    Prisma.sql`s."isBot" = false`,
    Prisma.sql`s."device" IS NOT NULL`,
    Prisma.sql`s."mode" = 'published'`,
  ]
  const on = (k: keyof Filters) => !skip.includes(k) && f[k] !== undefined
  if (on('host')) w.push(Prisma.sql`s."host" = ${f.host}`)
  if (on('source')) w.push(f.source === DIRECT ? Prisma.sql`(s."source" IS NULL OR s."source" = 'direct')` : Prisma.sql`s."source" = ${f.source}`)
  if (on('channel')) w.push(Prisma.sql`s."channel" = ${f.channel}`)
  if (on('campaign')) w.push(f.campaign === '(sem campanha)' ? Prisma.sql`s."utmCampaign" IS NULL` : Prisma.sql`s."utmCampaign" = ${f.campaign}`)
  if (on('medium')) w.push(Prisma.sql`s."utmMedium" = ${f.medium}`)
  if (on('content')) w.push(Prisma.sql`s."utmContent" = ${f.content}`)
  if (on('device')) w.push(Prisma.sql`s."device" = ${f.device}`)
  if (on('browser')) w.push(Prisma.sql`s."browser" = ${f.browser}`)
  if (on('os')) w.push(Prisma.sql`s."os" = ${f.os}`)
  if (on('country')) w.push(Prisma.sql`s."country" = ${f.country}`)
  if (on('visitor')) w.push(Prisma.sql`s."isNew" = ${f.visitor === 'new'}`)
  if (on('outcome')) w.push(Prisma.sql`s."converted" = ${f.outcome === 'converted'}`)
  if (on('exp')) w.push(Prisma.sql`s."expId" = ${f.exp}`)
  if (on('variant')) w.push(Prisma.sql`s."variant" = ${f.variant}`)
  if (on('page')) w.push(Prisma.sql`EXISTS (SELECT 1 FROM analytics_pageviews pv WHERE pv."sessionId" = s.id AND pv.slug = ${f.page})`)
  return Prisma.join(w, ' AND ')
}

/** a bucket for a time series: hours inside a day or two, days after that */
export function bucketOf(f: Filters): 'hour' | 'day' {
  return f.to.getTime() - f.from.getTime() <= 2 * DAY + 1000 ? 'hour' : 'day'
}

export const num = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : v == null ? 0 : Number(v))
export const pct = (a: number, b: number): number => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0)
