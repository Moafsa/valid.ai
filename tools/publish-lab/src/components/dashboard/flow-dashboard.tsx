'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, Clock, ExternalLink, Eye, Flag, GitBranch, Info, LayoutList, Loader2, Map as MapIcon,
  Maximize2, MousePointerClick, Pencil, Route, Search, TrendingDown, Users, X, XCircle, ZoomIn, ZoomOut, Link2Off, Sparkles,
} from 'lucide-react'
import { buildGraph, edgePath, NODE_H, NODE_W, type FlowGraph, type GEdge, type GNode, type Issue } from '@/lib/flow-graph'
import type { FunnelStats } from '@/lib/funnel-stats'
import { FlowMap, StepCard, shortName, type FlowStep } from './flow-map'

const fmt = (n: number) => n.toLocaleString('pt-BR')
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
const secsLabel = (s: number | null) => (s === null ? '-' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${s % 60}s`)

const SEV = {
  error: { icon: XCircle, dot: 'bg-rose-400', box: 'border-rose-400/25 bg-rose-400/[0.07]', text: 'text-rose-200', label: 'Corrigir' },
  warn: { icon: AlertTriangle, dot: 'bg-amber-400', box: 'border-amber-400/25 bg-amber-400/[0.07]', text: 'text-amber-100', label: 'Atenção' },
  info: { icon: Info, dot: 'bg-sky-400', box: 'border-sky-400/20 bg-sky-400/[0.06]', text: 'text-sky-100', label: 'Dica' },
} as const

export function FlowDashboard({
  projectId, steps, stats, sourceHost, basePath,
}: {
  projectId: string
  steps: FlowStep[]
  stats: FunnelStats
  sourceHost: string | null
  basePath: string
}) {
  const graph = useMemo(() => buildGraph(steps, sourceHost), [steps, sourceHost])
  const [view, setView] = useState<'mapa' | 'lista'>('mapa')
  const [selected, setSelected] = useState<string | null>(null)
  const [fixing, setFixing] = useState<Issue | null>(null)
  const focus = useRef<((slug: string) => void) | null>(null)

  const total = stats.sessions
  const worst = useMemo(() => {
    let best: { slug: string; idx: number; p: number } | null = null
    steps.forEach((s, i) => {
      if (i >= steps.length - 1) return
      const st = stats.steps[s.slug]
      if (!st || st.visitors < 5) return
      const p = pct(st.stopped, st.visitors)
      if (p >= 15 && (!best || p > best.p)) best = { slug: s.slug, idx: i, p }
    })
    return best as { slug: string; idx: number; p: number } | null
  }, [steps, stats])

  const select = useCallback((slug: string | null, center = false) => {
    setSelected(slug)
    if (slug && center) focus.current?.(slug)
  }, [])

  const selNode = selected ? graph.nodes.find(n => n.slug === selected) ?? null : null
  const errors = graph.issues.filter(i => i.severity === 'error').length
  const warns = graph.issues.filter(i => i.severity === 'warn').length

  return (
    <div className="space-y-5">
      {/* ── numbers ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={Route} label="Etapas" value={fmt(graph.stats.steps)} sub={`${graph.stats.paths === '9999+' ? '9999+' : fmt(graph.stats.paths as number)} ${graph.stats.paths === 1 ? 'caminho' : 'caminhos'} possíveis`} />
        <Kpi icon={Users} label="Visitantes" value={stats.hasData ? fmt(total) : '-'} sub={stats.hasData ? `nos últimos ${stats.windowDays} dias` : 'ainda sem visitas'} />
        <Kpi icon={Flag} label="Chegaram no fim" value={stats.hasData ? `${pct(stats.reachedEnd, total)}%` : '-'} sub={stats.hasData ? `${fmt(stats.reachedEnd)} de ${fmt(total)}` : 'aparece com as visitas'} tone="good" />
        <Kpi icon={TrendingDown} label="Onde mais saem" value={worst ? `Etapa ${worst.idx + 1}` : '-'} sub={worst ? `${worst.p}% param aqui` : stats.hasData ? 'nenhuma queda forte' : 'aparece com as visitas'} tone={worst ? 'warn' : undefined} onClick={worst ? () => { setView('mapa'); select(worst.slug, true) } : undefined} />
        <Kpi icon={graph.issues.length ? AlertTriangle : CheckCircle2} label="Saúde do funil" value={errors + warns ? `${errors + warns} ${errors + warns === 1 ? 'aviso' : 'avisos'}` : 'Tudo certo'} sub={errors ? `${errors} precisa de correção` : warns ? 'vale conferir' : 'nenhum problema achado'} tone={errors ? 'bad' : warns ? 'warn' : 'good'} />
      </div>

      {/* ── what to look at ── */}
      {graph.issues.length > 0 && <Health issues={graph.issues} steps={steps} onPick={slug => { setView('mapa'); select(slug, true) }} onFix={setFixing} />}

      {/* ── map / list ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {([['mapa', 'Mapa', MapIcon], ['lista', 'Lista', LayoutList]] as const).map(([k, l, Icon]) => (
            <button key={k} onClick={() => setView(k)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === k ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              <Icon className="h-3.5 w-3.5" /> {l}
            </button>
          ))}
        </div>
        <a href={`${basePath}/${steps[0]?.slug ?? ''}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-300 transition hover:border-white/20 hover:text-white">
          <ExternalLink className="h-3.5 w-3.5" /> Testar o funil como visitante
        </a>
      </div>

      {view === 'mapa' ? (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0e]">
          <MapCanvas
            graph={graph}
            stats={stats}
            projectId={projectId}
            basePath={basePath}
            selected={selected}
            onSelect={slug => select(slug)}
            registerFocus={fn => { focus.current = fn }}
            steps={steps}
          />
          {selNode && (
            <Drawer node={selNode} steps={steps} stats={stats} projectId={projectId} basePath={basePath} graph={graph} onClose={() => setSelected(null)} onGo={slug => select(slug, true)} />
          )}
        </div>
      ) : (
        <FlowMap projectId={projectId} steps={steps} />
      )}

      {fixing && <FixOrigin projectId={projectId} host={sourceHost || ''} count={graph.issues.find(i => i.id === 'leak')?.steps.length ?? 0} onClose={() => setFixing(null)} />}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, tone, onClick }: { icon: typeof Eye; label: string; value: string; sub: string; tone?: 'good' | 'warn' | 'bad'; onClick?: () => void }) {
  const ring = tone === 'bad' ? 'text-rose-300' : tone === 'warn' ? 'text-amber-300' : tone === 'good' ? 'text-emerald-300' : 'text-zinc-100'
  const Tag: any = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left ${onClick ? 'transition hover:border-white/25 hover:bg-white/[0.05]' : ''}`}>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className={`text-2xl font-semibold tracking-tight ${ring}`}>{value}</div>
      <div className="mt-0.5 truncate text-xs text-zinc-500">{sub}</div>
    </Tag>
  )
}

function Health({ issues, steps, onPick, onFix }: { issues: Issue[]; steps: FlowStep[]; onPick: (slug: string) => void; onFix: (i: Issue) => void }) {
  const [open, setOpen] = useState(true)
  const idx = (slug: string) => steps.findIndex(s => s.slug === slug) + 1
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025]">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="h-4 w-4 text-zinc-400" /> O que vale arrumar <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-zinc-300">{issues.length}</span></span>
        <span className="text-xs text-zinc-500">{open ? 'esconder' : 'mostrar'}</span>
      </button>
      {open && (
        <div className="grid gap-2 px-3 pb-3 md:grid-cols-2">
          {issues.map(i => {
            const S = SEV[i.severity]
            return (
              <div key={i.id} className={`rounded-xl border p-3 ${S.box}`}>
                <div className="flex items-start gap-2.5">
                  <S.icon className={`mt-0.5 h-4 w-4 shrink-0 ${S.text}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${S.text}`}>{i.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{i.detail}</p>
                    {i.steps.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {i.steps.slice(0, 8).map(s => (
                          <button key={s} onClick={() => onPick(s)} className="rounded-md bg-black/30 px-1.5 py-0.5 text-[11px] text-zinc-300 transition hover:bg-black/50 hover:text-white">Etapa {idx(s)}</button>
                        ))}
                        {i.steps.length > 8 && <span className="px-1 text-[11px] text-zinc-500">+{i.steps.length - 8}</span>}
                      </div>
                    )}
                    {i.fix && (
                      <button onClick={() => onFix(i)} className="mt-2.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-zinc-200">Trocar tudo de uma vez</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FixOrigin({ projectId, host, count, onClose }: { projectId: string; host: string; count: number; onClose: () => void }) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/flow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromHost: host, url: url.trim() }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Não consegui trocar')
      toast.success(`${data.changed} ${data.changed === 1 ? 'link trocado' : 'links trocados'}!`)
      router.refresh()
      onClose()
    } catch (e: any) { toast.error(e.message || 'Erro') } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-white"><Link2Off className="h-4 w-4 text-rose-300" /> Trocar os links do site original</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-zinc-400">Todo botão e regra de saída que hoje leva pra <b className="text-zinc-200">{host}</b> vai passar a levar pro endereço abaixo. Vale pra {count} {count === 1 ? 'etapa' : 'etapas'}.</p>
        <input autoFocus type="url" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && /^https?:\/\//i.test(url) && submit()} placeholder="https://pay.suaoferta.com/checkout" className="mb-4 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-sky-400 focus:outline-none" />
        <button onClick={submit} disabled={busy || !/^https?:\/\/\S+\.\S+/i.test(url.trim())} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-40">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Trocar agora
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────── the map ───────────────────────────

const PAD = 60
const PHONE = { w: 390, h: 640 }

function MapCanvas({
  graph, stats, projectId, basePath, selected, onSelect, registerFocus, steps,
}: {
  graph: FlowGraph
  stats: FunnelStats
  projectId: string
  basePath: string
  selected: string | null
  onSelect: (slug: string | null) => void
  registerFocus: (fn: (slug: string) => void) => void
  steps: FlowStep[]
}) {
  const box = useRef<HTMLDivElement>(null)
  const [t, setT] = useState({ x: 0, y: 0, k: 1 })
  const [hover, setHover] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null)
  const byslug = useMemo(() => new Map(graph.nodes.map(n => [n.slug, n])), [graph])
  const heavy = graph.nodes.length > 80

  const fit = useCallback(() => {
    const el = box.current
    if (!el) return
    const w = el.clientWidth, h = el.clientHeight
    const k = Math.max(0.12, Math.min(1, (w - PAD * 2) / graph.width, (h - PAD * 2) / graph.height))
    setT({ k, x: Math.round((w - graph.width * k) / 2), y: Math.round(Math.max(PAD / 2, (h - graph.height * k) / 2)) })
  }, [graph.width, graph.height])
  useEffect(() => { fit() }, [fit])

  const focusOn = useCallback((slug: string) => {
    const n = byslug.get(slug); const el = box.current
    if (!n || !el) return
    const k = Math.max(0.55, Math.min(1, t.k < 0.55 ? 0.7 : t.k))
    setT({ k, x: Math.round(el.clientWidth / 2 - (n.x + NODE_W / 2) * k), y: Math.round(el.clientHeight / 2 - (n.y + NODE_H / 2) * k) })
  }, [byslug, t.k])
  useEffect(() => { registerFocus(focusOn) }, [registerFocus, focusOn])

  // pan with the pointer, zoom with the wheel (pinch / Ctrl) or the buttons
  const zoomAt = (cx: number, cy: number, factor: number) => setT(p => {
    const k = Math.max(0.12, Math.min(1.6, p.k * factor))
    return { k, x: Math.round(cx - ((cx - p.x) / p.k) * k), y: Math.round(cy - ((cy - p.y) / p.k) * k) }
  })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.01))
      else setT(p => ({ ...p, x: p.x - e.deltaX, y: p.y - e.deltaY }))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? graph.nodes.filter(n => `${n.index + 1} ${n.name}`.toLowerCase().includes(s)).slice(0, 6) : []
  }, [q, graph])

  const related = useMemo(() => {
    const id = hover ?? selected
    const set = new Set<GEdge>()
    if (id) { const n = byslug.get(id); n?.outs.forEach(e => set.add(e)); n?.ins.forEach(e => set.add(e)) }
    return set
  }, [hover, selected, byslug])
  const dimOthers = related.size > 0
  const connected = useMemo(() => {
    const set = new Set<string>()
    const id = hover ?? selected
    if (id) set.add(id)
    related.forEach(e => { set.add(e.from); set.add(e.to) })
    return set
  }, [related, hover, selected])

  const maxMove = useMemo(() => Math.max(1, ...Object.values(stats.moves)), [stats])

  return (
    <div
      ref={box}
      className="relative h-[680px] cursor-grab select-none overflow-hidden active:cursor-grabbing"
      style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      onPointerDown={e => { if ((e.target as HTMLElement).closest('[data-node],[data-ui]')) return; drag.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }}
      onPointerMove={e => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true; setT(p => ({ ...p, x: d.tx + dx, y: d.ty + dy })) }}
      onPointerUp={() => { if (drag.current && !drag.current.moved) onSelect(null); drag.current = null }}
    >
      <div style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})`, transformOrigin: '0 0', width: graph.width, height: graph.height, position: 'absolute' }}>
        <svg width={graph.width + 40} height={graph.height + 120} className="pointer-events-none absolute left-0 top-0 overflow-visible">
          <defs>
            {(['#71717a', '#38bdf8', '#fbbf24', '#fb7185'] as const).map((c, i) => (
              <marker key={c} id={`arr${i}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={c} /></marker>
            ))}
          </defs>
          {graph.edges.map((e, i) => {
            const a = byslug.get(e.from)!, b = byslug.get(e.to)!
            const styleIdx = e.back ? 3 : e.kind === 'answer' ? 1 : e.kind === 'button' ? 0 : 2
            const col = ['#71717a', '#38bdf8', '#fbbf24', '#fb7185'][styleIdx]
            const hot = related.has(e)
            const traffic = stats.moves[`${e.from}>${e.to}`] ?? 0
            const w = traffic ? 1.5 + (traffic / maxMove) * 5 : hot ? 2.2 : 1.4
            const path = edgePath(a, b, !!e.back)
            return (
              <g key={i} opacity={dimOthers && !hot ? 0.14 : hot ? 1 : 0.7}>
                <path d={path} fill="none" stroke={col} strokeWidth={w} strokeDasharray={e.kind === 'auto' || e.kind === 'rule' || e.back ? '5 5' : undefined} markerEnd={`url(#arr${styleIdx})`} />
              </g>
            )
          })}
        </svg>
        {/* traffic numbers sit on the lines */}
        {stats.hasData && graph.edges.map((e, i) => {
          const traffic = stats.moves[`${e.from}>${e.to}`]
          if (!traffic) return null
          const a = byslug.get(e.from)!, b = byslug.get(e.to)!
          const mx = (a.x + NODE_W + b.x) / 2, my = (a.y + b.y) / 2 + 110
          return <span key={`m${i}`} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-900/95 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200 ring-1 ring-white/10" style={{ left: mx, top: my }}>{fmt(traffic)}</span>
        })}
        {graph.nodes.map(n => (
          <StepNode
            key={n.slug}
            n={n}
            stats={stats.steps[n.slug]}
            hasData={stats.hasData}
            sel={selected === n.slug}
            hot={hover === n.slug}
            dim={dimOthers && !connected.has(n.slug)}
            src={`${basePath}/${n.slug}?vai_preview=1&v=m`}
            thumb={!heavy || t.k >= 0.4}
            onHover={h => setHover(h ? n.slug : null)}
            onSelect={() => onSelect(selected === n.slug ? null : n.slug)}
          />
        ))}
      </div>

      {/* toolbar */}
      <div data-ui className="absolute left-3 top-3 z-10 flex items-center gap-2">
        <div className="relative">
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/90 px-2.5 py-1.5 backdrop-blur">
            <Search className="h-3.5 w-3.5 text-zinc-500" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ir para a etapa..." className="w-36 bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none" />
          </div>
          {matches.length > 0 && (
            <div className="absolute left-0 top-full mt-1 w-64 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-2xl">
              {matches.map(m => (
                <button key={m.slug} onClick={() => { onSelect(m.slug); focusOn(m.slug); setQ('') }} className="block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10">{m.index + 1}. {shortName(m.name, m.slug)}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div data-ui className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-900/90 p-1 backdrop-blur">
        <button onClick={() => { const el = box.current!; zoomAt(el.clientWidth / 2, el.clientHeight / 2, 1 / 1.25) }} className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/10" title="Afastar"><ZoomOut className="h-4 w-4" /></button>
        <span className="w-11 text-center text-[11px] tabular-nums text-zinc-400">{Math.round(t.k * 100)}%</span>
        <button onClick={() => { const el = box.current!; zoomAt(el.clientWidth / 2, el.clientHeight / 2, 1.25) }} className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/10" title="Aproximar"><ZoomIn className="h-4 w-4" /></button>
        <button onClick={fit} className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/10" title="Ver o funil inteiro"><Maximize2 className="h-4 w-4" /></button>
      </div>
      <div data-ui className="absolute bottom-3 right-3 z-10 hidden items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/90 px-3 py-2 text-[11px] text-zinc-400 backdrop-blur md:flex">
        <Legend color="#71717a" label="botão" /><Legend color="#38bdf8" label="resposta" /><Legend color="#fbbf24" label="automático / regra" dashed /><Legend color="#fb7185" label="volta" dashed />
      </div>
    </div>
  )
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return <span className="flex items-center gap-1.5"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dashed ? '4 3' : undefined} /></svg>{label}</span>
}

function StepNode({
  n, stats, hasData, sel, hot, dim, src, thumb, onHover, onSelect,
}: {
  n: GNode
  stats?: FunnelStats['steps'][string]
  hasData: boolean
  sel: boolean
  hot: boolean
  dim: boolean
  src: string
  thumb: boolean
  onHover: (h: boolean) => void
  onSelect: () => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = wrap.current
    if (!el || !thumb) return
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setShown(true); io.disconnect() } }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [thumb])
  const inner = NODE_W - 16
  const k = inner / PHONE.w
  const stop = stats && stats.visitors ? pct(stats.stopped, stats.visitors) : null
  return (
    <div
      data-node
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onClick={e => { e.stopPropagation(); onSelect() }}
      className={`absolute cursor-pointer rounded-2xl border bg-zinc-900/95 p-2 transition ${sel ? 'border-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,.25)]' : hot ? 'border-white/35' : n.reachable ? 'border-white/12' : 'border-dashed border-white/15'} ${dim ? 'opacity-30' : ''}`}
      style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
    >
      <div className="mb-1.5 flex items-start gap-1.5">
        <span className={`mt-px flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${n.isEntry ? 'bg-sky-400 text-zinc-950' : 'bg-white/10 text-zinc-200'}`}>{n.index + 1}</span>
        <span className="line-clamp-2 text-[11px] font-medium leading-tight text-zinc-100">{shortName(n.name, n.slug)}</span>
      </div>
      <div ref={wrap} className="relative overflow-hidden rounded-lg bg-zinc-950 ring-1 ring-white/10" style={{ width: inner, height: Math.round(PHONE.h * k) }}>
        {thumb && shown ? (
          <iframe
            src={src}
            title={n.name}
            loading="lazy"
            tabIndex={-1}
            aria-hidden
            sandbox="allow-same-origin allow-scripts"
            style={{ width: PHONE.w, height: PHONE.h, border: 0, transform: `scale(${k})`, transformOrigin: '0 0', pointerEvents: 'none', background: '#fff' }}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-[10px] text-zinc-600">{n.name}</div>
        )}
        {n.isEntry && <span className="absolute left-1 top-1 rounded bg-sky-400 px-1 py-px text-[9px] font-bold text-zinc-950">INÍCIO</span>}
        {hasData && stats && (
          <span className="absolute right-1 top-1 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur"><Eye className="h-2.5 w-2.5" />{fmt(stats.visitors)}</span>
        )}
        {stop !== null && stop >= 15 && n.index < 9999 && (
          <span className="absolute bottom-1 right-1 rounded bg-rose-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">{stop}% saem</span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {n.exits.slice(0, 2).map((e, i) => (
          <span key={i} className="flex max-w-full items-center gap-0.5 truncate rounded bg-emerald-400/10 px-1.5 py-0.5 text-[9.5px] text-emerald-300" title={e.url}><ArrowUpRight className="h-2.5 w-2.5 shrink-0" />{e.host}</span>
        ))}
        {n.exits.length > 2 && <span className="text-[9.5px] text-zinc-500">+{n.exits.length - 2}</span>}
        {n.idle > 0 && <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9.5px] text-amber-300">{n.idle} sem destino</span>}
      </div>
    </div>
  )
}

// ─────────────────────────── the side drawer ───────────────────────────

function Drawer({
  node, steps, stats, projectId, basePath, graph, onClose, onGo,
}: {
  node: GNode
  steps: FlowStep[]
  stats: FunnelStats
  projectId: string
  basePath: string
  graph: FlowGraph
  onClose: () => void
  onGo: (slug: string) => void
}) {
  const step = steps[node.index]
  const st = stats.steps[node.slug]
  const answers = stats.clicks[node.slug] ?? []
  const maxN = Math.max(1, ...answers.map(a => a.n))
  const nameOf = (slug: string) => `${(graph.nodes.find(n => n.slug === slug)?.index ?? 0) + 1}. ${shortName(steps.find(s => s.slug === slug)?.name ?? slug, slug)}`
  return (
    <div data-ui className="absolute bottom-0 right-0 top-0 z-20 flex w-[min(420px,92%)] flex-col border-l border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
      <div className="flex items-start gap-3 border-b border-white/10 p-4">
        <span className="mt-0.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-white/10 px-2 text-xs font-bold text-white">{node.index + 1}</span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold text-white">{step.name}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <a href={`${basePath}/${node.slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-white/10"><ExternalLink className="h-3 w-3" /> Abrir</a>
            <a href={`/projects/${projectId}/editor/${node.slug}`} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-white/10"><Pencil className="h-3 w-3" /> Editar página</a>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {stats.hasData && st ? (
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Visitantes" value={fmt(st.visitors)} />
            <Mini label="Param aqui" value={st.visitors ? `${pct(st.stopped, st.visitors)}%` : '-'} tone={st.visitors && pct(st.stopped, st.visitors) >= 25 ? 'bad' : undefined} />
            <Mini label="Tempo típico" value={secsLabel(st.secs)} icon={<Clock className="h-3 w-3" />} />
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs leading-relaxed text-zinc-500">Quando as primeiras pessoas passarem por essa etapa, os números aparecem aqui: quantas chegaram, quantas pararam e o que clicaram.</p>
        )}

        {answers.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500"><MousePointerClick className="h-3 w-3" /> O que as pessoas clicam</p>
            <div className="space-y-1.5">
              {answers.map((a, i) => (
                <div key={i} className="text-xs">
                  <div className="mb-0.5 flex justify-between gap-2 text-zinc-300"><span className="truncate">{a.label}</span><span className="shrink-0 tabular-nums text-zinc-500">{fmt(a.n)}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-sky-400/70" style={{ width: `${(a.n / maxN) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500"><GitBranch className="h-3 w-3" /> Como chega e pra onde vai</p>
          <div className="space-y-1 text-xs">
            {node.ins.length === 0 && !node.isEntry && <p className="text-amber-300/90">Nenhum botão leva até aqui.</p>}
            {[...new Set(node.ins.map(e => e.from))].map(f => <button key={`i${f}`} onClick={() => onGo(f)} className="flex w-full items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-left text-zinc-300 transition hover:bg-white/[0.07]"><span className="text-zinc-500">de</span><span className="truncate">{nameOf(f)}</span></button>)}
            {[...new Set(node.outs.map(e => e.to))].map(t => <button key={`o${t}`} onClick={() => onGo(t)} className="flex w-full items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-left text-zinc-300 transition hover:bg-white/[0.07]"><span className="text-zinc-500">vai pra</span><span className="truncate">{nameOf(t)}</span></button>)}
            {node.exits.map((e, i) => <a key={`x${i}`} href={e.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg bg-emerald-400/[0.06] px-2.5 py-1.5 text-emerald-300 transition hover:bg-emerald-400/10"><ArrowUpRight className="h-3 w-3 shrink-0" /><span className="truncate">{e.host}</span></a>)}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Botões e respostas</p>
          <StepCard compact projectId={projectId} step={step} index={node.index} steps={steps} />
        </div>
      </div>
    </div>
  )
}

function Mini({ label, value, tone, icon }: { label: string; value: string; tone?: 'bad'; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">{icon}{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${tone === 'bad' ? 'text-rose-300' : 'text-white'}`}>{value}</div>
    </div>
  )
}
