import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Clock, Globe, MoreHorizontal } from 'lucide-react'

const STATUS_LABELS = {
  PENDING: { label: 'Pendente', color: 'bg-gray-100 text-gray-600' },
  SCANNING: { label: 'Analisando...', color: 'bg-blue-100 text-blue-600' },
  CLONING: { label: 'Clonando...', color: 'bg-yellow-100 text-yellow-600' },
  READY: { label: 'Pronto', color: 'bg-green-100 text-green-600' },
  PUBLISHED: { label: 'Publicado', color: 'bg-brand-100 text-brand-700' },
  ERROR: { label: 'Erro', color: 'bg-red-100 text-red-600' },
} as const

const TYPE_ICONS = {
  LP: '📄',
  QUIZ: '❓',
  VSL: '🎬',
  CHECKOUT: '🛒',
  FUNNEL: '🔀',
}

export function ProjectCard({ project }: { project: any }) {
  const status = STATUS_LABELS[project.status as keyof typeof STATUS_LABELS] ?? STATUS_LABELS.PENDING
  const typeIcon = TYPE_ICONS[project.type as keyof typeof TYPE_ICONS] ?? '📄'

  return (
    <Link href={`/projects/${project.id}`} className="group block">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-brand-200 transition-all duration-200 overflow-hidden">
        {/* Thumbnail */}
        <div className="relative h-40 bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center">
          <span className="text-5xl">{typeIcon}</span>
          {project.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.thumbnail}
              alt={project.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div className="absolute top-2 right-2">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.color}`}>
              {status.label}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="p-4">
          <h3 className="font-semibold text-gray-900 truncate group-hover:text-brand-700">
            {project.name}
          </h3>
          <p className="text-xs text-gray-400 truncate mt-0.5">{project.sourceUrl}</p>
          <div className="flex items-center gap-1 mt-3 text-xs text-gray-400">
            <Clock className="h-3 w-3" />
            <span>
              {formatDistanceToNow(new Date(project.createdAt), {
                addSuffix: true,
                locale: ptBR
              })}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
