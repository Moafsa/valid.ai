import Link from 'next/link'
import { Globe2, Loader2, AlertCircle } from 'lucide-react'
import { DeleteProjectButton } from './delete-project-button'

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando',
  SCANNING: 'Clonando...',
  CLONING: 'Clonando...',
  READY: 'Pronto',
  PUBLISHED: 'Publicado',
  ERROR: 'Erro',
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function ProjectCard({ project }: { project: any }) {
  const isBusy = ['PENDING', 'SCANNING', 'CLONING'].includes(project.status)
  const isError = project.status === 'ERROR'

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-violet-500/40 hover:bg-white/[0.05]"
    >
      <DeleteProjectButton projectId={project.id} />

      <div className="relative aspect-[16/10] overflow-hidden bg-white/5">
        {project.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.thumbnail} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-950/40 to-blue-950/40">
            {isBusy ? (
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            ) : isError ? (
              <AlertCircle className="h-6 w-6 text-red-400" />
            ) : (
              <Globe2 className="h-6 w-6 text-gray-600" />
            )}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />
      </div>

      <div className="p-4">
        <h3 className="truncate text-sm font-semibold text-gray-100">{project.name}</h3>
        <p className="mt-0.5 truncate text-xs text-gray-500">{hostnameOf(project.sourceUrl)}</p>
        <div className="mt-3 flex items-center justify-between">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              isError
                ? 'bg-red-500/10 text-red-400'
                : isBusy
                ? 'bg-amber-500/10 text-amber-400'
                : 'bg-emerald-500/10 text-emerald-400'
            }`}
          >
            {STATUS_LABEL[project.status] ?? project.status}
          </span>
        </div>
      </div>
    </Link>
  )
}
