export const dynamic = 'force-dynamic'

import { getAuthUser } from '@/lib/auth-helper'
import { db } from '@funnelai/db'
import { ProjectCard } from '@/components/dashboard/project-card'
import { NewProjectButton } from '@/components/dashboard/new-project-button'
import { StatsBar } from '@/components/dashboard/stats-bar'
import { creditLimitForPlan } from '@/lib/credits'

export default async function DashboardPage() {
  const { userId } = await getAuthUser()

  // TODO: scope by workspace
  const projects = await db.project.findMany({
    where: {},
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { pages: { take: 1 } },
  })

  const publishedCount = projects.filter(p => p.status === 'PUBLISHED').length
  const leadsCount = await db.lead.count({
    where: { projectId: { in: projects.map(p => p.id) } },
  })
  const workspace = await db.workspace.findFirst({ select: { aiCredits: true, plan: true } })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meus Projetos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Clone e otimize seus funis de vendas com IA
          </p>
        </div>
        <NewProjectButton />
      </div>

      <StatsBar
        projectCount={projects.length}
        publishedCount={publishedCount}
        leadsCount={leadsCount}
        aiCredits={workspace?.aiCredits ?? 0}
        creditLimit={creditLimitForPlan(workspace?.plan ?? 'FREE')}
      />

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20">
          <div className="text-6xl mb-4">🚀</div>
          <h3 className="text-lg font-semibold text-gray-700">Nenhum projeto ainda</h3>
          <p className="text-gray-400 mt-1 mb-6">Cole um link para começar a clonar seu primeiro funil</p>
          <NewProjectButton />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}
