import { parseFilters } from '@/lib/analytics/filters'
import { previousPeriod, timeseries, totals } from '@/lib/analytics/queries'
import { buildSnapshot } from '@/lib/analytics/snapshot'
import { buildInsights } from '@/lib/analytics/insights'
import { MetricsHubView, type HubData } from './metrics-hub'

/** Reads the last 7 days of the published page and hands them to the card; while the page is not published there is nothing to read. */
export async function MetricsHub({ projectId, published }: { projectId: string; published: boolean }) {
  if (!published) return <MetricsHubView projectId={projectId} data={null} />
  const f = parseFilters(new URLSearchParams('period=7d'))
  const [t, before, series, snap] = await Promise.all([totals(projectId, f), totals(projectId, previousPeriod(f)), timeseries(projectId, f), buildSnapshot(projectId, f)])
  const insights = buildInsights(snap)
  const data: HubData = {
    totals: { sessions: t.sessions, visitors: t.visitors, conversions: t.conversions, conversionRate: t.conversionRate, avgActiveSec: t.avgActiveSec, avgScroll: t.avgScroll },
    previousSessions: before.sessions, bucket: series.bucket, series: series.points.map(x => x.sessions),
    summary: insights.find(i => i.kind === 'resumo')?.text ?? null,
    found: insights.filter(i => i.kind !== 'resumo').slice(0, 3).map(i => ({ id: i.id, kind: i.kind, title: i.title })),
  }
  return <MetricsHubView projectId={projectId} data={data} />
}
