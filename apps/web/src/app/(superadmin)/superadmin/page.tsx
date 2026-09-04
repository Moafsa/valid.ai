export const dynamic = 'force-dynamic'

import { db } from '@funnelai/db'
import { AdminStatCard } from '@/components/superadmin/stat-card'
import { RecentActivity } from '@/components/superadmin/recent-activity'

export default async function SuperAdminPage() {
  const [
    totalWorkspaces,
    totalProjects,
    totalLeads,
    last30dCost,
    last30dCreditsUsed,
  ] = await Promise.all([
    db.workspace.count(),
    db.project.count(),
    db.lead.count(),
    db.aiUsageLog.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
    db.aiUsageLog.aggregate({
      _sum: { creditsUsed: true },
      where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
  ])

  const recentLogs = await db.aiUsageLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  const costUsd = last30dCost._sum.costUsd ?? 0
  const creditsConsumed = last30dCreditsUsed._sum.creditsUsed ?? 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">SuperAdmin</h1>
        <p className="text-gray-400 mt-1">Painel de controle da plataforma Valid.ai</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <AdminStatCard label="Workspaces" value={totalWorkspaces} icon="🏢" color="blue" />
        <AdminStatCard label="Projetos" value={totalProjects} icon="📁" color="purple" />
        <AdminStatCard label="Leads capturados" value={totalLeads} icon="👥" color="green" />
        <AdminStatCard
          label="Custo IA (30d)"
          value={`$${costUsd.toFixed(2)}`}
          icon="🤖"
          color="orange"
          subtitle={`${creditsConsumed} créditos consumidos`}
        />
      </div>

      <RecentActivity logs={recentLogs} />
    </div>
  )
}
