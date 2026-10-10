import { db } from '@funnelai/db'
import { Prisma } from '@funnelai/db'
import { num, pct, sessionWhere, type Filters } from './filters'

/**
 * How people behave inside a page: where they click (and where they hammer or get no answer), how far they scroll,
 * where their attention stays, and where they give up.
 */

const filtered = (projectId: string, f: Filters, skip: Array<keyof Filters> = []) =>
  Prisma.sql`SELECT s.id FROM analytics_sessions s WHERE ${sessionWhere(projectId, f, skip)}`

export interface ClickElement {
  sel: string; text: string | null; tag: string | null; href: string | null
  clicks: number; sessions: number; rage: number; dead: number; share: number; ox: number; oy: number
}
export interface ClickPoint { sel: string | null; ox: number; oy: number; x: number; y: number; dw: number; dh: number; vw: number; rage: boolean; dead: boolean }

export async function clickMap(projectId: string, f: Filters, slug: string, device: string) {
  const sub = filtered(projectId, f, ['page'])
  const base = Prisma.sql`c."projectId" = ${projectId} AND c.slug = ${slug} AND c.device = ${device} AND c."sessionId" IN (${sub})`
  const [tot] = await db.$queryRaw<any[]>(Prisma.sql`SELECT count(*) AS clicks, count(DISTINCT c."sessionId") AS sessions FROM analytics_clicks c WHERE ${base}`)
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT c.sel, max(c.text) AS text, max(c.tag) AS tag, max(c.href) AS href, count(*) AS clicks, count(DISTINCT c."sessionId") AS sessions,
      count(*) FILTER (WHERE c.rage) AS rage, count(*) FILTER (WHERE c.dead) AS dead, avg(c.ox) AS ox, avg(c.oy) AS oy
    FROM analytics_clicks c WHERE ${base} AND c.sel IS NOT NULL GROUP BY c.sel ORDER BY clicks DESC LIMIT 40`)
  const pts = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT c.sel, c.ox, c.oy, c.x, c.y, c."docW" AS dw, c."docH" AS dh, c.vw, c.rage, c.dead
    FROM analytics_clicks c WHERE ${base} ORDER BY c.ts DESC LIMIT 4000`)
  const total = num(tot.clicks)
  return {
    total, sessions: num(tot.sessions),
    elements: rows.map<ClickElement>(r => ({
      sel: r.sel, text: r.text, tag: r.tag, href: r.href, clicks: num(r.clicks), sessions: num(r.sessions), rage: num(r.rage), dead: num(r.dead),
      share: pct(num(r.clicks), total), ox: Math.round(num(r.ox)), oy: Math.round(num(r.oy)),
    })),
    points: pts.map<ClickPoint>(p => ({ sel: p.sel, ox: p.ox ?? 500, oy: p.oy ?? 500, x: p.x ?? 0, y: p.y ?? 0, dw: p.dw ?? 0, dh: p.dh ?? 0, vw: p.vw ?? 0, rage: !!p.rage, dead: !!p.dead })),
  }
}

export async function scrollMap(projectId: string, f: Filters, slug: string, device?: string) {
  const sub = filtered(projectId, f, ['page'])
  const dev = device ? Prisma.sql`AND s.device = ${device}` : Prisma.empty
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT p."maxScroll" AS sc, p."activeMs" AS act, p.bands
    FROM analytics_pageviews p JOIN analytics_sessions s ON s.id = p."sessionId"
    WHERE p."projectId" = ${projectId} AND p.slug = ${slug} AND p."sessionId" IN (${sub}) ${dev}
    ORDER BY p."enteredAt" DESC LIMIT 20000`)
  const n = rows.length
  const reach: number[] = []
  for (let d = 10; d <= 100; d += 10) reach.push(n ? pct(rows.filter(r => r.sc >= d).length, n) : 0)
  const bands = new Array(10).fill(0)
  let withBands = 0
  for (const r of rows) {
    if (!Array.isArray(r.bands)) continue
    withBands++
    for (let i = 0; i < 10; i++) bands[i] += Number(r.bands[i]) || 0
  }
  const totalBand = bands.reduce((a, b) => a + b, 0)
  const sorted = rows.map(r => r.sc as number).sort((a, b) => a - b)
  return {
    views: n,
    avgScroll: n ? Math.round(sorted.reduce((a, b) => a + b, 0) / n) : 0,
    medianScroll: n ? sorted[Math.floor(n / 2)] : 0,
    avgActiveSec: n ? Math.round(rows.reduce((a, r) => a + r.act, 0) / n / 1000) : 0,
    /** % of the page-views that got at least to 10%, 20% ... 100% of the page */
    reach,
    /** share of the attention (time on screen) each tenth of the page held */
    attention: bands.map(b => (totalBand ? Math.round((b / totalBand) * 1000) / 10 : 0)),
    /** average seconds each tenth of the page was on screen, per page-view */
    seconds: bands.map(b => (withBands ? Math.round((b / withBands) * 10) / 10 : 0)),
  }
}

export interface Friction { slug: string | null; sel: string; text: string | null; tag: string | null; kind: 'rage' | 'dead'; clicks: number; sessions: number }

export async function frictions(projectId: string, f: Filters): Promise<{ items: Friction[]; rageSessions: number; deadSessions: number; sessions: number }> {
  const sub = filtered(projectId, f, ['page'])
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT c.slug, c.sel, max(c.text) AS text, max(c.tag) AS tag,
      count(*) FILTER (WHERE c.rage) AS rage, count(*) FILTER (WHERE c.dead) AS dead,
      count(DISTINCT c."sessionId") FILTER (WHERE c.rage) AS rs, count(DISTINCT c."sessionId") FILTER (WHERE c.dead) AS ds
    FROM analytics_clicks c WHERE c."projectId" = ${projectId} AND (c.rage OR c.dead) AND c.sel IS NOT NULL AND c."sessionId" IN (${sub})
    GROUP BY c.slug, c.sel ORDER BY (count(*) FILTER (WHERE c.rage) * 2 + count(*) FILTER (WHERE c.dead)) DESC LIMIT 40`)
  const items: Friction[] = []
  for (const r of rows) {
    if (num(r.rage)) items.push({ slug: r.slug, sel: r.sel, text: r.text, tag: r.tag, kind: 'rage', clicks: num(r.rage), sessions: num(r.rs) })
    if (num(r.dead)) items.push({ slug: r.slug, sel: r.sel, text: r.text, tag: r.tag, kind: 'dead', clicks: num(r.dead), sessions: num(r.ds) })
  }
  const [t] = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*) AS n, count(*) FILTER (WHERE s."rageCount" > 0) AS r, count(*) FILTER (WHERE s."deadCount" > 0) AS d
    FROM analytics_sessions s WHERE ${sessionWhere(projectId, f)}`)
  return { items, sessions: num(t.n), rageSessions: num(t.r), deadSessions: num(t.d) }
}

export interface AttentionElement { slug: string | null; sel: string; text: string | null; tag: string | null; clicks: number; sessions: number; conversionRate: number; lift: number }

/** What gets pressed most, and whether the people who pressed it convert more than the rest */
export async function attentionElements(projectId: string, f: Filters, baselineRate: number): Promise<AttentionElement[]> {
  const where = sessionWhere(projectId, f, ['page'])
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT c.slug, c.sel, max(c.text) AS text, max(c.tag) AS tag, count(*) AS clicks, count(DISTINCT c."sessionId") AS sessions,
      count(DISTINCT c."sessionId") FILTER (WHERE s.converted) AS conv
    FROM analytics_clicks c JOIN analytics_sessions s ON s.id = c."sessionId"
    WHERE ${where} AND c.dead = false AND c.rage = false AND c.sel IS NOT NULL
    GROUP BY c.slug, c.sel HAVING count(DISTINCT c."sessionId") >= 2 ORDER BY clicks DESC LIMIT 20`)
  return rows.map(r => {
    const sessions = num(r.sessions), rate = pct(num(r.conv), sessions)
    return { slug: r.slug, sel: r.sel, text: r.text, tag: r.tag, clicks: num(r.clicks), sessions, conversionRate: rate, lift: baselineRate > 0 ? Math.round((rate / baselineRate) * 10) / 10 : 0 }
  })
}

export interface Abandonment { slug: string; leavers: number; views: number; leaveRate: number; avgScrollAtExit: number; /** % of leavers per tenth of the page they had reached */ depth: number[]; avgActiveSec: number }

/** Where in each page the people who did not convert gave up */
export async function abandonment(projectId: string, f: Filters): Promise<Abandonment[]> {
  const where = sessionWhere(projectId, f, ['page'])
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    WITH vs AS (SELECT s.id, s.converted FROM analytics_sessions s WHERE ${where}),
    pv AS (
      SELECT p.slug, p."maxScroll", p."activeMs", vs.converted,
        row_number() OVER (PARTITION BY p."sessionId" ORDER BY p.seq DESC) = 1 AS is_last
      FROM analytics_pageviews p JOIN vs ON vs.id = p."sessionId" WHERE p.slug IS NOT NULL
    )
    SELECT slug, count(*) AS views,
      count(*) FILTER (WHERE is_last AND NOT converted) AS leavers,
      coalesce(avg("maxScroll") FILTER (WHERE is_last AND NOT converted), 0) AS "avgScroll",
      coalesce(avg("activeMs") FILTER (WHERE is_last AND NOT converted), 0) AS "avgActive",
      array_agg(LEAST(9, "maxScroll" / 10)) FILTER (WHERE is_last AND NOT converted) AS buckets
    FROM pv GROUP BY slug HAVING count(*) FILTER (WHERE is_last AND NOT converted) > 0 ORDER BY leavers DESC LIMIT 20`)
  return rows.map(r => {
    const leavers = num(r.leavers)
    const depth = new Array(10).fill(0)
    for (const b of (r.buckets || []) as number[]) depth[Math.min(9, Math.max(0, Number(b)))]++
    return {
      slug: r.slug, leavers, views: num(r.views), leaveRate: pct(leavers, num(r.views)), avgScrollAtExit: Math.round(num(r.avgScroll)),
      depth: depth.map(d => pct(d, leavers)), avgActiveSec: Math.round(num(r.avgActive) / 1000),
    }
  })
}
