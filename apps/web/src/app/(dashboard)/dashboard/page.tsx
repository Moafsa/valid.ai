import { getCurrentWorkspace } from '@/lib/auth-helper'
import { db } from '@funnelai/db'
import { CloneHero } from '@/components/dashboard/clone-hero'
import { ProjectGrid } from '@/components/dashboard/project-grid'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const workspace = await getCurrentWorkspace()
  const projects = workspace
    ? await db.project.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: 'desc' },
      })
    : []

  return (
    <div className="space-y-12">
      <CloneHero />
      <ProjectGrid projects={projects} />
    </div>
  )
}
