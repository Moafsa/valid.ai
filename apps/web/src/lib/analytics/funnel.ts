import { db } from '@funnelai/db'
import { Prisma } from '@funnelai/db'
import { num, pct, sessionWhere, type Filters } from './filters'

/**
 * The journey of the lead as a funnel: how many visits got to each stage and what they did instead of going on.
 * Every stage is something the collector recorded (a click, a video, a form, a page), never a guess.
 */
export interface JourneyStep {
  key: string; label: string; count: number
  /** share of the first stage */
  ofTotal: number
  /** share of the stage before */
  ofPrev: number
  /** people who were at the stage before and did not get here */
  lost: number
  /** the page where most of them ended their visit */
  lostAt: { slug: string; count: number } | null
  hint?: string
}

export async function journey(projectId: string, f: Filters): Promise<{ steps: JourneyStep[]; origins: { source: string; sessions: number }[]; entry: { slug: string; sessions: number }[] }> {
  const where = sessionWhere(projectId, f)
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT coalesce(s."exitSlug", s."landingSlug", '?') AS slug,
      s.interacted AS f2, (s."videoPlays" > 0) AS f3, (s."videoMaxPct" >= 50) AS f4, (s."ctaClicks" > 0) AS f5, (s."pageCount" >= 2) AS f6,
      (s."formStarts" > 0 OR s."leadId" IS NOT NULL OR EXISTS (SELECT 1 FROM analytics_events e WHERE e."sessionId" = s.id AND e.type = 'checkout')) AS f7,
      s.converted AS f8, count(*) AS n
    FROM analytics_sessions s WHERE ${where} GROUP BY 1, 2, 3, 4, 5, 6, 7, 8`)
  const defs: { key: string; label: string; hint?: string }[] = [
    { key: 'f1', label: 'Chegaram na página' },
    { key: 'f2', label: 'Interagiram', hint: 'clicaram, rolaram 25% ou mais, ou usaram o vídeo' },
    { key: 'f3', label: 'Começaram o vídeo' },
    { key: 'f4', label: 'Passaram de 50% do vídeo' },
    { key: 'f5', label: 'Clicaram no botão principal', hint: 'qualquer botão de chamada para ação' },
    { key: 'f6', label: 'Foram para a próxima página' },
    { key: 'f7', label: 'Checkout ou formulário', hint: 'abriram o checkout, começaram a preencher ou viraram lead' },
    { key: 'f8', label: 'Converteram' },
  ]
  // a stage counts everyone who got AT LEAST that far (someone who bought has also, one way or another, gone past the earlier stages),
  // so each bar is never bigger than the one before it
  const order = defs.map(d => d.key)
  const has = (r: any, k: string) => k === 'f1' ? true : order.slice(order.indexOf(k)).some(j => !!r[j])
  const counts = defs.map(d => rows.filter(r => has(r, d.key)).reduce((t, r) => t + num(r.n), 0))
  // a stage nobody actually went through on this site (no video, no second page) is left out instead of drawn as a hole
  const actual = defs.map(d => (d.key === 'f1' ? 1 : rows.filter(r => !!r[d.key]).reduce((t, r) => t + num(r.n), 0)))
  const keep = defs.map((d, i) => i === 0 || i === defs.length - 1 || actual[i] > 0)
  const steps: JourneyStep[] = []
  let prevIdx = -1
  defs.forEach((d, i) => {
    if (!keep[i]) return
    const count = counts[i]
    const prev = prevIdx >= 0 ? counts[prevIdx] : count
    const prevKey = prevIdx >= 0 ? defs[prevIdx].key : null
    // visits that were at the previous stage and are not at this one: where did they end up?
    const lostRows = prevKey ? rows.filter(r => has(r, prevKey) && !has(r, d.key)) : []
    const byExit = new Map<string, number>()
    for (const r of lostRows) byExit.set(r.slug, (byExit.get(r.slug) || 0) + num(r.n))
    const top = [...byExit.entries()].sort((a, b) => b[1] - a[1])[0]
    steps.push({
      key: d.key, label: d.label, count, ofTotal: pct(count, counts[0] || 1), ofPrev: prevIdx >= 0 ? pct(count, prev) : 100, lost: prevIdx >= 0 ? Math.max(0, prev - count) : 0,
      lostAt: top ? { slug: top[0], count: top[1] } : null, hint: d.hint,
    })
    prevIdx = i
  })
  const origins = await db.$queryRaw<any[]>(Prisma.sql`SELECT coalesce(s."source", 'direct') AS source, count(*) AS n FROM analytics_sessions s WHERE ${where} GROUP BY 1 ORDER BY n DESC LIMIT 6`)
  const entry = await db.$queryRaw<any[]>(Prisma.sql`SELECT coalesce(s."landingSlug", '?') AS slug, count(*) AS n FROM analytics_sessions s WHERE ${where} GROUP BY 1 ORDER BY n DESC LIMIT 5`)
  return { steps, origins: origins.map(o => ({ source: o.source, sessions: num(o.n) })), entry: entry.map(o => ({ slug: o.slug, sessions: num(o.n) })) }
}

/** the paths people take: page -> page, most common first (a "Sankey" in a list) */
export async function paths(projectId: string, f: Filters): Promise<{ from: string; to: string; sessions: number }[]> {
  const where = sessionWhere(projectId, f)
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    WITH s AS (SELECT id FROM analytics_sessions s WHERE ${where}),
    seq AS (
      SELECT p."sessionId", p.slug, lead(p.slug) OVER (PARTITION BY p."sessionId" ORDER BY p.seq) AS next
      FROM analytics_pageviews p JOIN s ON s.id = p."sessionId" WHERE p.slug IS NOT NULL
    )
    SELECT slug AS "from", coalesce(next, '(saiu)') AS "to", count(DISTINCT "sessionId") AS n FROM seq WHERE next IS DISTINCT FROM slug GROUP BY 1, 2 ORDER BY n DESC LIMIT 20`)
  return rows.map(r => ({ from: r.from, to: r.to, sessions: num(r.n) }))
}
