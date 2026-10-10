import { db } from '@funnelai/db'
import { PlanUpsell } from '@/components/dashboard/plan-upsell'
import { PixelsPanel } from '@/components/dashboard/pixels-panel'
import { featureGate } from '@/lib/plans'
import { readPixelSettings, readTrackingConfig, type Integration } from '@/lib/pixels'
import { detectProject, pixelOverview } from '@/lib/pixels-server'

/** The "Pixels e Eventos" tab of a project: locked when the plan does not include it, otherwise the panel with everything loaded. */
export async function PixelsTab({ project, workspace }: { project: { id: string; slug: string | null; status: string; pixelSettings: unknown }; workspace: { planKey: string; subscriptionStatus: string; planUntil: Date | null } }) {
  const gate = await featureGate(workspace, 'pixels')
  if (!gate.ok) return <PlanUpsell title="Pixels e eventos" message={gate.message} />
  const [rows, detected, overview] = await Promise.all([
    db.projectTracking.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' } }),
    detectProject(project.id),
    pixelOverview(project.id, 30),
  ])
  return (
    <PixelsPanel
      initial={{
        projectId: project.id, published: project.status === 'PUBLISHED', slug: project.slug,
        settings: readPixelSettings(project.pixelSettings),
        integrations: rows.map(r => { const c = readTrackingConfig(r.config); return { id: r.id, type: r.type as Integration, pixelId: r.pixelId, isActive: r.isActive, config: { label: c.label, map: c.map, hasCode: !!c.code } } }),
        detected, overview,
      }}
    />
  )
}
