'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export const FILTER_KEYS = ['page', 'host', 'source', 'channel', 'campaign', 'medium', 'content', 'device', 'browser', 'os', 'country', 'visitor', 'outcome', 'mode'] as const
export type FilterKey = (typeof FILTER_KEYS)[number]
export type View = 'overview' | 'audience' | 'journey' | 'video' | 'maps' | 'friction' | 'recordings' | 'sources' | 'sessions' | 'ai' | 'tests' | 'settings'
export const VIEWS: View[] = ['overview', 'audience', 'journey', 'video', 'maps', 'friction', 'recordings', 'sources', 'sessions', 'ai', 'tests', 'settings']

export interface Filters { period: string; from?: string; to?: string; values: Partial<Record<FilterKey, string>> }

interface Ctx {
  projectId: string
  /** address of the published site (/s/<slug>): the pages analysed are shown from there, never from the editor's copy */
  publicSlug: string
  view: View
  setView: (v: View, extra?: Record<string, string>) => void
  filters: Filters
  setPeriod: (p: string, from?: string, to?: string) => void
  setFilter: (k: FilterKey, v: string | null) => void
  clearFilters: () => void
  /** the filters as the query string every API call carries */
  qs: string
  param: (k: string) => string | null
  setParam: (k: string, v: string | null) => void
}

const C = createContext<Ctx | null>(null)
export const useAn = () => {
  const c = useContext(C)
  if (!c) throw new Error('useAn outside AnalyticsProvider')
  return c
}

const readUrl = (): { view: View; filters: Filters; extra: Record<string, string> } => {
  const p = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
  const v = p.get('v') as View
  const values: Filters['values'] = {}
  for (const k of FILTER_KEYS) { const x = p.get(k); if (x) values[k] = x }
  const extra: Record<string, string> = {}
  p.forEach((val, key) => { if (key !== 'v' && key !== 'period' && key !== 'from' && key !== 'to' && !(FILTER_KEYS as readonly string[]).includes(key)) extra[key] = val })
  return { view: VIEWS.includes(v) ? v : 'overview', filters: { period: p.get('period') || '7d', from: p.get('from') || undefined, to: p.get('to') || undefined, values }, extra }
}

export function AnalyticsProvider({ projectId, publicSlug, children }: { projectId: string; publicSlug: string; children: ReactNode }) {
  const [state, setState] = useState(() => readUrl())
  const first = useRef(true)

  // the URL is the state: refresh keeps it, a copied link opens the same screen with the same filters
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const p = new URLSearchParams()
    p.set('v', state.view)
    p.set('period', state.filters.period)
    if (state.filters.from) p.set('from', state.filters.from)
    if (state.filters.to) p.set('to', state.filters.to)
    for (const [k, v] of Object.entries(state.filters.values)) if (v) p.set(k, v)
    for (const [k, v] of Object.entries(state.extra)) if (v) p.set(k, v)
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`)
  }, [state])

  useEffect(() => {
    const on = () => setState(readUrl())
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])

  const setView = useCallback((view: View, extra?: Record<string, string>) => setState(s => ({ ...s, view, extra: extra || {} })), [])
  const setPeriod = useCallback((period: string, from?: string, to?: string) => setState(s => ({ ...s, filters: { ...s.filters, period, from, to } })), [])
  const setFilter = useCallback((k: FilterKey, v: string | null) => setState(s => {
    const values = { ...s.filters.values }
    if (v) values[k] = v; else delete values[k]
    return { ...s, filters: { ...s.filters, values } }
  }), [])
  const clearFilters = useCallback(() => setState(s => ({ ...s, filters: { ...s.filters, values: {} } })), [])
  const setParam = useCallback((k: string, v: string | null) => setState(s => {
    const extra = { ...s.extra }
    if (v) extra[k] = v; else delete extra[k]
    return { ...s, extra }
  }), [])

  const value = useMemo<Ctx>(() => {
    const q = new URLSearchParams()
    q.set('period', state.filters.period)
    if (state.filters.from) q.set('from', state.filters.from)
    if (state.filters.to) q.set('to', state.filters.to)
    for (const [k, v] of Object.entries(state.filters.values)) if (v) q.set(k, v)
    return {
      projectId, publicSlug, view: state.view, setView, filters: state.filters, setPeriod, setFilter, clearFilters, qs: q.toString(),
      param: k => state.extra[k] ?? null, setParam,
    }
  }, [projectId, publicSlug, state, setView, setPeriod, setFilter, clearFilters, setParam])

  return <C.Provider value={value}>{children}</C.Provider>
}

/* ───────── data ───────── */
export interface Fetched<T> { data: T | null; loading: boolean; error: string | null; reload: () => void }

/** GET /api/projects/<id>/analytics/<view>?<filters>&<extra>, re-fetched when the filters change; keeps the old data on screen while the new arrives */
export function useData<T = any>(view: string, extra?: Record<string, string | number | null | undefined>, opts: { skip?: boolean; filters?: boolean } = {}): Fetched<T> {
  const { projectId, qs } = useAn()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!opts.skip)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const extraKey = JSON.stringify(extra || {})
  useEffect(() => {
    if (opts.skip) return
    const ac = new AbortController()
    setLoading(true)
    const q = new URLSearchParams(opts.filters === false ? '' : qs)
    for (const [k, v] of Object.entries(JSON.parse(extraKey))) if (v != null && v !== '') q.set(k, String(v))
    fetch(`/api/projects/${projectId}/analytics/${view}?${q.toString()}`, { signal: ac.signal, cache: 'no-store' })
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'Erro ao ler as métricas')
        setData(j); setError(null)
      })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message || 'Erro') })
      .finally(() => { if (!ac.signal.aborted) setLoading(false) })
    return () => ac.abort()
  }, [projectId, view, qs, extraKey, tick, opts.skip, opts.filters])
  return { data, loading, error, reload: () => setTick(t => t + 1) }
}

export async function postJson<T = any>(projectId: string, view: string, body: unknown, qs = ''): Promise<{ ok: boolean; data: T; status: number }> {
  const r = await fetch(`/api/projects/${projectId}/analytics/${view}${qs ? `?${qs}` : ''}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, data, status: r.status }
}
