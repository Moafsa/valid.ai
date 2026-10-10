import Link from 'next/link'
import { AlertTriangle, Check, Sparkles } from 'lucide-react'
import type { Entitlements, PlanView, Usage } from '@/lib/plans'
import { FEATURE_DEFS, FEATURE_KEYS, LIMIT_DEFS, LIMIT_KEYS, brlCents, fmtLimit, planCardLines } from '@/lib/plans-shared'

/** The customer's plan: what it is, how much of it they use, what it includes, and the other plans. Nothing is charged here: a change of plan is made by the team. */
export function PlanCard({ ent, usage, credits, until, plans }: { ent: Entitlements; usage: Usage; credits: number; until: Date | null; plans: PlanView[] }) {
  const shown = LIMIT_KEYS.filter(k => LIMIT_DEFS[k].enforced || ent.limits[k] !== null)
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-300" /><h3 className="text-sm font-semibold text-gray-200">Seu plano</h3></div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-violet-500/15 px-3 py-1 text-sm font-semibold text-violet-200">{ent.plan.name}</span>
            {ent.plan.priceCents > 0 && <span className="text-xs text-gray-400">{brlCents(ent.plan.priceCents)}/{ent.plan.interval === 'year' ? 'ano' : 'mês'}</span>}
          </div>
        </div>
        {ent.plan.priceCents > 0 && until && ent.state !== 'lapsed' && <p className="mb-3 text-xs text-gray-500">Pago até {until.toLocaleDateString('pt-BR')}</p>}
        {ent.message && (
          <p className={`mb-3 flex gap-2 rounded-xl px-3 py-2.5 text-sm ${ent.state === 'lapsed' ? 'bg-red-500/10 text-red-200' : 'bg-amber-500/10 text-amber-200'}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{ent.message}</p>
        )}
        <div className="space-y-3">
          {shown.map(k => {
            const limit = ent.limits[k], used = usage[k]
            const pct = limit === null ? 0 : limit === 0 ? (used > 0 ? 100 : 0) : Math.min(100, Math.round((used / limit) * 100))
            return (
              <div key={k}>
                <div className="mb-1 flex justify-between gap-3 text-sm"><span className="text-gray-300">{LIMIT_DEFS[k].label}</span><span className="text-gray-400">{k === 'storageMb' ? `${Math.round(used)} MB` : used.toLocaleString('pt-BR')} de {k === 'storageMb' && limit !== null ? `${limit} MB` : fmtLimit(limit)}{limit !== null && LIMIT_DEFS[k].period === 'month' ? ' este mês' : ''}</span></div>
                {limit !== null && <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-violet-400'}`} style={{ width: `${pct}%` }} /></div>}
              </div>
            )
          })}
          <div className="flex justify-between gap-3 text-sm"><span className="text-gray-300">Créditos de IA</span><span className="text-gray-400">{credits.toLocaleString('pt-BR')} disponíveis</span></div>
        </div>
        <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {FEATURE_KEYS.map(k => (
            <li key={k} className={`flex items-center gap-2 text-sm ${ent.features[k] ? 'text-gray-200' : 'text-gray-600 line-through'}`}><Check className={`h-3.5 w-3.5 ${ent.features[k] ? 'text-emerald-400' : 'text-gray-700'}`} />{FEATURE_DEFS[k].label}</li>
          ))}
        </ul>
      </div>

      {plans.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-sm font-semibold text-gray-200">Mudar de plano</h3>
          <p className="mt-1 text-xs text-gray-500">A contratação é feita com a nossa equipe: escolha o plano abaixo e mande uma mensagem em <Link href="/feedback" className="text-violet-300 underline">Feedback</Link>. A mudança vale assim que o pagamento é confirmado.</p>
          <div className="mt-3 space-y-2">
            {plans.map(p => (
              <div key={p.key} className={`rounded-xl border px-4 py-3 ${p.key === ent.plan.key ? 'border-violet-400/40 bg-violet-500/[0.06]' : 'border-white/10'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{p.name}{p.highlight && <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] font-medium text-violet-200">recomendado</span>}{p.key === ent.plan.key && <span className="ml-2 text-[11px] font-normal text-gray-400">seu plano</span>}</span>
                  <span className="text-sm text-gray-300">{brlCents(p.priceCents)}/{p.interval === 'year' ? 'ano' : 'mês'}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{planCardLines(p).slice(0, 4).join(' · ')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
