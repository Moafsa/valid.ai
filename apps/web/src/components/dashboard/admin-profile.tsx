import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { db } from '@funnelai/db'
import { ManualPayment, WorkspaceActions } from '@/components/dashboard/admin-actions'
import { Panel, Stat, planCls, projectState } from '@/components/dashboard/admin-tabs'
import { LIMIT_DEFS, LIMIT_KEYS, fmtLimit, entitlementsOf, listPlans, usageOf } from '@/lib/plans'
import { DAY, OPERATION, PAID, STANDING, ago, brl, cloneOutcomes, lastActivity, loadPeople, n, standing, when } from '@/lib/admin-data'

const th = 'px-3 py-2 font-medium'
const head = 'bg-white/[0.04] text-left text-[11px] uppercase tracking-wide text-gray-500'

/** One customer's whole account: who they are, what they use, what they pay, what went wrong. Returns null when the account does not exist. */
export async function UserProfile({ id }: { id: string }) {
  const ws = await db.workspace.findUnique({ where: { id }, include: { members: true } })
  if (!ws) return null
  const now = Date.now(), d30 = new Date(now - 30 * DAY), d7 = new Date(now - 7 * DAY)
  const people = await loadPeople(ws.members.map(m => m.clerkUserId))
  const projects = await db.project.findMany({ where: { workspaceId: id }, orderBy: { updatedAt: 'desc' }, include: { _count: { select: { pages: true } } } })
  const pids = projects.map(p => p.id)
  const [published, visits, leads, ai30, aiByOp, aiRecent, txs, payments, scans, clones, feedback, activity, outcomes] = await Promise.all([
    db.publishedPage.findMany({ where: { projectId: { in: pids } }, orderBy: { order: 'asc' }, select: { projectId: true, pageSlug: true, name: true } }),
    db.analyticsSession.groupBy({ by: ['projectId'], where: { projectId: { in: pids }, startedAt: { gte: d30 }, isBot: false, mode: 'published' }, _count: true }),
    db.lead.groupBy({ by: ['projectId'], where: { projectId: { in: pids } }, _count: true }),
    db.aiUsageLog.aggregate({ where: { workspaceId: id, createdAt: { gte: d30 } }, _count: true, _sum: { costUsd: true, creditsUsed: true } }),
    db.aiUsageLog.groupBy({ by: ['operation'], where: { workspaceId: id, createdAt: { gte: d30 } }, _count: true }),
    db.aiUsageLog.findMany({ where: { workspaceId: id }, orderBy: { createdAt: 'desc' }, take: 8 }),
    db.creditTransaction.findMany({ where: { workspaceId: id }, orderBy: { createdAt: 'desc' }, take: 15 }),
    db.asaasPayment.findMany({ where: { workspaceId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    db.scanJob.findMany({ where: { project: { workspaceId: id } }, orderBy: { createdAt: 'desc' }, take: 25, select: { id: true, url: true, status: true, errorMsg: true, createdAt: true } }),
    Promise.all([db.scanJob.count({ where: { project: { workspaceId: id }, status: 'DONE', createdAt: { gte: d30 } } }), db.scanJob.count({ where: { project: { workspaceId: id }, status: 'ERROR', createdAt: { gte: d30 } } })]),
    db.feedback.findMany({ where: { workspaceId: id }, orderBy: { createdAt: 'desc' }, take: 10 }),
    lastActivity(), cloneOutcomes(d7),
  ])
  const [ent, usage, plansList] = await Promise.all([entitlementsOf(ws), usageOf(id), listPlans()])
  const ppl = ws.members.map(m => ({ m, p: people.get(m.clerkUserId) }))
  const person = ppl.find(x => x.p?.name)?.p || ppl.find(x => x.p)?.p
  const name = person?.name || ws.name
  const emails = ppl.map(x => x.p?.email).filter(Boolean) as string[]
  const seen = Math.max(0, ...ppl.map(x => x.p?.lastSignInAt || 0), activity.get(id) || 0)
  const state = standing(ws.createdAt, seen, outcomes.get(id))
  const paidTotal = payments.filter(p => PAID.includes(p.status)).reduce((a, p) => a + p.value, 0)

  const vis = new Map(visits.map(v => [v.projectId, v._count])), ld = new Map(leads.map(l => [l.projectId, l._count]))
  const pagesOf = (pid: string) => published.filter(p => p.projectId === pid)
  const live = projects.filter(p => p.status === 'PUBLISHED')
  const used = ai30._sum.creditsUsed || 0
  const [cloneOk, cloneErr] = clones

  const failedPages = projects.flatMap(p => (Array.isArray((p.crawlStats as any)?.failed) ? ((p.crawlStats as any).failed as any[]).map(f => ({ project: p.name, text: f.error || f.url || 'página sem resposta' })) : [])).slice(0, 8)
  const scanErrors = scans.filter(s => s.status === 'ERROR').slice(0, 8)
  const feedbackErrors = feedback.filter(f => ['site_not_cloning', 'clone_error', 'bug'].includes(f.kind) && f.status !== 'done')
  const hasErrors = scanErrors.length + failedPages.length + feedbackErrors.length > 0

  const timeline: { at: Date; text: string; tone?: 'bad' | 'good' }[] = [
    ...projects.map(p => ({ at: p.createdAt, text: `Criou o projeto “${p.name}”` })),
    ...projects.filter(p => p.publishedAt).map(p => ({ at: p.publishedAt as Date, text: `Publicou “${p.name}”`, tone: 'good' as const })),
    ...scans.map(s => ({ at: s.createdAt, text: s.status === 'ERROR' ? `Clonagem com erro: ${s.url}` : s.status === 'DONE' ? `Clonou ${s.url}` : `Clonagem em andamento: ${s.url}`, tone: s.status === 'ERROR' ? 'bad' as const : undefined })),
    ...txs.map(t => ({ at: t.createdAt, text: `${t.description} (${t.amount > 0 ? '+' : ''}${t.amount} créditos)` })),
    ...payments.map(p => ({ at: p.createdAt, text: `Pagamento de ${brl(p.value)} (${p.billingType}, ${p.status})`, tone: PAID.includes(p.status) ? 'good' as const : undefined })),
    ...feedback.map(f => ({ at: f.createdAt, text: `Enviou uma mensagem (${f.kind})` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 20)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin?aba=usuarios" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Usuários</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{name}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${planCls(ent.plan.priceCents ? 'PAID' : 'FREE')}`}>{ent.plan.name}</span>{ent.state === 'lapsed' && <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs text-red-300">assinatura vencida</span>}{ent.state === 'grace' && <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs text-amber-300">em atraso</span>}
          <span className={`rounded-full px-2.5 py-0.5 text-xs ${STANDING[state].cls}`}>{STANDING[state].label}</span>
        </div>
        <p className="mt-1 text-sm text-gray-400">{emails.join(', ') || 'sem e-mail registrado'} · criada em {when(ws.createdAt)} · último acesso {seen ? ago(seen) : '—'}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Plano" value={ent.plan.name} sub={paidTotal > 0 ? `pagou ${brl(paidTotal)} no total` : 'nunca pagou'} />
        <Stat label="Créditos de IA no mês" value={ent.limits.aiCalls === null ? n(usage.aiCalls) : `${n(usage.aiCalls)} / ${n(ent.limits.aiCalls)}`} sub={ent.limits.aiCalls === null ? 'sem limite no plano' : `${n(Math.max(0, ent.limits.aiCalls - usage.aiCalls))} restantes`} tone={ent.limits.aiCalls !== null && usage.aiCalls >= ent.limits.aiCalls ? 'bad' : undefined} />
        <Stat label="Sites publicados" value={n(live.length)} sub={`${n(projects.length)} ${projects.length === 1 ? 'projeto' : 'projetos'} no total`} />
        <Stat label="Visitas em 30 dias" value={n(live.reduce((a, p) => a + (vis.get(p.id) || 0), 0))} sub={`${n(live.reduce((a, p) => a + (ld.get(p.id) || 0), 0))} leads`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Plano e créditos" hint="muda na hora">
          <WorkspaceActions id={ws.id} planKey={ws.planKey} status={ws.subscriptionStatus} until={ws.planUntil ? ws.planUntil.toISOString().slice(0, 10) : ''} plans={plansList.map(p => ({ key: p.key, name: p.name, priceCents: p.priceCents, active: p.active, visible: p.visible }))} />
          {ent.message && <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{ent.message}</p>}
          
        </Panel>
        <Panel title="Limites e consumo" hint={`plano ${ent.effective.name}`}>
          <div className="space-y-3 text-sm">
            {LIMIT_KEYS.map(k => {
              const limit = ent.limits[k], used = usage[k]
              const pct = limit === null ? 0 : limit === 0 ? (used > 0 ? 100 : 0) : Math.min(100, Math.round((used / limit) * 100))
              return (
                <div key={k}>
                  <div className="mb-1 flex justify-between gap-3 text-gray-300"><span>{LIMIT_DEFS[k].label}{!LIMIT_DEFS[k].enforced && <span className="ml-1 text-[11px] text-gray-500">(sem uso ainda)</span>}</span><span>{used.toLocaleString('pt-BR')} de {fmtLimit(limit)}{limit !== null && LIMIT_DEFS[k].period === 'month' ? ' este mês' : ''}</span></div>
                  {limit !== null && <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} /></div>}
                </div>
              )
            })}
            <div className="flex justify-between text-gray-300"><span>Chamadas de IA (30 dias)</span><span>{n(ai30._count)} · US$ {(ai30._sum.costUsd || 0).toFixed(2)}</span></div>
            <div className="flex justify-between text-gray-300"><span>Clonagens (30 dias)</span><span>{n(cloneOk)} deram certo · <span className={cloneErr ? 'text-red-300' : ''}>{n(cloneErr)} com erro</span></span></div>
            {aiByOp.length > 0 && <div className="flex flex-wrap gap-1.5 pt-1">{aiByOp.map(o => <span key={o.operation} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-gray-300">{OPERATION[o.operation] || o.operation} {n(o._count)}</span>)}</div>}
          </div>
        </Panel>
      </div>

      <Panel title="Projetos">
        {projects.length === 0 ? <p className="text-sm text-gray-500">Ainda não criou nenhum projeto.</p> : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[620px] text-sm">
              <thead className={head}><tr>{['Projeto', 'Situação', 'Páginas', 'Atualizado', ''].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/5">
                {projects.map(p => {
                  const st = projectState(p.status)
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-2.5"><div className="font-medium text-white">{p.name}</div><div className="max-w-[260px] truncate text-xs text-gray-500">{p.sourceUrl}</div></td>
                      <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span></td>
                      <td className="px-3 py-2.5 text-gray-300">{n(p._count.pages)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">{ago(p.updatedAt)}</td>
                      <td className="px-3 py-2.5 text-right text-xs"><a className="text-violet-300 underline" href={`/projects/${p.id}/p/home`} target="_blank" rel="noreferrer">ver clone</a></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Sites publicados, domínios e métricas" hint="últimos 30 dias">
        {live.length === 0 ? <p className="text-sm text-gray-500">Nenhum site publicado. As métricas só existem depois de publicar.</p> : (
          <div className="space-y-3">
            {live.map(p => (
              <div key={p.id} className="rounded-xl border border-white/10 bg-black/20 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0"><p className="font-medium text-white">{p.name}</p><p className="truncate text-xs text-gray-400">{p.customDomain || (p.slug ? `/s/${p.slug}` : 'sem endereço')} · publicado {when(p.publishedAt)}</p></div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-gray-300">{n(vis.get(p.id) || 0)} visitas · {n(ld.get(p.id) || 0)} leads</span>
                    <Link href={`/admin/metricas/${p.id}`} className="text-violet-300 underline">métricas</Link>
                    {p.slug && <a href={`/s/${p.slug}`} target="_blank" rel="noreferrer" className="text-violet-300 underline">abrir site</a>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">{pagesOf(p.id).map(pg => <span key={pg.pageSlug} className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] text-gray-300">{pg.name || pg.pageSlug}</span>)}{pagesOf(p.id).length === 0 && <span className="text-xs text-gray-500">sem páginas guardadas</span>}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Uso de IA" hint="últimas chamadas">
          {aiRecent.length === 0 ? <p className="text-sm text-gray-500">Ainda não usou a IA.</p> : (
            <ul className="space-y-1.5 text-sm">{aiRecent.map(a => <li key={a.id} className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-gray-200">{OPERATION[a.operation] || a.operation}<span className="ml-2 text-[11px] text-gray-500">{a.model}</span></span><span className="shrink-0 text-xs text-gray-500">{a.creditsUsed} créd. · {ago(a.createdAt)}</span></li>)}</ul>
          )}
        </Panel>
        <Panel title="Erros">
          {!hasErrors ? <p className="text-sm text-emerald-300">Nenhum erro registrado.</p> : (
            <ul className="space-y-2 text-sm">
              {scanErrors.map(s => <li key={s.id} className="rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2"><div className="flex justify-between gap-3"><span className="truncate text-gray-200">{s.url}</span><span className="shrink-0 text-xs text-gray-500">{ago(s.createdAt)}</span></div><p className="text-xs text-red-300">{s.errorMsg || 'sem mensagem'}</p></li>)}
              {failedPages.map((f, i) => <li key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-xs text-amber-200">{f.project}: página não clonada ({String(f.text).slice(0, 120)})</li>)}
              {feedbackErrors.map(f => <li key={f.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-gray-300">Relato: {f.message.slice(0, 140)}</li>)}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Pagamentos">
        <div className="space-y-4">
          <ManualPayment workspaces={[{ id: ws.id, name: name, plan: ent.plan.name }]} plans={plansList} />
          {payments.length === 0 ? <p className="text-sm text-gray-500">Nenhum pagamento registrado.</p> : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[520px] text-sm">
                <thead className={head}><tr>{['Quando', 'Forma', 'Valor', 'Situação', 'Descrição'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-white/5">
                  {payments.map(p => <tr key={p.id}><td className="px-3 py-2 text-xs text-gray-400">{when(p.createdAt)}</td><td className="px-3 py-2 text-gray-400">{p.billingType}</td><td className="px-3 py-2 font-medium text-white">{brl(p.value)}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${PAID.includes(p.status) ? 'bg-emerald-500/15 text-emerald-300' : p.status === 'OVERDUE' ? 'bg-red-500/15 text-red-300' : 'bg-white/10 text-gray-300'}`}>{p.status}</span></td><td className="px-3 py-2 text-xs text-gray-500">{p.description}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Histórico de atividade" hint="mais recentes primeiro">
        {timeline.length === 0 ? <p className="text-sm text-gray-500">Nada por enquanto.</p> : (
          <ol className="space-y-2">{timeline.map((t, i) => <li key={i} className="flex gap-3 text-sm"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.tone === 'bad' ? 'bg-red-400' : t.tone === 'good' ? 'bg-emerald-400' : 'bg-violet-400'}`} /><span className="min-w-0 flex-1 break-words text-gray-200">{t.text}</span><span className="shrink-0 text-xs text-gray-500">{when(t.at)}</span></li>)}</ol>
        )}
      </Panel>

      <Panel title="Dados da conta">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Nome da conta</dt><dd className="text-gray-200">{ws.name}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Criada em</dt><dd className="text-gray-200">{when(ws.createdAt)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Último acesso</dt><dd className="text-gray-200">{seen ? when(new Date(seen)) : '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Código da conta</dt><dd className="break-all text-right font-mono text-xs text-gray-400">{ws.id}</dd></div>
          {ppl.map(({ m, p }) => <div key={m.id} className="flex justify-between gap-3 sm:col-span-2"><dt className="text-gray-500">{m.role === 'OWNER' ? 'Dono' : 'Membro'}</dt><dd className="text-right text-gray-200">{p?.name || '—'} · {p?.email || m.clerkUserId}{p?.lastSignInAt ? ` · entrou ${ago(p.lastSignInAt)}` : ''}</dd></div>)}
        </dl>
      </Panel>
    </div>
  )
}
