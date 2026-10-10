import { db } from '@funnelai/db'
import { Prisma } from '@funnelai/db'
import { num, pct, sessionWhere, type Filters } from './filters'
import { countryName } from './geo'

/**
 * Video analytics in the way a VSL is judged: how many pressed play, how long they stayed, and the exact second
 * people leave. Built from the stretches of the video each visit really played (analytics_video_views.ranges), so a
 * visitor who jumps ahead does not count as having watched what was skipped.
 */

const filtered = (projectId: string, f: Filters, skip: Array<keyof Filters> = []) =>
  Prisma.sql`SELECT s.id FROM analytics_sessions s WHERE ${sessionWhere(projectId, f, skip)}`

export interface VideoSummary {
  src: string; slug: string | null; duration: number
  /** visits in which the video was on screen */
  seen: number
  /** visits that pressed play */
  plays: number
  viewers: number
  playRate: number
  avgWatchedSec: number; avgPct: number
  reachedEnd: number; endRate: number
  videoClicks: number
  convAfter: number; convAfterRate: number
  /** the player cannot read an embedded (iframe) video's clock: only the start is known */
  embedded: boolean
}

export async function videoList(projectId: string, f: Filters): Promise<VideoSummary[]> {
  const sub = filtered(projectId, f)
  const [seenRows, viewRows, playEvents, clickRows] = await Promise.all([
    db.$queryRaw<any[]>(Prisma.sql`
      SELECT e.data->>'src' AS src, count(DISTINCT e."sessionId") AS n FROM analytics_events e
      WHERE e."projectId" = ${projectId} AND e.type = 'video_seen' AND e."sessionId" IN (${sub}) GROUP BY 1`),
    db.$queryRaw<any[]>(Prisma.sql`
      SELECT v.src, max(v.slug) AS slug, max(v.duration) AS duration, count(*) AS views, count(DISTINCT s."visitorId") AS viewers,
        coalesce(avg(v."watchedSecs"), 0) AS watched,
        coalesce(avg(LEAST(100, CASE WHEN v.ended THEN 100 WHEN v.duration > 0 THEN v."maxTime" * 100.0 / v.duration ELSE 0 END)), 0) AS pct,
        count(*) FILTER (WHERE v.ended OR (v.duration > 0 AND v."maxTime" >= v.duration - 2)) AS ended,
        count(*) FILTER (WHERE s.converted) AS conv
      FROM analytics_video_views v JOIN analytics_sessions s ON s.id = v."sessionId"
      WHERE v."projectId" = ${projectId} AND v."sessionId" IN (${sub}) AND (v.plays > 0 OR v."watchedSecs" > 0) GROUP BY v.src`),
    db.$queryRaw<any[]>(Prisma.sql`
      SELECT e.data->>'src' AS src, max(e.slug) AS slug, count(DISTINCT e."sessionId") AS n, count(DISTINCT s."visitorId") AS viewers,
        count(DISTINCT e."sessionId") FILTER (WHERE s.converted) AS conv
      FROM analytics_events e JOIN analytics_sessions s ON s.id = e."sessionId"
      WHERE e."projectId" = ${projectId} AND e.type = 'video_play' AND e."sessionId" IN (${sub}) GROUP BY 1`),
    db.$queryRaw<any[]>(Prisma.sql`
      SELECT c.slug, count(*) AS n FROM analytics_clicks c WHERE c."projectId" = ${projectId} AND c.video AND c."sessionId" IN (${sub}) GROUP BY c.slug`),
  ])
  const seen = new Map(seenRows.map(r => [String(r.src), num(r.n)]))
  const clicks = new Map(clickRows.map(r => [String(r.slug), num(r.n)]))
  const srcs = new Set<string>([...viewRows.map(r => String(r.src)), ...seenRows.map(r => String(r.src)), ...playEvents.map(r => String(r.src))])
  const out: VideoSummary[] = []
  for (const src of srcs) {
    if (!src || src === 'null') continue
    const vr = viewRows.find(r => String(r.src) === src)
    const pe = playEvents.find(r => String(r.src) === src)
    const embedded = !vr
    const plays = vr ? num(vr.views) : num(pe?.n)
    const seenN = Math.max(seen.get(src) || 0, plays)
    const slug = (vr?.slug ?? pe?.slug ?? null) as string | null
    const conv = vr ? num(vr.conv) : num(pe?.conv)
    out.push({
      src, slug, duration: num(vr?.duration), seen: seenN, plays, viewers: vr ? num(vr.viewers) : num(pe?.viewers), playRate: pct(plays, seenN),
      avgWatchedSec: Math.round(num(vr?.watched)), avgPct: Math.round(num(vr?.pct)), reachedEnd: vr ? num(vr.ended) : 0, endRate: vr ? pct(num(vr.ended), plays) : 0,
      videoClicks: slug ? clicks.get(slug) || 0 : 0, convAfter: conv, convAfterRate: pct(conv, plays), embedded,
    })
  }
  return out.sort((a, b) => b.plays - a.plays || b.seen - a.seen)
}

export interface Retention {
  src: string; duration: number; starters: number
  /** % of the people who started that were still watching at each second (0..duration) */
  curve: { s: number; pct: number }[]
  /** % that got at least to 10%, 20% ... 100% of the video */
  reach: number[]
  /** the stretches where the audience falls the fastest */
  drops: { from: number; to: number; lost: number; atStart: number }[]
  /** where people stopped for good: the second they left, grouped */
  leaves: { from: number; to: number; count: number; share: number }[]
  /** conversion by how much of the video was watched */
  byWatched: { label: string; sessions: number; conversions: number; rate: number }[]
  neverPlayed: { sessions: number; conversions: number; rate: number }
}

export async function retention(projectId: string, f: Filters, src: string): Promise<Retention | null> {
  const sub = filtered(projectId, f)
  const base = Prisma.sql`v."projectId" = ${projectId} AND v.src = ${src} AND v."sessionId" IN (${sub}) AND (v.plays > 0 OR v."watchedSecs" > 0)`
  const [meta] = await db.$queryRaw<any[]>(Prisma.sql`SELECT count(*) AS n, max(v.duration) AS dur, max(v."maxTime") AS mx FROM analytics_video_views v WHERE ${base}`)
  const starters = num(meta.n)
  if (!starters) return null
  const duration = Math.max(num(meta.dur), num(meta.mx), 1)
  const curveRows = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT g.s AS sec, count(*) AS n
    FROM analytics_video_views v, jsonb_array_elements(v.ranges) r, generate_series((r->>0)::int, LEAST((r->>1)::int, ${duration})) g(s)
    WHERE ${base} GROUP BY g.s ORDER BY g.s`)
  const at = new Map(curveRows.map(r => [num(r.sec), num(r.n)]))
  const step = duration > 900 ? 5 : duration > 300 ? 2 : 1
  const curve: { s: number; pct: number }[] = []
  for (let s = 0; s <= duration; s += step) curve.push({ s, pct: Math.min(100, Math.round(((at.get(s) || 0) / starters) * 1000) / 10) })
  if (curve[curve.length - 1].s !== duration) curve.push({ s: duration, pct: Math.min(100, Math.round(((at.get(duration) || 0) / starters) * 1000) / 10) })

  // how far each viewer got (their furthest second)
  const far = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT CASE WHEN v.ended THEN ${duration}::int ELSE v."maxTime" END AS mx, coalesce(v."leftAt", v."maxTime") AS leftat, v.ended AS ended, s.converted AS conv, v."watchedSecs" AS watched
    FROM analytics_video_views v JOIN analytics_sessions s ON s.id = v."sessionId" WHERE ${base}`)
  const reach: number[] = []
  for (let q = 10; q <= 100; q += 10) reach.push(pct(far.filter(r => num(r.mx) >= (duration * q) / 100 - (q === 100 ? 2 : 0)).length, starters))

  // drops: windows of ~3% of the video (at least 5s) where the most audience is lost
  const win = Math.max(5, Math.round(duration * 0.03))
  const val = (s: number) => (at.get(Math.min(duration, Math.max(0, s))) || 0) / starters * 100
  const wins: { from: number; to: number; lost: number; atStart: number }[] = []
  for (let s = 0; s + win <= duration; s += Math.max(1, Math.floor(win / 2))) {
    const a = val(s), b = val(s + win)
    if (a - b > 0) wins.push({ from: s, to: s + win, lost: Math.round((a - b) * 10) / 10, atStart: Math.round(a * 10) / 10 })
  }
  wins.sort((x, y) => y.lost - x.lost)
  const drops: typeof wins = []
  for (const w of wins) {
    if (drops.length >= 5) break
    if (drops.every(d => w.from >= d.to || w.to <= d.from)) drops.push(w)
  }
  drops.sort((x, y) => x.from - y.from)

  // leaves: the second a viewer was at when they stopped, in ~5% buckets (the ones who finished are not leavers)
  const bucket = Math.max(5, Math.round(duration / 20))
  const counts = new Map<number, number>()
  const leavers = far.filter(r => !r.ended)
  for (const r of leavers) { const b = Math.floor(num(r.leftat) / bucket); counts.set(b, (counts.get(b) || 0) + 1) }
  const leaves = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([b, count]) => ({ from: b * bucket, to: Math.min(duration, (b + 1) * bucket), count, share: pct(count, starters) }))

  const bins: [string, (w: number) => boolean][] = [
    ['até 25%', w => w < 25], ['25 a 50%', w => w >= 25 && w < 50], ['50 a 75%', w => w >= 50 && w < 75], ['75% ou mais', w => w >= 75],
  ]
  const byWatched = bins.map(([label, fn]) => {
    const rows = far.filter(r => fn(r.ended ? 100 : Math.min(100, (num(r.mx) / duration) * 100)))
    const conv = rows.filter(r => r.conv).length
    return { label, sessions: rows.length, conversions: conv, rate: pct(conv, rows.length) }
  })
  const [np] = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*) AS n, count(*) FILTER (WHERE s.converted) AS conv FROM analytics_sessions s
    WHERE ${sessionWhere(projectId, f)} AND s."videoPlays" = 0
      AND EXISTS (SELECT 1 FROM analytics_events e WHERE e."sessionId" = s.id AND e.type = 'video_seen' AND e.data->>'src' = ${src})`)
  return { src, duration, starters, curve, reach, drops, leaves, byWatched, neverPlayed: { sessions: num(np.n), conversions: num(np.conv), rate: pct(num(np.conv), num(np.n)) } }
}

export const COMPARE_DIMS = {
  source: Prisma.sql`coalesce(s."source", 'direct')`,
  campaign: Prisma.sql`coalesce(s."utmCampaign", '(sem campanha)')`,
  content: Prisma.sql`coalesce(s."utmContent", '(sem anúncio)')`,
  medium: Prisma.sql`coalesce(s."utmMedium", '(sem mídia)')`,
  device: Prisma.sql`coalesce(s."device", 'desktop')`,
  browser: Prisma.sql`coalesce(s."browser", 'Outro')`,
  country: Prisma.sql`coalesce(s."country", '??')`,
  page: Prisma.sql`coalesce(v.slug, s."landingSlug", '(sem página)')`,
} as const
export type CompareDim = keyof typeof COMPARE_DIMS

export interface CompareRow {
  key: string; label: string; viewers: number; avgPct: number; avgWatchedSec: number
  /** % of the viewers that got at least to each mark */
  marks: { label: string; pct: number }[]
  conversions: number; conversionRate: number
}

/** The retention of the same video, split by where the visitors came from (or the device, the page...) */
export async function retentionBy(projectId: string, f: Filters, src: string, dim: CompareDim, duration: number): Promise<CompareRow[]> {
  const sub = filtered(projectId, f)
  const secs = [10, 30, 60, 120, 180, 300, 600].filter(s => s < duration * 0.9).slice(0, 5)
  const marks: { label: string; sql: Prisma.Sql }[] = [
    ...secs.map(s => ({ label: s < 60 ? `${s}s` : `${Math.round(s / 60)}min`, sql: Prisma.sql`count(*) FILTER (WHERE v."maxTime" >= ${s})` })),
    ...[25, 50, 75].map(q => ({ label: `${q}%`, sql: Prisma.sql`count(*) FILTER (WHERE v.ended OR (v.duration > 0 AND v."maxTime" * 100.0 / v.duration >= ${q}))` })),
    { label: 'fim', sql: Prisma.sql`count(*) FILTER (WHERE v.ended OR (v.duration > 0 AND v."maxTime" >= v.duration - 2))` },
  ]
  const cols = Prisma.join(marks.map((m, i) => Prisma.sql`${m.sql} AS ${Prisma.raw(`m${i}`)}`), ', ')
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT ${COMPARE_DIMS[dim]} AS key, count(*) AS viewers, coalesce(avg(v."watchedSecs"), 0) AS watched,
      coalesce(avg(LEAST(100, CASE WHEN v.ended THEN 100 WHEN v.duration > 0 THEN v."maxTime" * 100.0 / v.duration ELSE 0 END)), 0) AS pct,
      count(*) FILTER (WHERE s.converted) AS conv, ${cols}
    FROM analytics_video_views v JOIN analytics_sessions s ON s.id = v."sessionId"
    WHERE v."projectId" = ${projectId} AND v.src = ${src} AND v."sessionId" IN (${sub}) AND (v.plays > 0 OR v."watchedSecs" > 0)
    GROUP BY 1 ORDER BY viewers DESC LIMIT 8`)
  return rows.map(r => ({
    key: String(r.key), label: dim === 'country' ? countryName(String(r.key) === '??' ? null : String(r.key)) : String(r.key),
    viewers: num(r.viewers), avgPct: Math.round(num(r.pct)), avgWatchedSec: Math.round(num(r.watched)),
    marks: marks.map((m, i) => ({ label: m.label, pct: pct(num(r[`m${i}`]), num(r.viewers)) })),
    conversions: num(r.conv), conversionRate: pct(num(r.conv), num(r.viewers)),
  }))
}
