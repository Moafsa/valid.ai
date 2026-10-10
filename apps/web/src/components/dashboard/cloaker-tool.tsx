'use client'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, Copy, ExternalLink, Eye, Globe, HelpCircle, Link2, Loader2, Monitor, ScanSearch, Shuffle, Smartphone, XCircle } from 'lucide-react'
import { CloneHero } from './clone-hero'

interface Change { kind: string; label: string; detail: string }
interface Sc { id: string; label: string; group: string; groupLabel: string; ok: boolean; status: number | null; version: string; finalUrl: string; title: string; blocked: boolean; error?: string; changes: Change[]; sig: number; same: boolean; chain: { url: string; status: number; via: string }[]; ms?: number; bot?: boolean; mobile?: boolean; how: string }
interface Finding { group: string; groupLabel: string; kind: 'deliberate' | 'adaptive'; condition: string; scenario: string; version: string; sig: number; explained: string | null; reproducible: boolean; evidence: string[]; changes: Change[]; alternatives: string[] }
interface Analysis {
  status: 'green' | 'yellow' | 'red' | 'gray'; confidence: number | null; headline: string; explanation: string; caveat: string | null
  counts: { scenarios: number; ok: number; failed: number; different: number; groups: number }
  scenarios: Sc[]; findings: Finding[]; evidence: string[]; alternatives: string[]
  versions: { letter: string; probes: string[]; rep: string; finalUrl: string; title: string }[]
  matrix: { group: string; label: string; tested: number; ok: number }[]
  pair: { a: string; b: string | null } | null
  consistency: { baseline?: { samples: number; maxDifference: number; stable: boolean }; realVisitor?: { samples: number; maxDifference: number; stable: boolean } }
  noise: number; tech: { name: string; kind: string }[]; tells: string[]; paramsKept: Record<string, { inFinalUrl: boolean; inLinks: boolean }>; rotation: boolean
  redirects: { divergent: boolean; roads: { road: string; scenarios: string[] }[] }
  infra: { ips?: string[]; cdn?: string | null; serviceWorkers?: boolean }; clonePersona: string | null; cloneUrl: string | null; reference: string | null
}
interface Dom { n: Record<string, number>; scripts: string[]; images: string[]; videos: string[]; links: string[]; cta: string[]; frames: { host: string; big: boolean }[]; h1: string; sw: number }
interface Probe { id: string; label: string; group: string; ok: boolean; status?: number; finalUrl?: string; title?: string; text?: string; shot?: string; chain?: { url: string; status: number; via: string }[]; headers?: Record<string, string>; cookies?: string[]; late?: unknown; dom?: Dom }
interface Job { id: string; status: 'queued' | 'running' | 'done' | 'error'; done: number; total: number; probes: Probe[]; analysis?: Analysis; error?: string; url: string }

const STATUS = {
  green: { emoji: '🟢', box: 'border-emerald-500/30 bg-emerald-500/[0.07]', bar: 'bg-emerald-400' },
  yellow: { emoji: '🟡', box: 'border-amber-500/30 bg-amber-500/[0.07]', bar: 'bg-amber-400' },
  red: { emoji: '🔴', box: 'border-red-500/30 bg-red-500/[0.07]', bar: 'bg-red-400' },
  gray: { emoji: '⚪', box: 'border-white/15 bg-white/[0.04]', bar: 'bg-gray-400' },
} as const
const VCOLOR: Record<string, string> = { A: 'bg-blue-500/20 text-blue-200 border-blue-400/40', B: 'bg-rose-500/20 text-rose-200 border-rose-400/40', C: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40', D: 'bg-amber-500/20 text-amber-200 border-amber-400/40', E: 'bg-violet-500/20 text-violet-200 border-violet-400/40', F: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40' }
const PERSONA_NAME: Record<string, string> = { ig_ios: 'Instagram no iPhone', ig_android: 'Instagram no Android', fb_android: 'Facebook no Android', fb_ios: 'Facebook no iPhone', tiktok: 'TikTok', google_mobile: 'Google no celular' }
const host = (u?: string) => { try { return new URL(u || '').hostname.replace(/^www\./, '') } catch { return u || '' } }
const pathOf = (u?: string) => { try { const p = new URL(u || ''); return (p.pathname + p.search).slice(0, 24) } catch { return '' } }
const sentences = (t: string) => (t || '').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 3)

function Chip({ v }: { v: string }) {
  return <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-xs font-bold ${VCOLOR[v] || 'border-white/15 bg-white/5 text-gray-400'}`}>{v}</span>
}

export function CloakerTool() {
  const [url, setUrl] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showClone, setShowClone] = useState(false)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [tab, setTab] = useState<'visual' | 'texto' | 'elementos' | 'redirects' | 'headers'>('visual')
  const [onlyDiff, setOnlyDiff] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cloneRef = useRef<HTMLDivElement>(null)
  const compareRef = useRef<HTMLDivElement>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const poll = (id: string, started: number) => {
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/cloaker?id=${id}&brief=1`, { cache: 'no-store' })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Falha ao ler o teste')
        if (j.status === 'done' || j.status === 'error') {
          const fr = await fetch(`/api/cloaker?id=${id}`, { cache: 'no-store' })
          const full = await fr.json()
          if (!fr.ok) throw new Error(full.error || 'Falha ao ler o resultado')
          setJob(full); setBusy(false)
          if (full.analysis?.pair) { setA(full.analysis.pair.a || ''); setB(full.analysis.pair.b || full.analysis.pair.a || '') }
          return
        }
        setJob(j)
      } catch (e: any) {
        if (Date.now() - started > 8 * 60_000) { setBusy(false); setError(e.message); return }
      }
      if (Date.now() - started > 8 * 60_000) { setBusy(false); setError('O teste demorou demais. Tente de novo.'); return }
      poll(id, started)
    }, 2000)
  }

  const start = async () => {
    setError(null); setJob(null); setShowClone(false); setBusy(true); setOpen(null)
    try {
      const r = await fetch('/api/cloaker', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Não consegui testar')
      setJob({ id: j.id, status: 'queued', done: 0, total: 46, probes: [], url })
      poll(j.id, Date.now())
    } catch (e: any) { setBusy(false); setError(e.message) }
  }

  const an = job?.analysis
  const probes = useMemo(() => new Map((job?.probes || []).map(p => [p.id, p])), [job])
  const scById = useMemo(() => new Map((an?.scenarios || []).map(s => [s.id, s])), [an])
  const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
  const st = an ? STATUS[an.status] : null
  const shown = (an?.scenarios || []).filter(s => !onlyDiff || !s.same || !s.ok || s.group === 'baseline' || s.blocked)
  const groups = useMemo(() => {
    const m = new Map<string, Sc[]>()
    for (const s of shown) m.set(s.groupLabel, [...(m.get(s.groupLabel) || []), s])
    return [...m.entries()]
  }, [shown])
  const pa = probes.get(a), pb = probes.get(b)
  const compare = (id: string) => { setB(id); setTab('visual'); setTimeout(() => compareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40) }

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20"><ScanSearch className="h-5 w-5 text-red-300" /></div>
          <h1 className="text-2xl font-bold text-white">Detector de cloaker</h1>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-gray-400">Cole um link. A gente abre ele dezenas de vezes, mudando uma condição de cada vez (aparelho, navegador, robô, origem do clique, parâmetros do anúncio, idioma, região, cookies, primeira visita) e compara o que muda. Só aponta cloaking quando uma condição que parece proposital muda a página de verdade, e mostra o porquê.</p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && url.trim() && !busy && start()} placeholder="https://link-do-anuncio.com/oferta" disabled={busy}
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-violet-400/60 focus:outline-none" />
          <button onClick={start} disabled={busy || !url.trim()} className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:from-violet-500 hover:to-blue-500 disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} {busy ? 'Testando…' : 'Analisar link'}
          </button>
        </div>
        {error && <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        {job && job.status !== 'done' && job.status !== 'error' && (
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-gray-400"><span>{job.status === 'queued' ? 'Na fila…' : 'Abrindo o link em vários cenários, um de cada vez…'}</span><span>{job.done} de {job.total}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-500" style={{ width: `${Math.max(4, Math.min(100, (job.done / Math.max(job.total, 1)) * 100))}%` }} /></div>
            <div className="mt-3 flex max-h-24 flex-wrap gap-1.5 overflow-hidden">{job.probes.slice(-18).map(p => <span key={p.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] ${p.ok ? 'bg-white/10 text-gray-300' : 'bg-red-500/15 text-red-300'}`}>{p.ok ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <XCircle className="h-3 w-3" />}{p.label}</span>)}</div>
            <p className="mt-2 text-[11px] text-gray-500">Leva de 1 a 3 minutos.</p>
          </div>
        )}
        {job?.status === 'error' && <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{job.error || 'O teste falhou.'}</p>}
      </div>

      {an && st && job && (
        <>
          {/* the verdict */}
          <div className={`rounded-3xl border p-6 ${st.box}`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-3xl leading-none">{st.emoji}</span>
              <h2 className="text-xl font-bold text-white">{an.headline}</h2>
              {an.confidence != null && <span className="rounded-full bg-black/30 px-3 py-1 text-sm font-semibold text-white">Confiança: {an.confidence}%</span>}
              {an.rotation && <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2.5 py-0.5 text-xs text-violet-200"><Shuffle className="h-3 w-3" /> a mesma condição recebe páginas diferentes</span>}
            </div>
            {an.confidence != null && <div className="mt-3 h-1.5 max-w-md overflow-hidden rounded-full bg-black/30"><div className={`h-full rounded-full ${st.bar}`} style={{ width: `${an.confidence}%` }} /></div>}
            <p className="mt-3 max-w-3xl text-sm text-gray-200">{an.explanation}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-300">
              <span className="rounded-full bg-black/25 px-3 py-1">{an.counts.scenarios} cenários testados</span>
              <span className="rounded-full bg-black/25 px-3 py-1">{an.counts.different} com diferença</span>
              <span className="rounded-full bg-black/25 px-3 py-1">{an.counts.groups} tipos de condição</span>
              {an.counts.failed > 0 && <span className="rounded-full bg-black/25 px-3 py-1">{an.counts.failed} não responderam</span>}
              <span className="rounded-full bg-black/25 px-3 py-1" title="Quanto a própria página muda entre visitas iguais">variação natural: {Math.round(an.noise * 100)}%</span>
            </div>
          </div>

          {/* evidence and alternative causes */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Evidências" icon={<Eye className="h-4 w-4" />}>
              {an.evidence.length === 0 ? <p className="text-sm text-gray-500">Nenhuma diferença relevante para apontar.</p> : <ul className="space-y-2.5 text-sm text-gray-200">{an.evidence.map((e, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />{e}</li>)}</ul>}
            </Card>
            <Card title="Outras causas possíveis (evita falso alarme)" icon={<HelpCircle className="h-4 w-4" />}>
              {an.alternatives.length === 0 ? <p className="text-sm text-gray-500">Sem diferenças a explicar por outras causas.</p> : <ul className="space-y-2.5 text-sm text-gray-300">{an.alternatives.map((e, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />{e}</li>)}</ul>}
            </Card>
          </div>

          {/* condition -> version -> difference -> evidence -> confidence */}
          {an.findings.length > 0 && (
            <Card title="Qual condição muda a página" icon={<AlertTriangle className="h-4 w-4" />}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-gray-500"><tr><th className="py-2 pr-3 font-medium">Condição</th><th className="py-2 pr-3 font-medium">Versão</th><th className="py-2 pr-3 font-medium">Diferença</th><th className="py-2 pr-3 font-medium">Natureza</th><th className="py-2 font-medium">Confiança</th></tr></thead>
                  <tbody>
                    {an.findings.map(f => (
                      <Fragment key={f.group}>
                        <tr className="cursor-pointer border-t border-white/5 align-top hover:bg-white/[0.03]" onClick={() => setOpen(open === f.group ? null : f.group)}>
                          <td className="py-2.5 pr-3"><div className="font-medium text-white">{f.groupLabel}</div><div className="text-xs text-gray-500">{f.condition}</div></td>
                          <td className="py-2.5 pr-3"><Chip v={f.version} /></td>
                          <td className="max-w-[340px] py-2.5 pr-3 text-xs text-gray-300">{f.changes.slice(0, 4).map(c => c.label).join(' · ') || '—'}</td>
                          <td className="py-2.5 pr-3">{f.explained ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300" title={f.explained}>normal</span> : f.kind === 'deliberate' ? <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">parece proposital</span> : <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-gray-300">adaptação</span>}</td>
                          <td className="py-2.5 text-gray-300">{Math.round(40 + f.sig * 55)}%</td>
                        </tr>
                        {open === f.group && (
                          <tr className="bg-black/20"><td colSpan={5} className="px-3 py-3">
                            <ul className="space-y-1.5 text-xs text-gray-300">{f.evidence.map((e, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" />{e}</li>)}</ul>
                            {f.explained && <p className="mt-2 text-xs text-emerald-300">{f.explained}</p>}
                            {f.alternatives.length > 0 && <p className="mt-2 text-xs text-amber-300">Pode ser também: {f.alternatives.join('; ')}</p>}
                            <p className="mt-2 text-xs text-gray-500">{f.reproducible ? 'Repetiu em todas as visitas feitas com essa condição.' : 'Não se repetiu em todas as visitas.'}</p>
                            <button onClick={e => { e.stopPropagation(); compare(f.scenario) }} className="mt-2 rounded-lg border border-white/15 px-3 py-1 text-xs text-gray-200 hover:bg-white/5">Comparar lado a lado</button>
                          </td></tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-gray-500">Clique numa linha para ver as evidências.</p>
            </Card>
          )}

          {/* real address + clone */}
          {(an.status === 'red' || an.status === 'yellow') && an.cloneUrl && an.clonePersona && (
            <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.10] to-transparent p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><Link2 className="h-4 w-4" /> Endereço real liberado</p>
                  <p className="mt-1 break-all text-sm text-white">{an.cloneUrl}</p>
                  <p className="mt-1 text-xs text-gray-400">É para onde o visitante de verdade vai parar. Para clonar, a gente entra como ele ({PERSONA_NAME[an.clonePersona] || 'visitante do anúncio'}, vindo do clique do anúncio).</p>
                </div>
                <div className="flex max-w-full flex-wrap gap-2">
                  <button onClick={() => { navigator.clipboard?.writeText(an.cloneUrl || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs text-gray-200 hover:bg-white/5"><Copy className="h-3.5 w-3.5" />{copied ? 'Copiado' : 'Copiar'}</button>
                  <a href={an.cloneUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs text-gray-200 hover:bg-white/5"><ExternalLink className="h-3.5 w-3.5" />Abrir</a>
                  <button onClick={() => { setShowClone(true); setTimeout(() => cloneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50) }} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-200">Clonar a página real</button>
                </div>
              </div>
            </div>
          )}
          {(an.status === 'green' || an.status === 'gray') && !showClone && <div className="text-center"><button onClick={() => setShowClone(true)} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-gray-300 hover:bg-white/5">Clonar esta página mesmo assim</button></div>}
          {showClone && (
            <div ref={cloneRef}>
              <CloneHero initialUrl={an.cloneUrl && an.status !== 'green' && an.status !== 'gray' ? an.cloneUrl : normalized} persona={an.status === 'red' || an.status === 'yellow' ? an.clonePersona || undefined : undefined}
                heading={an.status === 'red' || an.status === 'yellow' ? 'Clonar a página real' : 'Clonar a página'} subheading={an.status === 'red' || an.status === 'yellow' ? 'Vai abrir o link como o visitante que veio do anúncio e clonar o que ele vê.' : undefined} />
            </div>
          )}

          {/* matrix of environments */}
          <Card title="Ambientes analisados" icon={<Globe className="h-4 w-4" />}>
            <div className="flex flex-wrap gap-2">
              {an.matrix.map(m => (
                <span key={m.group} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${m.ok === m.tested ? 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200' : m.ok > 0 ? 'border-amber-500/25 bg-amber-500/[0.07] text-amber-200' : 'border-red-500/25 bg-red-500/[0.07] text-red-200'}`}>
                  {m.ok === m.tested ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{m.label}<span className="opacity-60">{m.ok}/{m.tested}</span>
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-500">Cada tipo de condição foi testado mudando só ela em relação ao visitante comum. “Região” é simulada por cabeçalhos: o endereço de rede (IP) real do teste não muda.</p>
          </Card>

          {/* versions by scenario */}
          <Card title="Comparação das versões recebidas" icon={<Monitor className="h-4 w-4" />} right={<label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} className="accent-violet-500" />só os que mudaram</label>}>
            <div className="mb-3 flex flex-wrap gap-2">{an.versions.map(v => <span key={v.letter} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-gray-300"><Chip v={v.letter} />{v.letter === 'A' ? 'visitante comum' : `${host(v.finalUrl)} · ${(v.title || 'sem título').slice(0, 28)}`}</span>)}</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-gray-500"><tr><th className="py-2 pr-3 font-medium">Cenário testado</th><th className="py-2 pr-3 font-medium">Página</th><th className="py-2 pr-3 font-medium">HTTP</th><th className="py-2 pr-3 font-medium">Chegou em</th><th className="py-2 font-medium">Conteúdo recebido</th></tr></thead>
                <tbody>
                  {groups.map(([g, rows]) => (
                    <Fragment key={g}>
                      <tr><td colSpan={5} className="pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-violet-300">{g}</td></tr>
                      {rows.map(s => (
                        <tr key={s.id} onClick={() => s.ok && compare(s.id)} className={`cursor-pointer border-t border-white/5 align-top hover:bg-white/[0.04] ${s.id === b ? 'bg-violet-500/[0.08]' : ''}`}>
                          <td className="py-2 pr-3 text-gray-200"><span className="inline-flex items-center gap-1.5">{s.bot ? <Bot className="h-3.5 w-3.5 shrink-0 text-gray-500" /> : s.mobile ? <Smartphone className="h-3.5 w-3.5 shrink-0 text-gray-500" /> : <Monitor className="h-3.5 w-3.5 shrink-0 text-gray-500" />}{s.label}</span></td>
                          <td className="py-2 pr-3">{s.ok ? <Chip v={s.version} /> : <span className="text-xs text-red-300">falhou</span>}</td>
                          <td className="py-2 pr-3"><span className={`rounded px-1.5 py-0.5 text-xs ${!s.ok ? 'bg-red-500/15 text-red-300' : s.blocked ? 'bg-amber-500/15 text-amber-300' : 'bg-white/10 text-gray-300'}`}>{s.ok ? s.status : '—'}</span></td>
                          <td className="max-w-[200px] truncate py-2 pr-3 text-xs text-gray-400" title={s.finalUrl}>{host(s.finalUrl)}<span className="text-gray-600">{pathOf(s.finalUrl)}</span></td>
                          <td className="py-2 text-xs">{s.id === an.reference ? <span className="text-gray-500">referência</span> : !s.ok ? <span className="text-red-300">não respondeu</span> : s.blocked ? <span className="text-amber-300">o site recusou este visitante (HTTP {s.status})</span> : s.changes.length === 0 ? <span className="text-gray-500">igual à referência</span> : <span className={s.same ? 'text-gray-400' : 'text-amber-300'}>{!s.same && '⚠️ '}{s.changes.slice(0, 3).map(c => c.label).join(' · ')}{s.changes.length > 3 && ` +${s.changes.length - 3}`}</span>}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500">Todos os cenários testados aparecem aqui, com o que cada um recebeu. Clique numa linha para comparar aquela versão com a referência logo abaixo.</p>
          </Card>

          {/* side by side */}
          <div ref={compareRef} className="scroll-mt-4">
            <Card title="Comparação lado a lado" icon={<Eye className="h-4 w-4" />}>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <Pick label="Página A" value={a} onChange={setA} probes={job.probes} scById={scById} />
                <Pick label="Página B" value={b} onChange={setB} probes={job.probes} scById={scById} />
              </div>
              <div className="mb-4 flex flex-wrap gap-1.5">{([['visual', 'Visual'], ['texto', 'Texto'], ['elementos', 'O que mudou'], ['redirects', 'Redirecionamentos'], ['headers', 'Cabeçalhos e cookies']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-full border px-3.5 py-1.5 text-xs transition ${tab === k ? 'border-violet-400/60 bg-violet-500/15 text-white' : 'border-white/10 text-gray-400 hover:text-white'}`}>{l}</button>)}</div>
              {!pa || !pb ? <p className="py-8 text-center text-sm text-gray-500">Escolha duas páginas para comparar.</p> : (
                <>
                  {tab === 'visual' && (
                    <div className="grid gap-4 md:grid-cols-2">
                      {[[pa, a], [pb, b]].map(([p, id], i) => {
                        const pr = p as Probe
                        return (
                          <div key={i} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                            <div className="flex items-center gap-2 p-3 text-xs text-gray-300"><Chip v={scById.get(id as string)?.version || '—'} /><span className="truncate">{pr.label}</span></div>
                            {pr.shot ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={pr.shot} alt="" className="max-h-[480px] w-full bg-white object-cover object-top" /> : <p className="px-3 pb-6 text-xs text-gray-500">Sem imagem (acesso sem navegador).</p>}
                            <div className="p-3"><p className="truncate text-xs text-violet-300" title={pr.finalUrl}>{pr.finalUrl}</p><p className="mt-0.5 text-sm font-medium text-white">{pr.title || 'Sem título'}</p></div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {tab === 'texto' && <TextDiff a={pa.text || ''} b={pb.text || ''} />}
                  {tab === 'elementos' && <Elements pa={pa} pb={pb} />}
                  {tab === 'redirects' && <div className="grid gap-4 md:grid-cols-2">{[pa, pb].map(p => <Timeline key={p.id} p={p} />)}</div>}
                  {tab === 'headers' && <Headers pa={pa} pb={pb} />}
                </>
              )}
            </Card>
          </div>

          {/* redirect roads */}
          <Card title="Redirecionamentos: caminhos percorridos" icon={<ArrowRight className="h-4 w-4" />}>
            <p className="mb-3 text-sm text-gray-300">{an.redirects.divergent ? 'Cenários diferentes seguiram caminhos diferentes até a página final.' : 'Todos os cenários seguiram o mesmo caminho.'}</p>
            <div className="space-y-2">{an.redirects.roads.map(r => <div key={r.road} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"><p className="break-words text-sm text-white">{r.road}</p><p className="mt-1 text-[11px] text-gray-500">{r.scenarios.length} cenário(s): {r.scenarios.slice(0, 6).map(id => scById.get(id)?.label || id).join(', ')}{r.scenarios.length > 6 && '…'}</p></div>)}</div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Teste de consistência" icon={<Shuffle className="h-4 w-4" />}>
              <ul className="space-y-2 text-sm text-gray-300">
                {an.consistency.baseline && <li className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2"><span>Visitante comum, {an.consistency.baseline.samples} visitas independentes</span>{an.consistency.baseline.stable ? <span className="shrink-0 text-emerald-300">sempre a mesma página</span> : <span className="shrink-0 text-amber-300">muda sozinha ({Math.round(an.consistency.baseline.maxDifference * 100)}%)</span>}</li>}
                {an.consistency.realVisitor && <li className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2"><span>Visitante de anúncio, {an.consistency.realVisitor.samples} visitas independentes</span>{an.consistency.realVisitor.stable ? <span className="shrink-0 text-emerald-300">sempre a mesma página</span> : <span className="shrink-0 text-amber-300">páginas diferentes ({Math.round(an.consistency.realVisitor.maxDifference * 100)}%)</span>}</li>}
              </ul>
              <p className="mt-3 text-xs text-gray-500">Se a mesma condição recebe conteúdos diferentes em momentos diferentes, pode ser cache, sessão, cookies, rotação de ofertas ou lógica condicional.</p>
            </Card>
            <Card title="Sinais encontrados" icon={<Eye className="h-4 w-4" />}>
              {an.tech.length === 0 && an.tells.length === 0 && !an.infra.cdn && !an.infra.serviceWorkers ? <p className="text-sm text-gray-500">Nenhuma ferramenta de roteamento nem script de verificação reconhecidos.</p> : (
                <ul className="space-y-2 text-sm text-gray-300">
                  {an.tech.map(t => <li key={t.name} className="flex gap-2"><Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />{t.name}</li>)}
                  {an.tells.map(t => <li key={t} className="flex gap-2"><Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />{t}</li>)}
                  {an.infra.cdn && <li className="flex gap-2"><Globe className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />Atrás de {an.infra.cdn} (CDN)</li>}
                  {an.infra.serviceWorkers && <li className="flex gap-2"><Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />A página registra um Service Worker</li>}
                </ul>
              )}
              <p className="mt-3 text-xs text-gray-500">Achar uma dessas ferramentas não prova cloaking: o veredicto vem do comportamento medido.</p>
            </Card>
          </div>

          <Card title="O rastreamento do anúncio chega até o fim?" icon={<Link2 className="h-4 w-4" />}>
            {Object.keys(an.paramsKept).length === 0 ? <p className="text-sm text-gray-500">Não deu para testar.</p> : (
              <ul className="grid gap-1.5 text-sm sm:grid-cols-3">
                {Object.entries(an.paramsKept).map(([k, v]) => <li key={k} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-1.5"><code className="text-gray-300">{k}</code>{v.inFinalUrl || v.inLinks ? <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />{v.inFinalUrl ? 'chegou' : 'nos links'}</span> : <span className="inline-flex items-center gap-1 text-xs text-red-300"><XCircle className="h-3.5 w-3.5" />perdido</span>}</li>)}
              </ul>
            )}
          </Card>
          {an.caveat && <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-gray-400">{an.caveat}</p>}
        </>
      )}
    </div>
  )
}

function Card({ title, icon, right, children }: { title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-400">{icon}{title}</h3>{right}</div>
      {children}
    </div>
  )
}

function Pick({ label, value, onChange, probes, scById }: { label: string; value: string; onChange: (v: string) => void; probes: Probe[]; scById: Map<string, Sc> }) {
  return (
    <label className="block text-xs text-gray-400">{label}
      <select value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-violet-400/60 focus:outline-none">
        <option value="" className="bg-gray-900">—</option>
        {probes.filter(p => p.ok).map(p => <option key={p.id} value={p.id} className="bg-gray-900">[{scById.get(p.id)?.version || '—'}] {p.label}</option>)}
      </select>
    </label>
  )
}

function TextDiff({ a, b }: { a: string; b: string }) {
  const sa = sentences(a), sb = sentences(b)
  const setA = new Set(sa.map(s => s.toLowerCase())), setB = new Set(sb.map(s => s.toLowerCase()))
  const onlyA = sa.filter(s => !setB.has(s.toLowerCase())), onlyB = sb.filter(s => !setA.has(s.toLowerCase()))
  const wa = new Set(a.toLowerCase().match(/[a-zà-ú0-9]{3,}/g) || []), wb = new Set(b.toLowerCase().match(/[a-zà-ú0-9]{3,}/g) || [])
  const common = [...wa].filter(w => wb.has(w)).length
  const union = wa.size + wb.size - common
  const sim = union ? Math.round((common / union) * 100) : 100
  return (
    <div>
      <p className="mb-3 text-sm text-gray-300">Textos {sim >= 90 ? 'praticamente iguais' : sim >= 60 ? 'parecidos, com diferenças' : 'bem diferentes'}: <b className="text-white">{sim}%</b> das palavras em comum.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div><p className="mb-2 text-xs font-semibold text-rose-300">Só na página A ({onlyA.length})</p><div className="space-y-1.5">{onlyA.slice(0, 14).map((s, i) => <p key={i} className="rounded-lg border border-rose-500/20 bg-rose-500/[0.07] px-3 py-1.5 text-xs text-gray-200">{s}</p>)}{onlyA.length === 0 && <p className="text-xs text-gray-500">Nada exclusivo.</p>}</div></div>
        <div><p className="mb-2 text-xs font-semibold text-emerald-300">Só na página B ({onlyB.length})</p><div className="space-y-1.5">{onlyB.slice(0, 14).map((s, i) => <p key={i} className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5 text-xs text-gray-200">{s}</p>)}{onlyB.length === 0 && <p className="text-xs text-gray-500">Nada exclusivo.</p>}</div></div>
      </div>
    </div>
  )
}

const COUNT_LABEL: Record<string, string> = { all: 'Elementos na página', img: 'Imagens', video: 'Vídeos', iframe: 'Iframes', script: 'Scripts', a: 'Links', button: 'Botões', form: 'Formulários' }

function Elements({ pa, pb }: { pa: Probe; pb: Probe }) {
  const n = (p: Probe, k: string) => p.dom?.n?.[k] ?? 0
  const list = (x?: string[]) => x || []
  const only = (x: string[], y: string[]) => x.filter(i => !y.includes(i))
  const side = (k: 'scripts' | 'links' | 'images', limit: number) => {
    const A = only(list(pa.dom?.[k]), list(pb.dom?.[k])), B = only(list(pb.dom?.[k]), list(pa.dom?.[k]))
    return { a: A.slice(0, limit).join(', ') || '—', b: B.slice(0, limit).join(', ') || '—', diff: A.length + B.length > 2 }
  }
  const big = (p: Probe) => !!p.dom?.frames?.some(f => f.big)
  const rows: { label: string; a: string; b: string; diff: boolean }[] = [
    { label: 'Título da aba', a: pa.title || '—', b: pb.title || '—', diff: (pa.title || '') !== (pb.title || '') },
    { label: 'Título principal (H1)', a: pa.dom?.h1 || '—', b: pb.dom?.h1 || '—', diff: (pa.dom?.h1 || '') !== (pb.dom?.h1 || '') },
    { label: 'Endereço final', a: pa.finalUrl || '—', b: pb.finalUrl || '—', diff: (pa.finalUrl || '') !== (pb.finalUrl || '') },
    { label: 'Resposta HTTP', a: String(pa.status ?? '—'), b: String(pb.status ?? '—'), diff: pa.status !== pb.status },
    { label: 'Redirecionamentos', a: String(Math.max(0, (pa.chain?.length || 1) - 1)), b: String(Math.max(0, (pb.chain?.length || 1) - 1)), diff: (pa.chain?.length || 0) !== (pb.chain?.length || 0) },
    ...Object.keys(COUNT_LABEL).map(k => ({ label: COUNT_LABEL[k], a: String(n(pa, k)), b: String(n(pb, k)), diff: Math.max(n(pa, k), n(pb, k)) >= 3 && Math.abs(n(pa, k) - n(pb, k)) / Math.max(n(pa, k), n(pb, k), 1) > 0.3 })),
    { label: 'Botões de ação (CTA)', a: list(pa.dom?.cta).join(' · ') || '—', b: list(pb.dom?.cta).join(' · ') || '—', diff: list(pa.dom?.cta).join('|') !== list(pb.dom?.cta).join('|') },
    { label: 'Vídeos', a: list(pa.dom?.videos).join(', ') || '—', b: list(pb.dom?.videos).join(', ') || '—', diff: list(pa.dom?.videos).join('|') !== list(pb.dom?.videos).join('|') },
    { label: 'Scripts só nesta versão', ...side('scripts', 5) },
    { label: 'Links só nesta versão', ...side('links', 4) },
    { label: 'Imagens só nesta versão', ...side('images', 4) },
    { label: 'Iframe de tela cheia', a: big(pa) ? 'sim' : 'não', b: big(pb) ? 'sim' : 'não', diff: big(pa) !== big(pb) },
    { label: 'Mudou depois de carregar', a: pa.late ? 'sim' : 'não', b: pb.late ? 'sim' : 'não', diff: !!pa.late !== !!pb.late },
    { label: 'Service Worker', a: pa.dom?.sw ? 'sim' : 'não', b: pb.dom?.sw ? 'sim' : 'não', diff: !!pa.dom?.sw !== !!pb.dom?.sw },
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wide text-gray-500"><tr><th className="py-2 pr-3 font-medium">O quê</th><th className="py-2 pr-3 font-medium">Página A</th><th className="py-2 pr-3 font-medium">Página B</th><th className="w-8 py-2 font-medium" /></tr></thead>
        <tbody className="divide-y divide-white/5">
          {rows.map(r => <tr key={r.label} className={r.diff ? 'bg-amber-500/[0.06]' : ''}><td className="py-2 pr-3 text-gray-300">{r.label}</td><td className="max-w-[260px] break-words py-2 pr-3 text-xs text-gray-200">{r.a}</td><td className="max-w-[260px] break-words py-2 pr-3 text-xs text-gray-200">{r.b}</td><td className="py-2 text-right">{r.diff ? '⚠️' : <span className="text-gray-600">—</span>}</td></tr>)}
        </tbody>
      </table>
    </div>
  )
}

function Timeline({ p }: { p: Probe }) {
  const chain = p.chain || []
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="mb-3 text-xs font-semibold text-gray-300">{p.label}</p>
      <ol>
        {chain.map((s, i) => (
          <li key={i} className="flex gap-3 text-xs">
            <span className="flex flex-col items-center"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${i === chain.length - 1 ? 'bg-emerald-400' : s.via === 'js' || s.via === 'meta' ? 'bg-amber-400' : 'bg-violet-400'}`} />{i < chain.length - 1 && <span className="my-1 w-px flex-1 bg-white/15" />}</span>
            <span className="min-w-0 pb-3">
              <span className="text-[10px] uppercase tracking-wide text-gray-500">{i === 0 ? 'URL inicial' : i === chain.length - 1 ? 'Página final' : `Redirect ${i}`}</span>
              <span className="block break-all text-gray-200">{s.url.replace(/^https?:\/\//, '').slice(0, 100)}</span>
              <span className="text-gray-500">{s.via === 'js' ? 'chegou por JavaScript' : s.via === 'meta' ? 'chegou por meta refresh' : `HTTP ${s.status}`}</span>
            </span>
          </li>
        ))}
        {chain.length === 0 && <li className="text-xs text-gray-500">Sem registro de caminho.</li>}
      </ol>
    </div>
  )
}

function Headers({ pa, pb }: { pa: Probe; pb: Probe }) {
  const ha = pa.headers || {}, hb = pb.headers || {}
  const keys = [...new Set([...Object.keys(ha), ...Object.keys(hb)])].sort()
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase text-gray-500"><tr><th className="py-1.5 pr-2 font-medium">Cabeçalho</th><th className="py-1.5 pr-2 font-medium">A</th><th className="py-1.5 font-medium">B</th></tr></thead>
          <tbody className="divide-y divide-white/5">
            {keys.map(k => <tr key={k} className={ha[k] !== hb[k] ? 'bg-amber-500/[0.06]' : ''}><td className="py-1.5 pr-2 text-gray-300">{k}</td><td className="max-w-[160px] break-words py-1.5 pr-2 text-gray-400">{ha[k] || '—'}</td><td className="max-w-[160px] break-words py-1.5 text-gray-400">{hb[k] || '—'}</td></tr>)}
            {keys.length === 0 && <tr><td colSpan={3} className="py-3 text-gray-500">Sem cabeçalhos registrados.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 text-xs">
        <div><p className="mb-1 font-semibold text-gray-300">Cookies definidos na página A</p><p className="text-gray-400">{(pa.cookies || []).join(', ') || 'nenhum'}</p></div>
        <div><p className="mb-1 font-semibold text-gray-300">Cookies definidos na página B</p><p className="text-gray-400">{(pb.cookies || []).join(', ') || 'nenhum'}</p></div>
      </div>
    </div>
  )
}
