import Link from 'next/link'
import { Globe2, Loader2, AlertCircle } from 'lucide-react'
import { DeleteProjectButton } from './delete-project-button'

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando',
  SCANNING: 'Clonando',
  CLONING: 'Clonando',
  READY: 'Pronto',
  PUBLISHED: 'Publicado',
  ERROR: 'Erro',
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function ProjectCard({ project }: { project: any }) {
  const isBusy = ['PENDING', 'SCANNING', 'CLONING'].includes(project.status)
  const isError = project.status === 'ERROR'
  const tone = isError ? 'bg-red-500/10 text-red-300' : isBusy ? 'bg-amber-500/10 text-amber-300' : project.status === 'PUBLISHED' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/[0.06] text-gray-300'
  const dot = isError ? 'bg-red-400' : isBusy ? 'bg-amber-400 animate-pulse' : project.status === 'PUBLISHED' ? 'bg-emerald-400' : 'bg-gray-400'

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition duration-300 hover:-translate-y-0.5 hover:border-violet-400/40 hover:bg-white/[0.055] hover:shadow-xl hover:shadow-violet-950/30"
    >
      <DeleteProjectButton projectId={project.id} />

      <div className="p-3 pb-0">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a0814]">
          <div className="flex items-center gap-1.5 border-b border-white/5 px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-white/15" /><span className="h-2 w-2 rounded-full bg-white/15" /><span className="h-2 w-2 rounded-full bg-white/15" />
          </div>
          <div className="relative aspect-[16/10] overflow-hidden bg-white/5">
            {project.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={project.thumbnail} alt="" className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-950/40 to-blue-950/40">
                {isBusy ? <Loader2 className="h-6 w-6 animate-spin text-violet-400" /> : isError ? <AlertCircle className="h-6 w-6 text-red-400" /> : <Globe2 className="h-6 w-6 text-gray-600" />}
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/50 to-transparent" />
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-100">{project.name}</h3>
          <p className="mt-0.5 truncate text-xs text-gray-500">{hostnameOf(project.sourceUrl)}</p>
        </div>
        <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
          {STATUS_LABEL[project.status] ?? project.status}
        </span>
      </div>
    </Link>
  )
}
