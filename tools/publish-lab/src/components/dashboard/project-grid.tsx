import { FolderOpen } from 'lucide-react'
import { ProjectCard } from './project-card'
import { NewCloneCard } from './new-clone-card'

export function ProjectGrid({ projects }: { projects: any[] }) {
  if (projects.length === 0) {
    return (
      <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-white/10 py-20 text-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/10 blur-[70px]" />
        <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"><FolderOpen className="h-6 w-6 text-gray-500" strokeWidth={1.5} /></div>
        <h3 className="relative font-semibold text-gray-200">Seus projetos aparecem aqui</h3>
        <p className="relative mt-1 max-w-sm text-sm text-gray-500">Cole um link acima e clone sua primeira página.</p>
      </div>
    )
  }

  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-white">Seus projetos</h2>
        <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-xs font-medium text-gray-400">{projects.length}</span>
        <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <NewCloneCard />
        {projects.map(project => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </section>
  )
}
