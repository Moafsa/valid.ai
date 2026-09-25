import { notFound } from 'next/navigation'
import { db } from '@funnelai/db'
import { AnalyticsDetail } from '@/components/analytics/analytics-detail'

// Canonical funnel steps, in the order a visitor would actually hit them.
// Only steps with at least one real event show up in the chart — there is
// no placeholder row for an LP's video checkpoints, or a VSL's quiz steps.
const FUNNEL_DEFINITION: { event: string; step?: string; label: string }[] = [
  { event: 'page_view', label: 'Visitantes' },
  { event: 'quiz_answer', label: 'Respondeu ao menos 1 pergunta' },
  { event: 'scroll', step: '25%', label: 'Rolou 25% da página' },
  { event: 'scroll', step: '50%', label: 'Rolou 50% da página' },
  { event: 'scroll', step: '75%', label: 'Rolou 75% da página' },
  { event: 'video_view', label: 'Viu o vídeo (embed)' },
  { event: 'video_play', label: 'Deu play no vídeo' },
  { event: 'video_progress', step: '25%', label: 'Vídeo — 25%' },
  { event: 'video_progress', step: '50%', label: 'Vídeo — 50%' },
  { event: 'video_progress', step: '75%', label: 'Vídeo — 75%' },
  { event: 'video_progress', step: '100%', label: 'Vídeo — 100%' },
  { event: 'cta_click', label: 'Clicou no CTA' },
  { event: 'lead_capture', label: 'Virou lead' },
]

export default async function AnalyticsProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { pages: { orderBy: { order: 'asc' } } },
  })
  if (!project) notFound()

  const leads = await db.lead.findMany({ where: { projectId } })
  const totalSessions = leads.length
  const leadsCaptured = leads.filter(l => !!l.email || !!l.phone).length

  const funnel = FUNNEL_DEFINITION.map(def => {
    const count = leads.filter(l => {
      const timeline = Array.isArray(l.timeline) ? (l.timeline as any[]) : []
      return timeline.some(e => e.event === def.event && (!def.step || e.step === def.step))
    }).length
    return { ...def, sessions: count }
  }).filter(f => f.sessions > 0)

  // First real funnel row anchors the 100% bar width and the drop-off math.
  const base = funnel[0]?.sessions ?? 0
  const funnelWithDropoff = funnel.map((f, i) => ({
    ...f,
    widthPercent: base > 0 ? (f.sessions / base) * 100 : 0,
    dropoffPercent: i === 0 || funnel[i - 1].sessions === 0
      ? 0
      : ((funnel[i - 1].sessions - f.sessions) / funnel[i - 1].sessions) * 100,
  }))

  const stats = {
    totalSessions,
    leadsCaptured,
    conversionRate: totalSessions > 0 ? (leadsCaptured / totalSessions) * 100 : 0,
  }

  return <AnalyticsDetail project={project} stats={stats} funnel={funnelWithDropoff} />
}
