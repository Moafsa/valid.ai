import Link from 'next/link'
import { db } from '@funnelai/db'
import { FeedbackReply, ManualPayment } from '@/components/dashboard/admin-actions'
import { PlansManager } from '@/components/dashboard/admin-plans'
import { GRACE_DAYS, listPlans, stateOf, entitlementsOf } from '@/lib/plans'
import { DAY, LOW_CREDITS, PAID, STANDING, accountNames, ago, brl, cloneOutcomes, internalWorkspaceIds, lastActivity, loadPeople, n, standing, workspaceIdsForPerson, type Standing } from '@/lib/admin-data'

const KIND: Record<string, string> = { site_not_cloning: 'Site não clonou direito', clone_error: 'Erro ao clonar', bug: 'Problema no sistema', idea: 'Ideia', praise: 'Elogio', other: 'Outro' }
export const planCls = (p: string) => (p === 'FREE' ? 'bg-white/10 text-gray-300' : 'bg-emerald-500/15 text-emerald-300')

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
      <p className="text-[11px] font-medium text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${tone === 'bad' ? 'text-red-300' : tone === 'good' ? 'text-emerald-300' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  )
}

export function Panel({ title, hint, href, children }: { title: string; hint?: string; href?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3"><h3 className="text-sm font-semibold text-gray-200">{title}</h3>{href ? <Link href={href} className="text-xs text-violet-300 hover:underline">{hint || 'ver todos'}</Link> : hint ? <span className="text-xs text-gray-500">{hint}</span> : null}</div>
      {children}
    </div>
  )
}

/** The platform at a glance: who is using it, who pays, and what needs attention. */
export async function Summary({ d7, d30 }: { d7: Date; d30: Date }) {
  const scannerUrl = process.env.SCANNER_SERVICE_URL || 'http://scanner:8001'
  const ping = fetch(`${scannerUrl}/health`, { signal: AbortSignal.timeout(4000), cache: 'no-store' }).then(r => r.ok).catch(() => false)
  const internal = await internalWorkspaceIds()
  const real = { notIn: internal }
  const allPlans = await listPlans()
  const paidKeys = allPlans.filter(p => p.priceCents > 0).map(p => p.key)
  const [total, fresh, byPlan, published, [{ v: visits7 }], [{ l: leads7 }], ai7, openFb, paid30, paidAll, recent, lowCount, lowList, overdue, activityAll, outcomesAll, scannerUp, paidAccounts] = await Promise.all([
    db.workspace.count({ where: { id: real } }), db.workspace.count({ where: { id: real, createdAt: { gte: d7 } } }), db.workspace.groupBy({ by: ['planKey'], where: { id: real }, _count: true }),
    db.project.count({ where: { status: 'PUBLISHED', workspaceId: real } }),
    db.$queryRaw<{ v: number }[]>`SELECT count(*)::int AS v FROM analytics_sessions s JOIN projects p ON p.id = s."projectId" WHERE s."startedAt" >= ${d7} AND s."isBot" = false AND s.mode = 'published' AND p."workspaceId" <> ALL(${internal}::text[])`,
    db.$queryRaw<{ l: number }[]>`SELECT count(*)::int AS l FROM leads x JOIN projects p ON p.id = x."projectId" WHERE x."createdAt" >= ${d7} AND p."workspaceId" <> ALL(${internal}::text[])`,
    db.aiUsageLog.aggregate({ where: { createdAt: { gte: d7 }, workspaceId: real }, _count: true, _sum: { costUsd: true } }), db.feedback.count({ where: { status: 'open', workspaceId: real } }),
    db.asaasPayment.aggregate({ where: { status: { in: PAID }, createdAt: { gte: d30 }, workspaceId: real }, _sum: { value: true }, _count: true }),
    db.asaasPayment.aggregate({ where: { status: { in: PAID }, workspaceId: real }, _sum: { value: true } }),
    db.asaasPayment.findMany({ where: { workspaceId: real }, orderBy: { createdAt: 'desc' }, take: 5 }),
    db.workspace.count({ where: { id: real, aiCredits: { lte: LOW_CREDITS } } }),
    db.workspace.findMany({ where: { id: real, aiCredits: { lte: LOW_CREDITS } }, orderBy: { aiCredits: 'asc' }, take: 5, select: { id: true, aiCredits: true, planKey: true } }),
    db.asaasPayment.count({ where: { status: 'OVERDUE', workspaceId: real } }),
    lastActivity(), cloneOutcomes(d7), ping,
    db.workspace.findMany({ where: { id: real, planKey: { in: paidKeys } }, select: { id: true, planKey: true, subscriptionStatus: true, planUntil: true } }),
  ])
  const skip = new Set(internal)
  const activity = new Map(Array.from(activityAll).filter(([id]) => !skip.has(id))), outcomes = new Map(Array.from(outcomesAll).filter(([id]) => !skip.has(id)))
  const planCount = Object.fromEntries(byPlan.map(p => [p.planKey, p._count])) as Record<string, number>
  const planOf = new Map(allPlans.map(p => [p.key, p]))
  // paying = on a paid plan whose subscription still counts (paid, or inside the grace days)
  const states = paidAccounts.map(a => stateOf(planOf.get(a.planKey)!, a))
  const paying = states.filter(x => x.state === 'ok' || x.state === 'grace').length
  const overdueAccounts = states.filter(x => x.state === 'grace' || x.state === 'lapsed').length
  const active = Array.from(activity.values()).filter(t => t >= d7.getTime()).length
  const done7 = Array.from(outcomes.values()).reduce((a, o) => a + o.done, 0), err7 = Array.from(outcomes.values()).reduce((a, o) => a + o.err, 0)
  const clones7 = done7 + err7, okRate = clones7 ? Math.round((done7 / clones7) * 100) : null
  const troubled = Array.from(outcomes.entries()).filter(([, o]) => o.err > 0 && o.err >= o.done).sort((x, y) => y[1].err - x[1].err)
  const names = await accountNames([...recent.map(p => p.workspaceId), ...lowList.map(w => w.id), ...troubled.slice(0, 5).map(t => t[0])])
  const who = (id: string) => names.get(id)?.name || 'Conta removida'

  const alerts: { tone: 'bad' | 'warn'; text: string; href: string }[] = []
  if (!scannerUp) alerts.push({ tone: 'bad', text: 'O clonador está fora do ar. Ninguém consegue clonar agora.', href: '/admin?aba=sistema' })
  if (clones7 >= 5 && okRate !== null && okRate < 60) alerts.push({ tone: 'bad', text: `Só ${okRate}% das clonagens da semana deram certo.`, href: '/admin?aba=erros' })
  if (troubled.length) alerts.push({ tone: 'bad', text: `${n(troubled.length)} ${troubled.length === 1 ? 'conta está' : 'contas estão'} com clonagens falhando.`, href: '/admin?aba=erros' })
  if (openFb) alerts.push({ tone: 'warn', text: `${n(openFb)} ${openFb === 1 ? 'mensagem esperando' : 'mensagens esperando'} resposta.`, href: '/admin?aba=feedback&st=open' })
  if (lowCount) alerts.push({ tone: 'warn', text: `${n(lowCount)} ${lowCount === 1 ? 'conta está' : 'contas estão'} com os créditos acabando.`, href: '/admin?aba=usuarios' })
  if (overdueAccounts) alerts.push({ tone: 'warn', text: `${n(overdueAccounts)} ${overdueAccounts === 1 ? 'assinatura vencida ou em atraso' : 'assinaturas vencidas ou em atraso'} (até ${GRACE_DAYS} dias de tolerância, depois a conta volta ao plano gratuito).`, href: '/admin?aba=usuarios&st=paying' })
  if (overdue) alerts.push({ tone: 'warn', text: `${n(overdue)} ${overdue === 1 ? 'pagamento vencido' : 'pagamentos vencidos'}.`, href: '/admin?aba=pagamentos' })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Usuários" value={n(total)} sub={`+${n(fresh)} novos nos últimos 7 dias`} />
        <Stat label="Usuários ativos" value={n(active)} sub={total ? `${Math.round((active / total) * 100)}% usaram nos últimos 7 dias` : undefined} />
        <Stat label="Usuários pagantes" value={n(paying)} sub={total ? `${Math.round((paying / total) * 100)}% dos usuários` : undefined} />
        <Stat label="Receita em 30 dias" value={brl(paid30._sum.value || 0)} sub={`${n(paid30._count)} pagamentos · total ${brl(paidAll._sum.value || 0)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Alertas importantes">
          {alerts.length === 0 ? <p className="rounded-xl bg-emerald-500/[0.08] px-3 py-2.5 text-sm text-emerald-300">Tudo certo por aqui. Nada precisando de atenção.</p> : (
            <ul className="space-y-2">{alerts.map((a, i) => <li key={i}><Link href={a.href} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm hover:bg-white/[0.04] ${a.tone === 'bad' ? 'border-red-500/25 bg-red-500/[0.06] text-red-200' : 'border-amber-500/25 bg-amber-500/[0.06] text-amber-200'}`}><span className={`h-2 w-2 shrink-0 rounded-full ${a.tone === 'bad' ? 'bg-red-400' : 'bg-amber-400'}`} />{a.text}</Link></li>)}</ul>
          )}
        </Panel>
        <Panel title="Usuários por plano" href="/admin?aba=usuarios" hint="ver usuários">
          <ul className="space-y-2.5">
            {allPlans.filter(p => p.active || (planCount[p.key] || 0) > 0).map(p => {
              const c = planCount[p.key] || 0
              return <li key={p.key} className="text-sm"><div className="mb-1 flex justify-between"><span className="text-gray-300">{p.name}</span><span className="text-gray-400">{n(c)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${p.priceCents <= 0 ? 'bg-gray-400' : 'bg-emerald-400'}`} style={{ width: `${total ? Math.max(c ? 3 : 0, (c / total) * 100) : 0}%` }} /></div></li>
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Pagamentos recentes" href="/admin?aba=pagamentos">
          {recent.length === 0 ? <p className="text-sm text-gray-500">Nenhum pagamento ainda.</p> : (
            <ul className="space-y-2">{recent.map(p => <li key={p.id} className="flex items-center justify-between gap-3 text-sm"><div className="min-w-0"><Link href={`/admin/usuarios/${p.workspaceId}`} className="block truncate text-gray-200 hover:underline">{who(p.workspaceId)}</Link><span className="text-[11px] text-gray-500">{p.createdAt.toLocaleDateString('pt-BR')} · {p.billingType}</span></div><span className={`shrink-0 font-medium ${PAID.includes(p.status) ? 'text-emerald-300' : 'text-gray-400'}`}>{brl(p.value)}</span></li>)}</ul>
          )}
        </Panel>
        <Panel title="Contas perto do limite" hint={`créditos de IA ≤ ${LOW_CREDITS}`}>
          {lowList.length === 0 ? <p className="text-sm text-gray-500">Ninguém com os créditos acabando.</p> : (
            <ul className="space-y-2">{lowList.map(w => <li key={w.id} className="flex items-center justify-between gap-3 text-sm"><Link href={`/admin/usuarios/${w.id}`} className="truncate text-gray-200 hover:underline">{who(w.id)}</Link><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${w.aiCredits <= 0 ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>{n(w.aiCredits)} créditos</span></li>)}{lowCount > lowList.length && <li className="text-xs text-gray-500">e mais {n(lowCount - lowList.length)}…</li>}</ul>
          )}
        </Panel>
        <Panel title="Contas com problemas" href="/admin?aba=erros" hint="ver erros">
          {troubled.length === 0 ? <p className="text-sm text-gray-500">Nenhuma conta com erro de clonagem esta semana.</p> : (
            <ul className="space-y-2">{troubled.slice(0, 5).map(([id, o]) => <li key={id} className="flex items-center justify-between gap-3 text-sm"><Link href={`/admin/usuarios/${id}`} className="truncate text-gray-200 hover:underline">{who(id)}</Link><span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">{n(o.err)} {o.err === 1 ? 'erro' : 'erros'}</span></li>)}</ul>
          )}
        </Panel>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-300">Uso da plataforma nos últimos 7 dias</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Sites publicados" value={n(published)} sub="no ar agora" />
          <Stat label="Clonagens que deram certo" value={okRate === null ? '—' : `${okRate}%`} sub={clones7 ? `${n(done7)} de ${n(clones7)} tentativas` : 'nenhuma tentativa'} tone={okRate !== null && okRate < 60 ? 'bad' : undefined} />
          <Stat label="Visitas nos sites publicados" value={n(visits7)} sub={`${n(leads7)} leads captados`} />
          <Stat label="Uso de IA" value={n(ai7._count)} sub={`custo US$ ${(ai7._sum.costUsd || 0).toFixed(2)}`} />
        </div>
      </div>
    </div>
  )
}

const FILTERS: [Standing | 'all' | 'paying', string][] = [['all', 'Todos'], ['active', 'Ativos'], ['new', 'Novos'], ['inactive', 'Inativos'], ['problem', 'Com problema'], ['paying', 'Pagantes']]

/** One line per customer. Everything else about them is one click away, on their own page. */
export async function UsersTab({ q, st }: { q?: string; st?: string }) {
  const term = (q || '').trim()
  const internal = await internalWorkspaceIds()
  let where: any = { id: { notIn: internal } }
  if (term) {
    const byPerson = await workspaceIdsForPerson(term)
    where = { id: { notIn: internal }, OR: [{ name: { contains: term, mode: 'insensitive' } }, { slug: { contains: term, mode: 'insensitive' } }, { id: { in: byPerson } }, { id: term }] }
  }
  const [wsList, activity, outcomes, published] = await Promise.all([
    db.workspace.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300, include: { members: true } }),
    lastActivity(), cloneOutcomes(new Date(Date.now() - 7 * DAY)),
    db.project.groupBy({ by: ['workspaceId'], where: { status: 'PUBLISHED' }, _count: true }),
  ])
  const people = await loadPeople(wsList.flatMap(w => w.members.map(x => x.clerkUserId)))
  const planMap = new Map((await listPlans()).map(p => [p.key, p]))
  const pubM = new Map(published.map(p => [p.workspaceId, p._count]))
  const rows = wsList.map(w => {
    const ppl = w.members.map(x => people.get(x.clerkUserId)).filter(Boolean) as { name: string; email: string; lastSignInAt: number | null }[]
    const seen = Math.max(0, ...ppl.map(p => p.lastSignInAt || 0), activity.get(w.id) || 0)
    return { w, name: ppl.find(p => p.name)?.name || w.name, email: ppl.map(p => p.email).filter(Boolean).join(', '), seen, state: standing(w.createdAt, seen, outcomes.get(w.id)), published: pubM.get(w.id) || 0, plan: planMap.get(w.planKey), sub: planMap.get(w.planKey) ? stateOf(planMap.get(w.planKey)!, w).state : 'free' }
  })
  const counts: Record<string, number> = { all: rows.length, paying: rows.filter(r => (r.plan?.priceCents ?? 0) > 0 && (r.sub === 'ok' || r.sub === 'grace')).length }
  for (const k of ['active', 'new', 'inactive', 'problem']) counts[k] = rows.filter(r => r.state === k).length
  const shown = rows.filter(r => !st || st === 'all' ? true : st === 'paying' ? (r.plan?.priceCents ?? 0) > 0 : r.state === st).sort((a, b) => b.seen - a.seen)
  const href = (k: string) => `/admin?aba=usuarios${k !== 'all' ? `&st=${k}` : ''}${term ? `&q=${encodeURIComponent(term)}` : ''}`
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <form action="/admin" method="get" className="flex flex-1 gap-2 sm:max-w-md">
          <input type="hidden" name="aba" value="usuarios" />{st && st !== 'all' && <input type="hidden" name="st" value={st} />}
          <input name="q" defaultValue={term} placeholder="Buscar por nome ou e-mail" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:border-violet-400/60" />
          <button className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Buscar</button>
        </form>
        <div className="flex flex-wrap gap-1.5">{FILTERS.map(([k, l]) => <Link key={k} href={href(k)} className={`rounded-full border px-3 py-1 text-xs ${(st || 'all') === k ? 'border-violet-400/60 bg-violet-500/15 text-white' : 'border-white/10 text-gray-400 hover:text-white'}`}>{l} <span className="opacity-60">{counts[k] ?? 0}</span></Link>)}</div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-wide text-gray-500"><tr>{['Nome', 'E-mail', 'Plano', 'Status', 'Último acesso', 'Sites publicados'].map(h => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-white/5">
            {shown.map(r => {
              const link = `/admin/usuarios/${r.w.id}`
              const cell = (child: React.ReactNode, cls = '') => <td className="p-0"><Link href={link} className={`block px-3 py-3 ${cls}`}>{child}</Link></td>
              return (
                <tr key={r.w.id} className="hover:bg-white/[0.04]">
                  {cell(<span className="font-medium text-white">{r.name}</span>)}
                  {cell(<span className="text-gray-400">{r.email || '—'}</span>)}
                  {cell(<span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${planCls(r.plan?.priceCents ? 'PAID' : 'FREE')}`}>{r.plan?.name ?? r.w.planKey}</span>)}
                  {cell(<span className="inline-flex items-center gap-1.5"><span className={`rounded-full px-2 py-0.5 text-xs ${STANDING[r.state].cls}`}>{STANDING[r.state].label}</span>{r.sub === 'lapsed' && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300">assinatura vencida</span>}{r.sub === 'grace' && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">em atraso</span>}</span>)}
                  {cell(<span className="text-xs text-gray-400">{r.seen ? ago(r.seen) : '—'}</span>)}
                  {cell(<span className="text-gray-300">{n(r.published)}</span>)}
                </tr>
              )
            })}
            {shown.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-500">Ninguém encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">Clique em uma linha para abrir a conta inteira.</p>
    </div>
  )
}

export async function PaymentsTab() {
  const internal = await internalWorkspaceIds()
  const [pays, buys] = await Promise.all([
    db.asaasPayment.findMany({ where: { workspaceId: { notIn: internal } }, orderBy: { createdAt: 'desc' }, take: 60 }),
    db.creditTransaction.findMany({ where: { type: 'PURCHASE', workspaceId: { notIn: internal } }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ])
  const names = new Map((await db.workspace.findMany({ where: { id: { in: [...pays.map(p => p.workspaceId), ...buys.map(b => b.workspaceId)] } }, select: { id: true, name: true } })).map(w => [w.id, w.name]))
  const all = await db.workspace.findMany({ where: { id: { notIn: internal } }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, name: true, planKey: true } })
  const plansList = await listPlans()
  return (
    <div className="space-y-6">
      <ManualPayment workspaces={all.map(w => ({ id: w.id, name: w.name, plan: plansList.find(p => p.key === w.planKey)?.name ?? w.planKey }))} plans={plansList} />
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-wide text-gray-500"><tr>{['Quando', 'Conta', 'Forma', 'Valor', 'Situação', 'Descrição'].map(h => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-white/5">
            {pays.map(p => (
              <tr key={p.id}><td className="px-3 py-2.5 text-xs text-gray-400">{p.createdAt.toLocaleString('pt-BR')}</td><td className="px-3 py-2.5 text-gray-200">{names.get(p.workspaceId) || p.workspaceId}</td><td className="px-3 py-2.5 text-gray-400">{p.billingType}</td><td className="px-3 py-2.5 font-medium text-white">{brl(p.value)}</td>
                <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs ${PAID.includes(p.status) ? 'bg-emerald-500/15 text-emerald-300' : p.status === 'OVERDUE' ? 'bg-red-500/15 text-red-300' : 'bg-white/10 text-gray-300'}`}>{p.status}</span></td><td className="px-3 py-2.5 text-xs text-gray-500">{p.description}</td></tr>
            ))}
            {pays.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-500">Nenhum pagamento registrado ainda.</td></tr>}
          </tbody>
        </table>
      </div>
      {buys.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-300">Compras de créditos</h3>
          <div className="space-y-1.5">{buys.map(b => <div key={b.id} className="flex justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm"><span className="text-gray-300">{names.get(b.workspaceId) || b.workspaceId} · {b.description}</span><span className="text-gray-500">+{b.amount} · {b.createdAt.toLocaleDateString('pt-BR')}</span></div>)}</div>
        </div>
      )}
    </div>
  )
}

export async function FeedbackTab({ st }: { st?: string }) {
  const where = st && st !== 'all' ? { status: st } : {}
  const [items, counts] = await Promise.all([db.feedback.findMany({ where, orderBy: { createdAt: 'desc' }, take: 60 }), db.feedback.groupBy({ by: ['status'], _count: true })])
  const wsRows = await db.workspace.findMany({ where: { id: { in: items.map(i => i.workspaceId) } }, select: { id: true, name: true, planKey: true, subscriptionStatus: true, planUntil: true } })
  const names = new Map(wsRows.map(w => [w.id, w.name]))
  const priority = new Set<string>()
  for (const w of wsRows) if ((await entitlementsOf(w)).features.prioritySupport) priority.add(w.id)
  items.sort((a, b) => Number(priority.has(b.workspaceId)) - Number(priority.has(a.workspaceId)) || b.createdAt.getTime() - a.createdAt.getTime())
  const projects = new Map((await db.project.findMany({ where: { id: { in: items.map(i => i.projectId).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map(p => [p.id, p.name]))
  const c = Object.fromEntries(counts.map(x => [x.status, x._count]))
  const filters = [['all', 'Todas'], ['open', `Abertas (${c.open || 0})`], ['answered', `Respondidas (${c.answered || 0})`], ['done', `Resolvidas (${c.done || 0})`]]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{filters.map(([k, l]) => <Link key={k} href={`/admin?aba=feedback&st=${k}`} className={`rounded-full border px-3 py-1 text-xs ${(st || 'all') === k ? 'border-violet-400/60 bg-violet-500/15 text-white' : 'border-white/10 text-gray-400 hover:text-white'}`}>{l}</Link>)}</div>
      {items.length === 0 && <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-gray-500">Nenhuma mensagem.</p>}
      {items.map(i => {
        const ctx = (i.context || {}) as Record<string, string>
        return (
          <div key={i.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-white">{KIND[i.kind] || i.kind}</span><span className="text-gray-400">{names.get(i.workspaceId) || i.workspaceId}</span>{priority.has(i.workspaceId) && <span className="rounded-full bg-violet-500/20 px-2 py-0.5 font-semibold text-violet-200">suporte prioritário</span>}{i.status === 'open' && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-300">aberta</span>}<span className="ml-auto text-gray-500">{i.createdAt.toLocaleString('pt-BR')}</span></div>
            {i.siteUrl && <a href={i.siteUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-violet-300 underline">{i.siteUrl}</a>}
            {i.projectId && <Link href={`/projects/${i.projectId}`} className="mt-0.5 block text-xs text-gray-400 underline">Projeto: {projects.get(i.projectId) || i.projectId}</Link>}
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-200">{i.message}</p>
            {ctx.ua && <p className="mt-1 text-[11px] text-gray-600">{ctx.viewport} · {ctx.ua}</p>}
            <FeedbackReply id={i.id} status={i.status} reply={i.reply} />
          </div>
        )
      })}
    </div>
  )
}

export async function ErrorsTab() {
  const internal = await internalWorkspaceIds()
  const [jobs, projects, reported] = await Promise.all([
    db.scanJob.findMany({ where: { status: 'ERROR', project: { workspaceId: { notIn: internal } } }, orderBy: { createdAt: 'desc' }, take: 25, include: { project: { select: { id: true, name: true, workspaceId: true } } } }),
    db.project.findMany({ where: { workspaceId: { notIn: internal } }, orderBy: { updatedAt: 'desc' }, take: 150, select: { id: true, name: true, sourceUrl: true, crawlStats: true, workspaceId: true } }),
    db.feedback.findMany({ where: { kind: { in: ['site_not_cloning', 'clone_error'] }, status: { not: 'done' }, workspaceId: { notIn: internal } }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ])
  const withFailures = projects.filter(p => Array.isArray((p.crawlStats as any)?.failed) && (p.crawlStats as any).failed.length > 0).slice(0, 15)
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-300">Sites que as pessoas disseram que não clonaram direito ({reported.length})</h3>
        <div className="space-y-2">{reported.map(r => <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm"><a href={r.siteUrl || '#'} className="text-violet-300 underline" target="_blank" rel="noreferrer">{r.siteUrl || 'sem endereço'}</a><span className="ml-2 text-gray-500">{r.message.slice(0, 140)}</span></div>)}{reported.length === 0 && <p className="text-sm text-gray-500">Nenhum relato aberto.</p>}</div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-300">Clonagens que terminaram com erro</h3>
        <div className="space-y-2">{jobs.map(j => <div key={j.id} className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-2.5 text-sm"><div className="flex justify-between gap-3"><span className="truncate text-gray-200">{j.url}</span><span className="shrink-0 text-xs text-gray-500">{ago(j.createdAt)}</span></div><p className="text-xs text-red-300">{j.errorMsg || 'sem mensagem'}</p></div>)}{jobs.length === 0 && <p className="text-sm text-gray-500">Nenhum erro recente.</p>}</div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-300">Clones em que alguma página não foi clonada</h3>
        <div className="space-y-2">{withFailures.map(p => <Link key={p.id} href={`/projects/${p.id}`} className="block rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-2.5 text-sm"><span className="text-gray-200">{p.name}</span><span className="ml-2 text-xs text-gray-500">{p.sourceUrl}</span><p className="text-xs text-amber-300">{((p.crawlStats as any).failed as any[]).length} página(s) com falha: {((p.crawlStats as any).failed as any[]).slice(0, 2).map(f => f.error || f.url).join(' · ').slice(0, 160)}</p></Link>)}{withFailures.length === 0 && <p className="text-sm text-gray-500">Nada com falha parcial.</p>}</div>
      </div>
    </div>
  )
}

export async function SystemTab() {
  const scanner = process.env.SCANNER_SERVICE_URL || 'http://scanner:8001'
  const ping = async (url: string) => { const t = Date.now(); try { const r = await fetch(url, { signal: AbortSignal.timeout(4000), cache: 'no-store' }); return { ok: r.ok, ms: Date.now() - t } } catch { return { ok: false, ms: Date.now() - t } } }
  const [sc, queued, scanning, rec, sessions] = await Promise.all([ping(`${scanner}/health`), db.scanJob.count({ where: { status: 'QUEUED', createdAt: { gte: new Date(Date.now() - DAY) } } }), db.scanJob.count({ where: { status: { in: ['SCANNING', 'PROCESSING'] } } }), db.recording.count(), db.analyticsSession.count()])
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Clonador (scanner)" value={sc.ok ? 'no ar' : 'fora do ar'} sub={`${sc.ms} ms`} tone={sc.ok ? 'good' : 'bad'} />
      <Stat label="Clonando agora" value={n(scanning)} sub={`${n(queued)} na fila (24h)`} />
      <Stat label="Visitas medidas" value={n(sessions)} sub={`${n(rec)} gravações guardadas`} />
      <Stat label="Banco de dados" value="no ar" sub="respondendo" tone="good" />
    </div>
  )
}

const PROJECT_FILTERS: [string, string][] = [['all', 'Todos'], ['PUBLISHED', 'Publicados'], ['READY', 'Prontos'], ['BUILDING', 'Clonando'], ['ERROR', 'Com erro']]
const PROJECT_STATE: Record<string, { label: string; cls: string }> = {
  PUBLISHED: { label: 'Publicado', cls: 'bg-emerald-500/15 text-emerald-300' }, READY: { label: 'Pronto', cls: 'bg-white/10 text-gray-300' }, ERROR: { label: 'Com erro', cls: 'bg-red-500/15 text-red-300' },
  PENDING: { label: 'Clonando', cls: 'bg-amber-500/15 text-amber-300' }, SCANNING: { label: 'Clonando', cls: 'bg-amber-500/15 text-amber-300' }, CLONING: { label: 'Clonando', cls: 'bg-amber-500/15 text-amber-300' },
}
export const projectState = (s: string) => PROJECT_STATE[s] || { label: s, cls: 'bg-white/10 text-gray-300' }
const APP_HOST = (process.env.NEXT_PUBLIC_APP_URL || 'https://be-vallid.com').replace(/^https?:\/\//, '').replace(/\/$/, '')

/** Finding a site and stepping into it when needed: search by customer, project name, address or status. */
export async function ProjectsTab({ q, st }: { q?: string; st?: string }) {
  const term = (q || '').trim()
  const internal = await internalWorkspaceIds()
  const where: any = { workspaceId: { notIn: internal } }
  if (st === 'PUBLISHED' || st === 'READY' || st === 'ERROR') where.status = st
  else if (st === 'BUILDING') where.status = { in: ['PENDING', 'SCANNING', 'CLONING'] }
  if (term) {
    const [byPerson, byAccount] = await Promise.all([workspaceIdsForPerson(term), db.workspace.findMany({ where: { name: { contains: term, mode: 'insensitive' } }, select: { id: true }, take: 50 })])
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } }, { slug: { contains: term, mode: 'insensitive' } }, { customDomain: { contains: term, mode: 'insensitive' } }, { sourceUrl: { contains: term, mode: 'insensitive' } },
      { workspaceId: { in: [...byPerson, ...byAccount.map(w => w.id)].filter(id => !internal.includes(id)) } },
    ]
  }
  const [projects, matching, byStatus] = await Promise.all([
    db.project.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100, select: { id: true, name: true, status: true, slug: true, customDomain: true, sourceUrl: true, workspaceId: true } }),
    db.project.count({ where }), db.project.groupBy({ by: ['status'], where: { workspaceId: { notIn: internal } }, _count: true }),
  ])
  const names = await accountNames(projects.map(p => p.workspaceId))
  const c: Record<string, number> = {}
  for (const s of byStatus) { c.all = (c.all || 0) + s._count; const k = ['PENDING', 'SCANNING', 'CLONING'].includes(s.status) ? 'BUILDING' : s.status; c[k] = (c[k] || 0) + s._count }
  const href = (k: string) => `/admin?aba=projetos${k !== 'all' ? `&st=${k}` : ''}${term ? `&q=${encodeURIComponent(term)}` : ''}`
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <form action="/admin" method="get" className="flex flex-1 gap-2 sm:max-w-md">
          <input type="hidden" name="aba" value="projetos" />{st && st !== 'all' && <input type="hidden" name="st" value={st} />}
          <input name="q" defaultValue={term} placeholder="Buscar por usuário, projeto ou domínio" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:border-violet-400/60" />
          <button className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Buscar</button>
        </form>
        <div className="flex flex-wrap gap-1.5">{PROJECT_FILTERS.map(([k, l]) => <Link key={k} href={href(k)} className={`rounded-full border px-3 py-1 text-xs ${(st || 'all') === k ? 'border-violet-400/60 bg-violet-500/15 text-white' : 'border-white/10 text-gray-400 hover:text-white'}`}>{l} <span className="opacity-60">{c[k] || 0}</span></Link>)}</div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-wide text-gray-500"><tr>{['Projeto', 'Usuário', 'Domínio', 'Situação', ''].map((h, i) => <th key={i} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-white/5">
            {projects.map(p => {
              const who = names.get(p.workspaceId), state = projectState(p.status)
              return (
                <tr key={p.id} className="align-top">
                  <td className="px-3 py-3"><div className="font-medium text-white">{p.name}</div><div className="max-w-[240px] truncate text-xs text-gray-500">{p.sourceUrl}</div></td>
                  <td className="px-3 py-3"><Link href={`/admin/usuarios/${p.workspaceId}`} className="text-gray-200 hover:underline">{who?.name || '—'}</Link>{who?.email && <div className="text-xs text-gray-500">{who.email}</div>}</td>
                  <td className="px-3 py-3 text-xs text-gray-400">{p.customDomain || (p.slug && p.status === 'PUBLISHED' ? `${APP_HOST}/s/${p.slug}` : '—')}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${state.cls}`}>{state.label}</span></td>
                  <td className="px-3 py-3 text-right text-xs"><div className="flex justify-end gap-3">
                    {p.status === 'PUBLISHED' && <Link className="text-violet-300 underline" href={`/admin/metricas/${p.id}`}>métricas</Link>}
                    {p.slug && p.status === 'PUBLISHED' && <a className="text-violet-300 underline" href={`/s/${p.slug}`} target="_blank" rel="noreferrer">abrir site</a>}
                    <Link className="text-violet-300 underline" href={`/admin/usuarios/${p.workspaceId}`}>conta</Link>
                  </div></td>
                </tr>
              )
            })}
            {projects.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-gray-500">Nenhum projeto encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      {matching > projects.length && <p className="text-xs text-gray-500">Mostrando os {n(projects.length)} mais recentes de {n(matching)}. Use a busca para achar um específico.</p>}
    </div>
  )
}

/** The plans: what is sold, what each one allows, and who is on it. */
export async function PlansTab() {
  const [plans, counts] = await Promise.all([listPlans(), db.workspace.groupBy({ by: ['planKey'], _count: true })])
  return <PlansManager plans={plans} counts={Object.fromEntries(counts.map(c => [c.planKey, c._count]))} />
}
