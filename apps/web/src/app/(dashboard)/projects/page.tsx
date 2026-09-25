export const dynamic = 'force-dynamic'

import { getAuthUser } from '@/lib/auth-helper'
import { db } from '@funnelai/db'
import { ProjectCard } from '@/components/dashboard/project-card'
import { NewProjectButton } from '@/components/dashboard/new-project-button'
import { CloakerCheckButton } from '@/components/dashboard/cloaker-check-button'
import { Filter, Search } from 'lucide-react'

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>
}) {
  const filters = await searchParams
  const { userId } = await getAuthUser()
  const where: any = {}
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: 'insensitive' } },
      { sourceUrl: { contains: filters.q, mode: 'insensitive' } },
    ]
  }
  if (filters.type) where.type = filters.type
  if (filters.status) where.status = filters.status

  const projects = await db.project.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { pages: { take: 1 }, _count: { select: { pages: true } } },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projetos</h1>
          <p className="text-sm text-gray-500 mt-1">{projects.length} projetos encontrados</p>
        </div>
        <div className="flex items-center gap-3">
          <CloakerCheckButton />
          <NewProjectButton />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <form className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Buscar projetos..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </form>
        <select
          name="type"
          defaultValue={filters.type}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none"
        >
          <option value="">Todos os tipos</option>
          <option value="LP">Landing Page</option>
          <option value="QUIZ">Quiz</option>
          <option value="VSL">VSL</option>
          <option value="CHECKOUT">Checkout</option>
          <option value="FUNNEL">Funil</option>
        </select>
        <select
          name="status"
          defaultValue={filters.status}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none"
        >
          <option value="">Todos os status</option>
          <option value="READY">Prontos</option>
          <option value="PUBLISHED">Publicados</option>
          <option value="SCANNING">Escaneando</option>
          <option value="ERROR">Com erro</option>
        </select>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20">
          <div className="text-6xl mb-4">📁</div>
          <h3 className="text-lg font-semibold text-gray-700">Nenhum projeto encontrado</h3>
          <p className="text-gray-400 mt-1 mb-6">Tente ajustar os filtros ou crie um novo projeto</p>
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
