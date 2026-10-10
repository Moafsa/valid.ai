import Link from 'next/link'
import { Radar } from 'lucide-react'
import { db } from '@funnelai/db'
import { INTEGRATIONS, STATE_LABEL, type Integration, type PixelState } from '@/lib/pixels'
import { pixelOverview } from '@/lib/pixels-server'
import { featureGate } from '@/lib/plans'

const n = (v: number) => v.toLocaleString('pt-BR')
const TONE = { good: 'text-emerald-300', warn: 'text-amber-300', bad: 'text-red-300', mute: 'text-gray-400' } as const

/**
 * What the pixels add to the Métricas tab: the platform's own numbers stay the source of truth, and each pixel's events are shown next to
 * them (how many it was told, how many the browsers really sent), with the difference said plainly. No pixel, no card.
 */
export async function PixelMetricsCard({ projectId, workspace }: { projectId: string; workspace: { planKey: string; subscriptionStatus: string; planUntil: Date | null } }) {
  if (!(await featureGate(workspace, 'pixels')).ok) return null
  const rows = await db.projectTracking.findMany({ where: { projectId, isActive: true }, orderBy: { createdAt: 'asc' } })
  if (rows.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-white/10 px-5 py-4 text-sm text-gray-500">
        <span>Quer cruzar estes números com os do Meta, do Google ou do TikTok? Ligue um pixel (é opcional).</span>
        <Link href={`/projects/${projectId}?aba=pixels`} className="text-violet-300 hover:underline">Pixels e Eventos →</Link>
      </div>
    )
  }
  const o = await pixelOverview(projectId, 30)
  const by = (type: string, key: string, state?: string) => o.stats.filter(s => s.integration === type && s.key === key && (!state || s.state === state)).reduce((t, s) => t + s.count, 0)
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)
  const types = Array.from(new Set(rows.map(r => r.type as Integration)))
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500"><Radar className="h-4 w-4" /> Pixels (últimos 30 dias)</h2>
        <Link href={`/projects/${projectId}?aba=pixels`} className="text-xs text-violet-300 hover:underline">Abrir Pixels e Eventos →</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-black/20 p-3"><p className="text-[11px] text-gray-500">Visitas (plataforma)</p><p className="text-xl font-semibold text-white">{n(o.native.sessions)}</p></div>
        <div className="rounded-xl bg-black/20 p-3"><p className="text-[11px] text-gray-500">Leads (plataforma)</p><p className="text-xl font-semibold text-white">{n(o.native.leads)}</p><p className="text-[11px] text-gray-500">{n(o.visitsByKey.lead ?? 0)} chegaram aos pixels</p></div>
        <div className="rounded-xl bg-black/20 p-3"><p className="text-[11px] text-gray-500">Receita informada pelos pixels</p><p className="text-xl font-semibold text-white">{o.revenue.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p><p className="text-[11px] text-gray-500">{o.revenue.purchases > 0 ? `${n(o.revenue.purchases)} compras (não verificadas)` : 'nenhuma compra informada'}</p></div>
      </div>
      <div className="mt-4 space-y-2">
        {types.map(t => {
          const pv = by(t, 'pageview', 'sent'), lead = by(t, 'lead', 'sent'), bad = o.stats.filter(s => s.integration === t && (s.state === 'blocked' || s.state === 'unconfirmed')).reduce((x, s) => x + s.count, 0)
          const reach = pct(pv, o.native.sessions)
          const state: PixelState = pv + lead > 0 ? 'sent' : bad > 0 ? 'blocked' : 'skipped'
          return (
            <div key={t} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm">
              <span className="text-gray-200">{INTEGRATIONS[t].label}</span>
              <span className="text-xs text-gray-400">
                {pv + lead + bad === 0 ? 'ainda sem eventos' : <>
                  {n(pv)} visualizações enviadas{reach !== null && <> ({reach}% das visitas da plataforma)</>} · {n(lead)} leads enviados{bad > 0 && <span className={`ml-2 ${TONE[STATE_LABEL.unconfirmed.tone]}`}>{n(bad)} sem confirmação ou bloqueados</span>}
                </>}
              </span>
              {state === 'blocked' && <span className="text-[11px] text-red-300">o pixel não carregou nos navegadores</span>}
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-gray-600">Os números da plataforma continuam sendo a base: os pixels complementam. Diferenças pequenas são normais (bloqueadores, consentimento recusado).</p>
    </div>
  )
}
