import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { ArrowLeft, Globe2, FileText, AlertTriangle, ExternalLink, Pencil, Eye, Users } from 'lucide-react'
import { DeleteProjectButton } from '@/components/dashboard/delete-project-button'
import { ProjectNameEditor } from '@/components/dashboard/project-name-editor'
import { PublishProjectDialog } from '@/components/dashboard/publish-project-dialog'

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

  const [viewCount, leadCount, recentLeads] = isBusy
    ? [0, 0, []]
    : await Promise.all([
        db.pageEvent.count({ where: { projectId: id, type: 'view' } }),
        db.pageEvent.count({ where: { projectId: id, type: 'lead' } }),
        db.lead.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' }, take: 10 }),
      ])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div className="flex items-center gap-2">
          {!isBusy && <PublishProjectDialog projectId={project.id} currentSlug={project.slug} />}
          <DeleteProjectButton projectId={project.id} redirectTo="/dashboard" overlay={false} />
        </div>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
          <Globe2 className="h-5 w-5 text-gray-400" />
        </div>
        <div>
          <ProjectNameEditor projectId={project.id} initialName={project.name} />
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                <Eye className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">{viewCount}</p>
                <p className="text-xs text-gray-500">Visitantes</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                <Users className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">
                  {leadCount}
                  {viewCount > 0 && (
                    <span className="ml-1.5 text-xs font-normal text-gray-500">
                      ({((leadCount / viewCount) * 100).toFixed(1)}%)
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">Conversões (leads)</p>
              </div>
            </div>
          </div>

          {recentLeads.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Leads recentes</h2>
              <div className="space-y-2">
                {recentLeads.map(lead => {
                  const fields = lead.quizAnswers as Record<string, string>
                  return (
                    <div
                      key={lead.id}
                      className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-200">
                        {lead.name && <span className="font-medium text-white">{lead.name}</span>}
                        {lead.email && <span className="text-gray-400">{lead.email}</span>}
                        {lead.phone && <span className="text-gray-400">{lead.phone}</span>}
                        <span className="ml-auto text-xs text-gray-500">
                          {new Date(lead.createdAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      {!!fields && Object.keys(fields).length > 0 && (
                        <p className="mt-1 truncate text-xs text-gray-500">
                          {Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

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
