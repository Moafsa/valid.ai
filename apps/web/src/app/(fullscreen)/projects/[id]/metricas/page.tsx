import { notFound } from 'next/navigation'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { AnalyticsCenter } from '@/components/analytics/center'
import { MetricsLocked } from '@/components/analytics/locked'

export const dynamic = 'force-dynamic'

export default async function MetricsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workspace = await getCurrentWorkspace()
  if (!workspace) notFound()
  const project = await db.project.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true, name: true, slug: true, status: true } })
  if (!project) notFound()
  if (project.status !== 'PUBLISHED' || !project.slug) return <MetricsLocked projectId={project.id} name={project.name} />
  return <AnalyticsCenter projectId={project.id} projectName={project.name} slug={project.slug} published={project.status === 'PUBLISHED'} />
}
