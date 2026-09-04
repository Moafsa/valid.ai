import { notFound } from 'next/navigation'
import { db } from '@funnelai/db'
import { AnalyticsDetail } from '@/components/analytics/analytics-detail'

export default async function AnalyticsProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { pages: { orderBy: { order: 'asc' } } },
  })
  if (!project) notFound()

  return <AnalyticsDetail project={project} />
}
