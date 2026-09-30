import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { ArrowLeft, Globe2, FileText, AlertTriangle, ExternalLink, Pencil } from 'lucide-react'
import { DeleteProjectButton } from '@/components/dashboard/delete-project-button'

export const dynamic = 'force-dynamic'

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workspace = await getCurrentWorkspace()
  if (!workspace) notFound()

  const project = await db.project.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { pages: { orderBy: { order: 'asc' } } },
  })
  if (!project) notFound()

  const isBusy = ['PENDING', 'SCANNING', 'CLONING'].includes(project.status)
  const stats = project.crawlStats as { found?: number; completed?: number; failed?: { url: string; error: string }[] } | null

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <DeleteProjectButton projectId={project.id} redirectTo="/dashboard" overlay={false} />
      </div>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
          <Globe2 className="h-5 w-5 text-gray-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">{project.name}</h1>
          <a href={project.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-gray-300">
            {project.sourceUrl}
          </a>
        </div>
      </div>

      {isBusy ? (
        <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-24 text-sm text-gray-500">
          Ainda clonando esta página...
        </div>
      ) : project.status === 'ERROR' ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-400">
          A clonagem falhou. Tente clonar novamente pelo dashboard.
        </div>
      ) : (
        <div className="space-y-6">
          {stats && (
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
              <span className="text-gray-300">
                <strong className="text-white">{stats.found ?? project.pages.length}</strong> página(s) encontrada(s)
              </span>
              <span className="text-emerald-400">
                <strong>{stats.completed ?? project.pages.length}</strong> clonada(s)
              </span>
              {!!stats.failed?.length && (
                <span className="flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <strong>{stats.failed.length}</strong> falhou/falharam
                </span>
              )}
            </div>
          )}

          {!!stats?.failed?.length && (
            <details className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-300">
              <summary className="cursor-pointer select-none font-medium">Ver páginas que falharam</summary>
              <ul className="mt-2 space-y-1">
                {stats.failed.map((f, i) => (
                  <li key={i} className="truncate">
                    {f.url}: <span className="text-amber-400/70">{f.error}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Páginas clonadas ({project.pages.length})
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {project.pages.map(page => (
                <div
                  key={page.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-200"
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <FileText className="h-4 w-4 shrink-0 text-gray-500" />
                    <span className="truncate">{page.name}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={`/projects/${project.id}/p/${page.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver página"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-white/10 hover:text-white"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <a
                      href={`/projects/${project.id}/editor/${page.slug}`}
                      title="Editar página"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-violet-400 hover:bg-violet-500/10"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
