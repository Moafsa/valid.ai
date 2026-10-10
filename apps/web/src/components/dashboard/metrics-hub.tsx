import Link from 'next/link'
import { AlertTriangle, ArrowRight, BarChart3, Clock, Layers, Lightbulb, Lock, Sparkles, Target, TrendingUp, Users } from 'lucide-react'

const n = (v: number) => Math.round(v).toLocaleString('pt-BR')
const p1 = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString('pt-BR')}%`
const dur = (s: number) => (s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}min ${Math.round(s % 60)}s`)

function Spark({ data }: { data: number[] }) {
  const w = 220, h = 54
  const max = Math.max(...data, 1)
  const step = w / Math.max(1, data.length - 1)
  const pts = data.map((v, i) => [i * step, h - 4 - (v / max) * (h - 10)] as const)
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id="hubspark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a78bfa" stopOpacity="0.45" /><stop offset="1" stopColor="#a78bfa" stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="url(#hubspark)" />
      <path d={d} fill="none" stroke="#c4b5fd" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}


export interface HubData {
  totals: { sessions: number; visitors: number; conversions: number; conversionRate: number; avgActiveSec: number; avgScroll: number }
  previousSessions: number
  bucket: 'hour' | 'day'
  series: number[]
  summary: string | null
  found: { id: string; kind: string; title: string }[]
}

/**
 * The way into the analytics center, built into the Métricas tab: a summary of what the published page is doing,
 * or, while the page is not published, the same card blurred with the reason it is not there yet.
 */
export function MetricsHubView({ projectId, data }: { projectId: string; data: HubData | null }) {
  if (!data) return <LockedHub />
  const t = data.totals
  const empty = t.sessions === 0
  const up = data.previousSessions > 0 ? ((t.sessions - data.previousSessions) / data.previousSessions) * 100 : null
  const summary = data.summary
  const found = data.found
  const series = { bucket: data.bucket, points: data.series.map(sessions => ({ sessions })) }

  return (
    <Link href={`/projects/${projectId}/metricas`} className="group relative block overflow-hidden rounded-3xl border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.14] via-blue-500/[0.07] to-transparent p-6 transition hover:border-violet-300/50 hover:from-violet-500/20">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/25 ring-1 ring-violet-300/30"><BarChart3 className="h-6 w-6 text-violet-200" /></div>
          <div>
            <p className="text-base font-semibold text-white">Central de análise de comportamento</p>
            <p className="text-xs text-gray-400">Resumo dos últimos 7 dias da página publicada</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-lg shadow-violet-900/30 transition group-hover:gap-3">
          Abrir a central <ArrowRight className="h-4 w-4" />
        </span>
      </div>

      {empty ? (
        <div className="relative mt-6 rounded-2xl border border-white/10 bg-black/20 px-5 py-6 text-center">
          <p className="text-sm font-medium text-white">Ainda não chegou ninguém na página publicada</p>
          <p className="mx-auto mt-1 max-w-lg text-xs text-gray-400">Assim que as primeiras visitas chegarem, o resumo aparece aqui: de onde veio cada visitante, o que fez e onde saiu.</p>
        </div>
      ) : (
        <div className="relative mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {[
              { icon: Users, label: 'Visitantes', value: n(t.visitors), hint: up === null ? 'novo' : `${up >= 0 ? '+' : ''}${p1(up)}`, good: up === null || up >= 0 },
              { icon: Target, label: 'Conversão', value: p1(t.conversionRate), hint: `${n(t.conversions)} conversões` },
              { icon: Clock, label: 'Tempo ativo', value: dur(t.avgActiveSec), hint: 'média por visita' },
              { icon: Layers, label: 'Rolagem', value: `${Math.round(t.avgScroll)}%`, hint: 'da página, em média' },
            ].map(k => (
              <div key={k.label} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400"><k.icon className="h-3.5 w-3.5" />{k.label}</div>
                <div className="mt-1 text-2xl font-semibold tracking-tight text-white">{k.value}</div>
                <div className={`text-[11px] ${'good' in k ? (k.good ? 'text-emerald-400' : 'text-red-400') : 'text-gray-500'}`}>{k.hint}</div>
              </div>
            ))}
            <div className="col-span-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 sm:col-span-4 lg:col-span-2 xl:col-span-4">
              <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-gray-400"><span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" />Visitas por {series.bucket === 'hour' ? 'hora' : 'dia'}</span><span>{n(t.sessions)} no total</span></div>
              <Spark data={series.points.map(x => x.sessions)} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-200"><Sparkles className="h-3.5 w-3.5" />Resumo das análises</div>
            {summary && <p className="text-sm leading-relaxed text-gray-100">{summary}</p>}
            <ul className="mt-4 space-y-2.5">
              {found.map(i => (
                <li key={i.id} className="flex gap-2.5 text-[13px] leading-snug text-gray-300">
                  {i.kind === 'problema' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" /> : i.kind === 'oportunidade' ? <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
                  <span>{i.title}</span>
                </li>
              ))}
              {found.length === 0 && <li className="text-[13px] text-gray-500">Nada que chame atenção por enquanto.</li>}
            </ul>
          </div>
        </div>
      )}
    </Link>
  )
}

/** Not published yet: the card is there (the owner should know it exists) but blurred, with what unlocks it. */
function LockedHub() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/[0.08] via-blue-500/[0.04] to-transparent p-6">
      <div aria-hidden className="pointer-events-none select-none blur-[7px] opacity-70">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-violet-500/30" />
          <div className="space-y-2"><div className="h-3.5 w-64 rounded bg-white/25" /><div className="h-2.5 w-40 rounded bg-white/15" /></div>
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><div className="h-2.5 w-16 rounded bg-white/15" /><div className="mt-2 h-6 w-20 rounded bg-white/30" /><div className="mt-2 h-2 w-14 rounded bg-white/10" /></div>)}
            <div className="col-span-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><div className="h-12 rounded bg-gradient-to-r from-violet-400/10 via-violet-400/30 to-violet-400/10" /></div>
          </div>
          <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="h-2.5 w-36 rounded bg-violet-300/30" />
            {[88, 100, 72, 94].map((w, i) => <div key={i} className="h-3 rounded bg-white/15" style={{ width: `${w}%` }} />)}
          </div>
        </div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-950/40 px-6 text-center backdrop-blur-[2px]">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20"><Lock className="h-6 w-6 text-white" /></div>
        <p className="text-lg font-semibold text-white">A central de análise libera quando você publicar a página</p>
        <p className="max-w-md text-sm text-gray-300">Assim que a página estiver publicada, tudo o que chegar nela aparece aqui: de onde veio cada visitante, o que ele fez, onde saiu, mapas de calor, gravações e análise com IA.</p>
        <p className="text-xs text-violet-200">Use o botão Publicar, no alto desta página.</p>
      </div>
    </div>
  )
}
