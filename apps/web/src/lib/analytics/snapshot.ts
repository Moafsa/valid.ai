import { db } from '@funnelai/db'
import { audience, type Audience } from './audience'
import { abandonment, attentionElements, frictions, type Abandonment, type AttentionElement, type Friction } from './behaviour'
import { experimentResults } from './experiments'
import type { Filters } from './filters'
import { journey, type JourneyStep } from './funnel'
import { breakdown, pagesTable, previousPeriod, totals, type BreakdownRow, type PageRow, type Totals } from './queries'
import { retention, videoList, type Retention, type VideoSummary } from './video'

/** Everything the insights are written from: one pass over the real data of the chosen period. */
export interface Snapshot {
  filters: { from: string; to: string }
  totals: Totals
  previous: Totals
  sources: BreakdownRow[]
  campaigns: BreakdownRow[]
  devices: BreakdownRow[]
  pages: PageRow[]
  abandon: Abandonment[]
  friction: Awaited<ReturnType<typeof frictions>>
  attention: AttentionElement[]
  videos: VideoSummary[]
  retention: Retention | null
  steps: JourneyStep[]
  audience: Audience
  experiments: { id: string; name: string; status: string; leader: string | null; enough: boolean; variants: { name: string; sessions: number; conversionRate: number; confidence: number | null; lift: number | null }[] }[]
}

export async function buildSnapshot(projectId: string, f: Filters): Promise<Snapshot> {
  const [t, prev, sources, campaigns, devices, pages, abandon, friction, videos, j, exps, aud] = await Promise.all([
    totals(projectId, f), totals(projectId, previousPeriod(f)),
    breakdown(projectId, f, 'source', { limit: 8 }), breakdown(projectId, f, 'campaign', { limit: 8 }), breakdown(projectId, f, 'device', { limit: 4 }),
    pagesTable(projectId, f), abandonment(projectId, f), frictions(projectId, f), videoList(projectId, f), journey(projectId, f),
    db.experiment.findMany({ where: { projectId, status: 'running' }, orderBy: { createdAt: 'desc' }, take: 4 }),
    audience(projectId, f),
  ])
  const attention = await attentionElements(projectId, f, t.conversionRate)
  const main = videos.find(v => !v.embedded && v.plays > 0)
  const ret = main ? await retention(projectId, f, main.src) : null
  const experiments: Snapshot['experiments'] = []
  for (const e of exps) {
    const r = await experimentResults(projectId, e.id)
    if (r) experiments.push({ id: e.id, name: e.name, status: e.status, leader: r.leader, enough: r.enough, variants: r.variants.map(v => ({ name: v.name, sessions: v.sessions, conversionRate: v.conversionRate, confidence: v.confidence, lift: v.lift })) })
  }
  return {
    filters: { from: f.from.toISOString(), to: f.to.toISOString() }, totals: t, previous: prev, sources, campaigns, devices, pages, abandon, friction, attention, videos, retention: ret, steps: j.steps, audience: aud, experiments,
  }
}
