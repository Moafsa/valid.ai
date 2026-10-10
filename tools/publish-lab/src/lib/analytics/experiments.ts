import { db } from '@funnelai/db'
import { Prisma } from '@funnelai/db'
import { num, pct } from './filters'

/**
 * A/B tests. The versions are pages of the same project. The first one is the control: the address visitors already
 * use. While the test runs, a visit to that address is given one of the versions (kept in a cookie, so the same
 * person always sees the same one) and the visit remembers which. When the test ends with a winner, everyone sees it.
 */
export interface Variant { id: string; name: string; slug: string; weight: number }

export const cookieName = (expId: string) => `vai_x_${expId}`

export function readVariants(raw: unknown): Variant[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(v => v && typeof v.id === 'string' && typeof v.slug === 'string')
    .map(v => ({ id: String(v.id).slice(0, 40), name: String(v.name || v.id).slice(0, 60), slug: String(v.slug).slice(0, 120), weight: Math.max(1, Math.min(100, Math.round(Number(v.weight) || 50))) }))
    .slice(0, 6)
}

/** the version this visitor gets, given the cookie they already have (if any) */
export function pickVariant(variants: Variant[], cookieValue: string | null | undefined, rnd = Math.random): { variant: Variant; fresh: boolean } {
  const kept = cookieValue ? variants.find(v => v.id === cookieValue) : undefined
  if (kept) return { variant: kept, fresh: false }
  const total = variants.reduce((t, v) => t + v.weight, 0)
  let r = rnd() * total
  for (const v of variants) { r -= v.weight; if (r < 0) return { variant: v, fresh: true } }
  return { variant: variants[0], fresh: true }
}

export function cookieOf(header: string | null | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

/** the test that applies to a request for `slug` (the control's address), if one is running (or ended with a winner) */
export async function experimentFor(projectId: string, slug: string) {
  const list = await db.experiment.findMany({ where: { projectId, status: { in: ['running', 'done'] } }, orderBy: { createdAt: 'desc' } })
  for (const e of list) {
    const variants = readVariants(e.variants)
    if (variants.length < 2 || variants[0].slug !== slug) continue
    if (e.status === 'done') {
      const w = variants.find(v => v.id === e.winner)
      if (w) return { exp: e, variants, winner: w }
      continue
    }
    return { exp: e, variants, winner: null as Variant | null }
  }
  return null
}

export interface VariantResult {
  id: string; name: string; slug: string; weight: number
  sessions: number; visitors: number; conversions: number; conversionRate: number
  bounceRate: number; avgActiveSec: number; avgScroll: number; clicksPerSession: number; ctaRate: number
  videoPlayRate: number; videoAvgPct: number; abandonRate: number
  /** how sure we are this version beats the control (0-100): null for the control itself or too little data */
  confidence: number | null
  lift: number | null
}

/** standard normal cdf */
function cdf(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}

export async function experimentResults(projectId: string, expId: string, from?: Date): Promise<{ variants: VariantResult[]; total: number; enough: boolean; leader: string | null } | null> {
  const e = await db.experiment.findFirst({ where: { id: expId, projectId } })
  if (!e) return null
  const variants = readVariants(e.variants)
  const since = from || e.startedAt
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT s.variant AS v, count(*) AS sessions, count(DISTINCT s."visitorId") AS visitors, count(*) FILTER (WHERE s.converted) AS conv,
      count(*) FILTER (WHERE s."pageCount" <= 1 AND NOT s.interacted) AS bounces, coalesce(avg(s."activeMs"), 0) AS act, coalesce(avg(s."maxScroll"), 0) AS scroll,
      coalesce(avg(s."clickCount"), 0) AS clicks, count(*) FILTER (WHERE s."ctaClicks" > 0) AS cta,
      count(*) FILTER (WHERE s."videoPlays" > 0) AS vplays, coalesce(avg(s."videoMaxPct") FILTER (WHERE s."videoPlays" > 0), 0) AS vpct
    FROM analytics_sessions s
    WHERE s."projectId" = ${projectId} AND s."expId" = ${expId} AND s."isBot" = false AND s.device IS NOT NULL AND s."startedAt" >= ${since}
    GROUP BY 1`)
  const by = new Map(rows.map(r => [String(r.v), r]))
  const control = by.get(variants[0]?.id)
  const nC = num(control?.sessions), pC = nC ? num(control?.conv) / nC : 0
  const out: VariantResult[] = variants.map((v, i) => {
    const r = by.get(v.id)
    const n = num(r?.sessions), c = num(r?.conv), p = n ? c / n : 0
    let confidence: number | null = null, lift: number | null = null
    if (i > 0 && n >= 30 && nC >= 30) {
      const pooled = (c + num(control?.conv)) / (n + nC)
      const se = Math.sqrt(pooled * (1 - pooled) * (1 / n + 1 / nC))
      confidence = se > 0 ? Math.round(cdf((p - pC) / se) * 1000) / 10 : 50
      lift = pC > 0 ? Math.round(((p - pC) / pC) * 1000) / 10 : null
    }
    return {
      ...v, sessions: n, visitors: num(r?.visitors), conversions: c, conversionRate: pct(c, n), bounceRate: pct(num(r?.bounces), n), avgActiveSec: Math.round(num(r?.act) / 1000),
      avgScroll: Math.round(num(r?.scroll)), clicksPerSession: Math.round(num(r?.clicks) * 10) / 10, ctaRate: pct(num(r?.cta), n), videoPlayRate: pct(num(r?.vplays), n),
      videoAvgPct: Math.round(num(r?.vpct)), abandonRate: pct(n - c, n), confidence, lift,
    }
  })
  const total = out.reduce((t, v) => t + v.sessions, 0)
  const enough = out.every(v => v.sessions >= 100)
  const best = [...out].sort((a, b) => b.conversionRate - a.conversionRate)[0]
  return { variants: out, total, enough, leader: best && best.sessions > 0 ? best.id : null }
}
