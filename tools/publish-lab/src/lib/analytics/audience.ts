import { db } from '@funnelai/db'
import { Prisma } from '@funnelai/db'
import { num, pct, sessionWhere, TZ, type Filters } from './filters'

/**
 * Who the people are and how the page treated them: devices and models, the app the link was opened in, screens, connections,
 * how fast the page really was, when they come, and how promising each visit looked.
 */
const pctile = (col: string, p: number) => Prisma.raw(`percentile_cont(${p}) WITHIN GROUP (ORDER BY s."${col}")`)

export interface Audience {
  models: { brand: string; model: string; sessions: number; conversionRate: number; share: number }[]
  brands: { key: string; sessions: number; conversionRate: number; share: number }[]
  inApp: { key: string; sessions: number; conversions: number; conversionRate: number; bounceRate: number; share: number; avgScore: number }[]
  screens: { key: string; sessions: number; conversionRate: number; share: number }[]
  connections: { key: string; sessions: number; conversionRate: number; share: number }[]
  speed: {
    measured: number; lcp: { p50: number; p75: number; p90: number }; fcp75: number; ttfb75: number; cls75: number; goodShare: number
    buckets: { label: string; sessions: number; share: number; bounceRate: number; conversionRate: number }[]
    byDevice: { device: string; sessions: number; lcp75: number }[]
    byInApp: { key: string; sessions: number; lcp75: number }[]
  }
  hours: { dow: number; hour: number; sessions: number; conversions: number }[]
  score: {
    hot: number; warm: number; cold: number; avg: number
    bySource: { key: string; sessions: number; avgScore: number; hotShare: number }[]
    profile: { dim: string; key: string; hotShare: number; allShare: number; lift: number }[]
  }
  returning: { newSessions: number; returningSessions: number; newRate: number; returningRate: number }
}

export async function audience(projectId: string, f: Filters): Promise<Audience> {
  const where = sessionWhere(projectId, f)
  const base = Prisma.sql`FROM analytics_sessions s WHERE ${where}`
  const [models, inApp, screens, conns, sp, buckets, byDevice, byInApp, hours, scoreBands, bySource, returning, totalRow] = await Promise.all([
    db.$queryRaw<any[]>(Prisma.sql`SELECT coalesce(s."deviceBrand", '—') AS brand, coalesce(s."deviceModel", '—') AS model, count(*) AS n, count(*) FILTER (WHERE s.converted) AS c ${base} GROUP BY 1, 2 ORDER BY n DESC LIMIT 16`),
    db.$queryRaw<any[]>(Prisma.sql`SELECT coalesce(s."inApp", 'Navegador normal') AS k, count(*) AS n, count(*) FILTER (WHERE s.converted) AS c, count(*) FILTER (WHERE s."pageCount" <= 1 AND NOT s.interacted) AS b, coalesce(avg(s.score), 0) AS sc ${base} GROUP BY 1 ORDER BY n DESC LIMIT 10`),
    db.$queryRaw<any[]>(Prisma.sql`SELECT CASE WHEN w IS NULL THEN 'Sem dado' WHEN w <= 360 THEN 'Até 360 px' WHEN w <= 400 THEN '361 a 400 px' WHEN w <= 440 THEN '401 a 440 px' WHEN w <= 820 THEN '441 a 820 px (celular grande, tablet)' WHEN w <= 1280 THEN '821 a 1280 px (notebook pequeno)' WHEN w <= 1600 THEN '1281 a 1600 px' ELSE 'Acima de 1600 px' END AS k, count(*) AS n, count(*) FILTER (WHERE c) AS c
      FROM (SELECT coalesce(s."viewportW", s."screenW") AS w, s.converted AS c FROM analytics_sessions s WHERE ${where}) x GROUP BY 1 ORDER BY n DESC`),
    db.$queryRaw<any[]>(Prisma.sql`SELECT coalesce(s.connection, 'não informado') AS k, count(*) AS n, count(*) FILTER (WHERE s.converted) AS c ${base} GROUP BY 1 ORDER BY n DESC`),
    db.$queryRaw<any[]>(Prisma.sql`SELECT count(*) FILTER (WHERE s."lcpMs" IS NOT NULL) AS m, ${pctile('lcpMs', 0.5)} AS l50, ${pctile('lcpMs', 0.75)} AS l75, ${pctile('lcpMs', 0.9)} AS l90, ${pctile('fcpMs', 0.75)} AS f75, ${pctile('ttfbMs', 0.75)} AS t75, ${pctile('cls', 0.75)} AS c75, count(*) FILTER (WHERE s."lcpMs" <= 2500) AS good ${base}`),
    db.$queryRaw<any[]>(Prisma.sql`SELECT CASE WHEN s."lcpMs" <= 1500 THEN 1 WHEN s."lcpMs" <= 2500 THEN 2 WHEN s."lcpMs" <= 4000 THEN 3 ELSE 4 END AS b, count(*) AS n, count(*) FILTER (WHERE s."pageCount" <= 1 AND NOT s.interacted) AS bounce, count(*) FILTER (WHERE s.converted) AS c ${base} AND s."lcpMs" IS NOT NULL GROUP BY 1 ORDER BY 1`),
    db.$queryRaw<any[]>(Prisma.sql`SELECT s.device AS k, count(*) AS n, ${pctile('lcpMs', 0.75)} AS l75 ${base} AND s."lcpMs" IS NOT NULL GROUP BY 1 ORDER BY n DESC`),
    db.$queryRaw<any[]>(Prisma.sql`SELECT coalesce(s."inApp", 'Navegador normal') AS k, count(*) AS n, ${pctile('lcpMs', 0.75)} AS l75 ${base} AND s."lcpMs" IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 6`),
    db.$queryRaw<any[]>(Prisma.sql`SELECT EXTRACT(DOW FROM (s."startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::int AS dow, EXTRACT(HOUR FROM (s."startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::int AS hr, count(*) AS n, count(*) FILTER (WHERE s.converted) AS c ${base} GROUP BY 1, 2`),
    db.$queryRaw<any[]>(Prisma.sql`SELECT count(*) FILTER (WHERE s.score >= 70) AS hot, count(*) FILTER (WHERE s.score >= 40 AND s.score < 70) AS warm, count(*) FILTER (WHERE s.score < 40) AS cold, coalesce(avg(s.score), 0) AS avg ${base}`),
    db.$queryRaw<any[]>(Prisma.sql`SELECT coalesce(s.source, 'direct') AS k, count(*) AS n, coalesce(avg(s.score), 0) AS sc, count(*) FILTER (WHERE s.score >= 70) AS hot ${base} GROUP BY 1 HAVING count(*) >= 1 ORDER BY n DESC LIMIT 8`),
    db.$queryRaw<any[]>(Prisma.sql`SELECT s."isNew" AS nw, count(*) AS n, count(*) FILTER (WHERE s.converted) AS c ${base} GROUP BY 1`),
    db.$queryRaw<any[]>(Prisma.sql`SELECT count(*) AS n ${base}`),
  ])
  const total = Math.max(1, num(totalRow[0].n))
  const rate = (c: unknown, n: unknown) => pct(num(c), num(n))
  const share = (n: unknown) => pct(num(n), total)

  // what the hottest leads have in common, against everybody
  const profile: Audience['score']['profile'] = []
  const hotTotal = num(scoreBands[0].hot)
  if (hotTotal >= 3) {
    for (const [dim, expr] of [['Aparelho', 'coalesce(s.device, \'—\')'], ['Origem', 'coalesce(s.source, \'direct\')'], ['App de origem', 'coalesce(s."inApp", \'Navegador normal\')'], ['País', 'coalesce(s.country, \'??\')'], ['Marca', 'coalesce(s."deviceBrand", \'—\')']] as const) {
      const rows = await db.$queryRawUnsafe<any[]>(`SELECT ${expr} AS k, count(*)::int AS n, count(*) FILTER (WHERE s.score >= 70)::int AS hot FROM analytics_sessions s WHERE s."projectId" = $1 AND s."startedAt" >= $2 AND s."startedAt" <= $3 AND s."isBot" = false AND s.device IS NOT NULL AND s.mode = 'published' GROUP BY 1`, projectId, f.from, f.to)
      const all = rows.reduce((t, r) => t + r.n, 0) || 1
      for (const r of rows) {
        const hotShare = (r.hot / hotTotal) * 100, allShare = (r.n / all) * 100
        if (String(r.k) === '—' || String(r.k) === '??') continue
        if (r.hot >= 2 && allShare > 0) profile.push({ dim, key: String(r.k), hotShare: Math.round(hotShare * 10) / 10, allShare: Math.round(allShare * 10) / 10, lift: Math.round((hotShare / allShare) * 10) / 10 })
      }
    }
    profile.sort((a, b) => b.lift - a.lift || b.hotShare - a.hotShare)
  }
  const ret = (nw: boolean) => returning.find(r => r.nw === nw)
  const brandMap = new Map<string, { n: number; c: number }>()
  for (const m of models) { const b = brandMap.get(m.brand) || { n: 0, c: 0 }; b.n += num(m.n); b.c += num(m.c); brandMap.set(m.brand, b) }
  const bucketLabels = ['', 'Rápida (até 1,5 s)', 'Boa (até 2,5 s)', 'Lenta (até 4 s)', 'Muito lenta (mais de 4 s)']
  const measured = num(sp[0].m)
  return {
    models: models.map(m => ({ brand: m.brand, model: m.model, sessions: num(m.n), conversionRate: rate(m.c, m.n), share: share(m.n) })),
    brands: [...brandMap.entries()].map(([key, v]) => ({ key, sessions: v.n, conversionRate: rate(v.c, v.n), share: share(v.n) })).sort((a, b) => b.sessions - a.sessions).slice(0, 8),
    inApp: inApp.map(r => ({ key: r.k, sessions: num(r.n), conversions: num(r.c), conversionRate: rate(r.c, r.n), bounceRate: rate(r.b, r.n), share: share(r.n), avgScore: Math.round(num(r.sc)) })),
    screens: screens.map(r => ({ key: r.k, sessions: num(r.n), conversionRate: rate(r.c, r.n), share: share(r.n) })),
    connections: conns.map(r => ({ key: r.k, sessions: num(r.n), conversionRate: rate(r.c, r.n), share: share(r.n) })),
    speed: {
      measured, lcp: { p50: Math.round(num(sp[0].l50)), p75: Math.round(num(sp[0].l75)), p90: Math.round(num(sp[0].l90)) }, fcp75: Math.round(num(sp[0].f75)), ttfb75: Math.round(num(sp[0].t75)), cls75: Math.round(num(sp[0].c75) * 1000) / 1000, goodShare: pct(num(sp[0].good), measured),
      buckets: buckets.map(b => ({ label: bucketLabels[num(b.b)], sessions: num(b.n), share: pct(num(b.n), measured), bounceRate: rate(b.bounce, b.n), conversionRate: rate(b.c, b.n) })),
      byDevice: byDevice.map(r => ({ device: r.k, sessions: num(r.n), lcp75: Math.round(num(r.l75)) })),
      byInApp: byInApp.map(r => ({ key: r.k, sessions: num(r.n), lcp75: Math.round(num(r.l75)) })),
    },
    hours: hours.map(h => ({ dow: num(h.dow), hour: num(h.hr), sessions: num(h.n), conversions: num(h.c) })),
    score: {
      hot: num(scoreBands[0].hot), warm: num(scoreBands[0].warm), cold: num(scoreBands[0].cold), avg: Math.round(num(scoreBands[0].avg)),
      bySource: bySource.map(r => ({ key: r.k, sessions: num(r.n), avgScore: Math.round(num(r.sc)), hotShare: pct(num(r.hot), num(r.n)) })),
      profile: profile.slice(0, 8),
    },
    returning: { newSessions: num(ret(true)?.n), returningSessions: num(ret(false)?.n), newRate: rate(ret(true)?.c, ret(true)?.n), returningRate: rate(ret(false)?.c, ret(false)?.n) },
  }
}
