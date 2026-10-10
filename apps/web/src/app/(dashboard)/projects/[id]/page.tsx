import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { ArrowLeft, Globe2, FileText, AlertTriangle, ExternalLink, Pencil, Eye, Users, Play, GitBranch, BarChart3, Layers, Radar } from 'lucide-react'
import { DeleteProjectButton } from '@/components/dashboard/delete-project-button'
import { ProjectNameEditor } from '@/components/dashboard/project-name-editor'
import { PublishProjectDialog } from '@/components/dashboard/publish-project-dialog'
import { FlowDashboard } from '@/components/dashboard/flow-dashboard'
import { MetricsHub } from '@/components/dashboard/metrics-hub-loader'
import { PixelsTab } from '@/components/dashboard/pixels-tab'
import { PixelMetricsCard } from '@/components/dashboard/pixel-metrics-card'
import { CloneReviewCard, type CloneReview } from '@/components/dashboard/clone-review-card'
import { funnelStats } from '@/lib/funnel-stats'
import { listFlowLinks } from '@/lib/clone-flow'
import { videoStats } from '@/lib/video-stats'
import { listPageVideos, START_LABEL, PAUSE_LABEL, BAR_LABEL } from '@/lib/page-videos'

export const dynamic = 'force-dynamic'

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; pg?: string }> }) {
  const { id } = await params
  const { aba, pg } = await searchParams
  const workspace = await getCurrentWorkspace()
  if (!workspace) notFound()

  const found = await db.project.findFirst({ where: { id, workspaceId: workspace.id } })
  if (!found) notFound()
  // the list of pages is cheap (names only); a page's whole content is read only by the tabs that need it,
  // because a funnel can have hundreds of steps
  const pageList = await db.page.findMany({ where: { projectId: id, NOT: { slug: { endsWith: '__m' } } }, orderBy: { order: 'asc' }, select: { id: true, name: true, slug: true } })
  const project = { ...found, pages: pageList }

  const tabsWanted = aba === 'fluxo' || aba === 'metricas' || aba === 'pixels' ? aba : 'paginas'
  const FULL_CAP = 400
  const fullPages =
    tabsWanted === 'paginas' || tabsWanted === 'pixels'
      ? []
      : await db.page.findMany({ where: { projectId: id, NOT: { slug: { endsWith: '__m' } } }, orderBy: { order: 'asc' }, take: FULL_CAP, select: { slug: true, name: true, blocks: true, shell: true } })

  // a funnel = several pages whose buttons point at each other
  const funnelSteps = tabsWanted === 'fluxo'
    ? fullPages.map(p => ({
        slug: p.slug,
        name: p.name,
        links: listFlowLinks(Array.isArray(p.blocks) ? (p.blocks as any[]) : []),
        rules: Array.isArray((p.shell as any)?.rules) ? ((p.shell as any).rules as any[]) : [],
      }))
    : []
  const hasFlowTab = pageList.length > 1
  // numbers for the funnel map (the phone versions of a page count as that page)
  let flowStats: Awaited<ReturnType<typeof funnelStats>> | null = null
  if (tabsWanted === 'fluxo' && funnelSteps.length > 0) {
    const allIds = await db.page.findMany({ where: { projectId: id }, select: { id: true, slug: true } })
    flowStats = await funnelStats(id, allIds.map(p => ({ id: p.id, slug: p.slug.replace(/__m$/, '') })))
  }
  const sourceHost = (() => { try { return new URL(project.sourceUrl).host } catch { return null } })()

  const isBusy = ['PENDING', 'SCANNING', 'CLONING'].includes(project.status)
  const stats = project.crawlStats as { found?: number; completed?: number; failed?: { url: string; error: string }[]; notes?: string[]; review?: CloneReview } | null
  // the check now happens INSIDE the clone job (before it is saved): when the project shows up, the answer is already here, so there is nothing to wait for
  const reviewWaiting = false

  const videos = isBusy ? [] : await videoStats(id)
  const pageVideos = isBusy || tabsWanted !== 'metricas' ? [] : fullPages.flatMap(p => listPageVideos(p))
  const statBySrc = new Map(videos.map(v => [v.src, v]))
  const tabs = [
    { key: 'paginas', label: project.pages.length > 1 && project.pages.every(p => /^Etapa \d+/.test(p.name)) ? 'Etapas' : 'Páginas', icon: Layers, show: true },
    { key: 'fluxo', label: 'Fluxo', icon: GitBranch, show: hasFlowTab },
    { key: 'metricas', label: 'Métricas', icon: BarChart3, show: true },
    { key: 'pixels', label: 'Pixels e Eventos', icon: Radar, show: true },
  ].filter(t => t.show)
  const tab = tabs.some(t => t.key === aba) ? (aba as string) : 'paginas'
  const PER = 48
  const pgNum = Math.max(0, parseInt(pg || '0', 10) || 0)
  const pagesView = pageList.slice(pgNum * PER, pgNum * PER + PER)
  const pgCount = Math.max(1, Math.ceil(pageList.length / PER))
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
          <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {tabs.map(t => (
              <Link
                key={t.key}
                href={t.key === 'paginas' ? `/projects/${project.id}` : `/projects/${project.id}?aba=${t.key}`}
                scroll={false}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  tab === t.key ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </Link>
            ))}
          </div>

          {tab === 'paginas' && (
            <>
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

          <CloneReviewCard review={stats?.review ?? null} waiting={reviewWaiting} />

          {!!stats?.notes?.length && (
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs text-sky-200">
              <p className="mb-1.5 font-medium text-sky-300">O que o clone encontrou</p>
              <ul className="list-inside list-disc space-y-1 text-sky-200/80">
                {stats.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
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
              {project.pages.length > 1 && project.pages.every(p => /^Etapa \d+/.test(p.name)) ? 'Etapas do funil' : 'Páginas clonadas'} ({project.pages.length})
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pagesView.map(page => (
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
              {pgCount > 1 && (
                <div className="col-span-full flex items-center justify-center gap-3 pt-2 text-xs text-gray-400">
                  {pgNum > 0 ? (
                    <Link href={`/projects/${project.id}?pg=${pgNum - 1}`} className="rounded-lg bg-white/5 px-3 py-1.5 hover:bg-white/10">Anterior</Link>
                  ) : <span className="px-3 py-1.5 opacity-30">Anterior</span>}
                  <span>{pgNum + 1} / {pgCount} ({pageList.length} etapas)</span>
                  {pgNum < pgCount - 1 ? (
                    <Link href={`/projects/${project.id}?pg=${pgNum + 1}`} className="rounded-lg bg-white/5 px-3 py-1.5 hover:bg-white/10">Próxima</Link>
                  ) : <span className="px-3 py-1.5 opacity-30">Próxima</span>}
                </div>
              )}
            </div>
          </div>

            </>
          )}

          {tab === 'fluxo' && (
            <>
          {funnelSteps.length > 0 && flowStats && (
            <div>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight text-white">Fluxo do funil</h2>
                <p className="mt-0.5 text-sm text-zinc-500">Veja o caminho de quem passa por aqui, onde as pessoas travam e pra onde cada botão leva. A mudança vale na hora na página publicada.</p>
              </div>
              <FlowDashboard projectId={project.id} steps={funnelSteps} stats={flowStats} sourceHost={sourceHost} basePath={`/projects/${project.id}/p`} />
            </div>
          )}
            </>
          )}

          {tab === 'pixels' && <PixelsTab project={found} workspace={workspace} />}

          {tab === 'metricas' && (
            <>
          <MetricsHub projectId={id} published={project.status === 'PUBLISHED'} />

          <PixelMetricsCard projectId={id} workspace={workspace} />

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

          <div>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">Vídeos ({pageVideos.length})</h2>
            <p className="mb-3 text-xs text-gray-500">
              O player do clone segue as regras do original. Pra mudar uma regra (começar ao clicar, bloquear pausa, tempo do botão), abra a página no editor e clique no vídeo.
            </p>
            {pageVideos.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-gray-500">
                Nenhum vídeo encontrado nas páginas desse clone.
              </div>
            ) : (
              <div className="space-y-3">
                {pageVideos.map(v => {
                  const st = statBySrc.get(v.src)
                  return (
                    <div key={`${v.pageSlug}-${v.idx}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="mb-3 flex items-start gap-3">
                        <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black">
                          {v.poster ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.poster} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <Play className="h-5 w-5 text-gray-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{v.pageName}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {[START_LABEL[v.start], PAUSE_LABEL[v.pause], BAR_LABEL[v.bar], v.seek ? 'Pode pular' : 'Não pula pra frente', v.fullscreen ? 'Tela cheia' : null]
                              .filter(Boolean)
                              .map(t => (
                                <span key={t as string} className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-gray-300">{t}</span>
                              ))}
                            {v.pitchAt.length > 0 && (
                              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-300">
                                Botão aparece aos {v.pitchAt.map(n => `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}`).join(', ')}
                              </span>
                            )}
                            {v.rules.map(r => (
                              <span key={r.trigger} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
                                {r.trigger === 'video-pause' ? 'Ao pausar' : r.trigger === 'video-end' ? 'Ao terminar' : 'Regra do vídeo'} leva pra {r.goto || 'outra página'}
                              </span>
                            ))}
                          </div>
                        </div>
                        <a
                          href={`/projects/${project.id}/editor/${v.pageSlug}`}
                          title="Editar"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-violet-400 hover:bg-violet-500/10"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      {st ? (
                        <>
                          <p className="mb-3 text-xs text-gray-400">
                            <strong className="text-white">{st.plays}</strong> começaram a assistir · ficaram em média <strong className="text-white">{st.avgWatch}</strong>
                            {st.pauses > 0 && <> · <strong className="text-white">{st.pauses}</strong> pausaram</>}
                          </p>
                          <div className="space-y-1.5">
                            {st.milestones.map(m => (
                              <div key={m.label} className="flex items-center gap-2 text-xs">
                                <span className="w-24 shrink-0 text-gray-400">{m.label}</span>
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500" style={{ width: `${m.pct}%` }} />
                                </div>
                                <span className="w-16 shrink-0 text-right text-gray-300">{m.pct}% ({m.count})</span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-gray-500">Ainda sem visualizações. Assim que alguém assistir, as métricas aparecem aqui.</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

            </>
          )}
        </div>
      )}
    </div>
  )
}
