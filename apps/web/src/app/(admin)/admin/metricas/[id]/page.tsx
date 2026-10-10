import { notFound, redirect } from 'next/navigation'
import { db } from '@funnelai/db'
import { currentAdmin } from '@/lib/admin'
import { AnalyticsCenter } from '@/components/analytics/center'

export const dynamic = 'force-dynamic'

/** The same analytics center, opened by the administrator on any customer's published project. */
export default async function AdminMetricsPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) redirect('/admin/login')
  const { id } = await params
  const project = await db.project.findUnique({ where: { id }, select: { id: true, name: true, slug: true, status: true } })
  if (!project || project.status !== 'PUBLISHED' || !project.slug) notFound()
  return <AnalyticsCenter projectId={project.id} projectName={project.name} slug={project.slug} published backHref="/admin?aba=usuarios" />
}
