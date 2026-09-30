import { FolderOpen } from 'lucide-react'
import { ProjectCard } from './project-card'

export function ProjectGrid({ projects }: { projects: any[] }) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-16 text-center">
        <FolderOpen className="mb-3 h-9 w-9 text-gray-600" strokeWidth={1.5} />
        <h3 className="font-semibold text-gray-300">Nenhum projeto ainda</h3>
        <p className="mt-1 max-w-sm text-sm text-gray-500">
          Cole um link acima para clonar sua primeira página.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Seus projetos ({projects.length})
      </h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map(project => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  )
}
