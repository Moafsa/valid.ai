import { db } from '@funnelai/db'
import { Prisma } from '@funnelai/db'
import { TZ } from './filters'

/** The numbers of every published page of an account over the last 7 days, for the dashboard's overview (one query for all of them). */
export interface ProjectPulse { sessions: number; conversions: number; leads: number; live: number; days: number[] }

export async function portfolio(projectIds: string[]): Promise<Map<string, ProjectPulse>> {
  const out = new Map<string, ProjectPulse>()
  if (!projectIds.length) return out
  const since = new Date(Date.now() - 7 * 86400_000)
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT s."projectId" AS p, to_char(date_trunc('day', (s."startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS d, count(*)::int AS n,
      count(*) FILTER (WHERE s.converted)::int AS c, count(*) FILTER (WHERE s."leadId" IS NOT NULL)::int AS l
    FROM analytics_sessions s WHERE s."projectId" IN (${Prisma.join(projectIds)}) AND s."startedAt" >= ${since} AND s."isBot" = false AND s.device IS NOT NULL AND s.mode = 'published' GROUP BY 1, 2`)
  const live = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT s."projectId" AS p, count(*)::int AS n FROM analytics_sessions s
    WHERE s."projectId" IN (${Prisma.join(projectIds)}) AND s."lastSeenAt" >= now() - interval '5 minutes' AND s."isBot" = false AND s.device IS NOT NULL AND s.mode = 'published' GROUP BY 1`)
  const dayKeys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400_000)
    return d.toLocaleDateString('en-CA', { timeZone: TZ })
  })
  for (const id of projectIds) out.set(id, { sessions: 0, conversions: 0, leads: 0, live: 0, days: new Array(7).fill(0) })
  for (const r of rows) {
    const o = out.get(r.p)!
    o.sessions += r.n; o.conversions += r.c; o.leads += r.l
    const i = dayKeys.indexOf(r.d)
    if (i >= 0) o.days[i] += r.n
  }
  for (const r of live) { const o = out.get(r.p); if (o) o.live = r.n }
  return out
}
