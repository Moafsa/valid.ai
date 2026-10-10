'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowLeft, Fingerprint, Calendar, ChevronDown, ExternalLink, FlaskConical, Flame, Layers, MousePointerClick, Moon, PlayCircle, Radio, Route, Settings, Sparkles, Sun, Users, Video, X } from 'lucide-react'
import { EDITOR_CSS } from '@/components/editor/editor-theme'
import { ANALYTICS_CSS } from './theme'
import { AnalyticsProvider, FILTER_KEYS, useAn, useData, type FilterKey, type View } from './state'
import { DEVICE_LABEL, SOURCE_LABEL, channelLabel, countryName, flag } from './format'
import { usePopover, Seg } from './ui'
import { Overview } from './views/overview'
import { Journey } from './views/journey'
import { AudienceView } from './views/audience'
import { VideoView } from './views/video'
import { Maps } from './views/maps'
import { Friction } from './views/friction'
import { Recordings } from './views/recordings'
import { Sources } from './views/sources'
import { Sessions } from './views/sessions'
import { Insights } from './views/insights'
import { Tests } from './views/tests'
import { Settings as SettingsView } from './views/settings'

const NAV: { view: View; label: string; icon: React.ReactNode }[] = [
  { view: 'overview', label: 'Visão geral', icon: <Activity size={18} /> },
  { view: 'audience', label: 'Público', icon: <Fingerprint size={18} /> },
  { view: 'journey', label: 'Jornada', icon: <Route size={18} /> },
  { view: 'video', label: 'Vídeo', icon: <PlayCircle size={18} /> },
  { view: 'maps', label: 'Mapas', icon: <Flame size={18} /> },
  { view: 'friction', label: 'Atrito', icon: <MousePointerClick size={18} /> },
  { view: 'recordings', label: 'Gravações', icon: <Video size={18} /> },
  { view: 'sources', label: 'Origens', icon: <Layers size={18} /> },
  { view: 'sessions', label: 'Visitantes', icon: <Users size={18} /> },
  { view: 'ai', label: 'Inteligência', icon: <Sparkles size={18} /> },
  { view: 'tests', label: 'Testes A/B', icon: <FlaskConical size={18} /> },
  { view: 'settings', label: 'Ajustes', icon: <Settings size={18} /> },
]

const PERIODS = [
  { value: 'today', label: 'Hoje' }, { value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: '90d', label: '90 dias' }, { value: 'all', label: 'Tudo' },
]

interface Options { page: string[]; source: string[]; campaign: string[]; medium: string[]; content: string[]; device: string[]; browser: string[]; os: string[]; country: string[]; host: string[]; channel: string[] }

const LABELS: Record<FilterKey, string> = { page: 'Página', host: 'Domínio', source: 'Origem', channel: 'Canal', campaign: 'Campanha', medium: 'Mídia', content: 'Anúncio', device: 'Aparelho', browser: 'Navegador', os: 'Sistema', country: 'País', visitor: 'Visitante', outcome: 'Resultado', mode: 'Versão' }

function valueLabel(k: FilterKey, v: string) {
  if (k === 'source') return SOURCE_LABEL(v)
  if (k === 'device') return DEVICE_LABEL[v] || v
  if (k === 'country') return `${flag(v)} ${countryName(v)}`
  if (k === 'channel') return channelLabel(v)
  if (k === 'visitor') return v === 'new' ? 'Novos' : 'Que voltaram'
  if (k === 'outcome') return v === 'converted' ? 'Converteram' : 'Não converteram'
  if (k === 'mode') return v === 'draft' ? 'Rascunho' : 'Publicada'
  return v
}

function FilterChip({ k, values }: { k: FilterKey; values: string[] }) {
  const { filters, setFilter } = useAn()
  const { open, setOpen, ref } = usePopover()
  const cur = filters.values[k]
  return (
    <div className="an-fsel" ref={ref}>
      <button className="an-fchip" data-on={!!cur} onClick={() => setOpen(!open)}>
        <span>{cur ? `${LABELS[k]}: ${valueLabel(k, cur)}` : LABELS[k]}</span>
        {cur ? <X size={12} onClick={e => { e.stopPropagation(); setFilter(k, null) }} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="an-fmenu">
          <button data-on={!cur} onClick={() => { setFilter(k, null); setOpen(false) }}>Todos</button>
          {values.length === 0 && <div style={{ padding: '8px 10px', color: 'var(--ed-text-3)', fontSize: 12 }}>Nada registrado ainda</div>}
          {values.map(v => <button key={v} data-on={cur === v} onClick={() => { setFilter(k, v); setOpen(false) }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{valueLabel(k, v)}</span></button>)}
        </div>
      )}
    </div>
  )
}

function PeriodPicker() {
  const { filters, setPeriod } = useAn()
  const { open, setOpen, ref } = usePopover()
  const [from, setFrom] = useState(filters.from || '')
  const [to, setTo] = useState(filters.to || '')
  const custom = filters.period === 'custom'
  return (
    <div className="an-fsel" ref={ref} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Seg value={custom ? 'x' : filters.period} onChange={v => setPeriod(v)} options={PERIODS} />
      <button className="an-fchip" data-on={custom} onClick={() => setOpen(!open)}><Calendar size={13} /><span>{custom && filters.from ? `${filters.from.slice(5)} a ${filters.to?.slice(5) || 'hoje'}` : 'Datas'}</span></button>
      {open && (
        <div className="an-fmenu" style={{ top: 'calc(100% + 6px)', left: 'auto', right: 0, padding: 10 }}>
          <div className="an-field"><label>De</label><input className="ed-input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="an-field" style={{ marginTop: 8 }}><label>Até</label><input className="ed-input" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <button className="ed-btn ed-btn-primary ed-btn-block" style={{ marginTop: 10 }} disabled={!from} onClick={() => { setPeriod('custom', from, to || undefined); setOpen(false) }}>Aplicar</button>
        </div>
      )}
    </div>
  )
}

function FiltersBar() {
  const { filters, clearFilters } = useAn()
  const opts = useData<Options>('options', undefined, { filters: false })
  const o = opts.data
  const more = useMemo(() => (['medium', 'content', 'browser', 'os', 'host', 'channel'] as const), [])
  const active = Object.keys(filters.values).length
  const { open, setOpen, ref } = usePopover()
  return (
    <div className="an-filters">
      <PeriodPicker />
      <span style={{ width: 1, height: 20, background: 'var(--ed-line)', margin: '0 4px' }} />
      <FilterChip k="page" values={o?.page || []} />
      <FilterChip k="source" values={o?.source || []} />
      <FilterChip k="campaign" values={o?.campaign || []} />
      <FilterChip k="device" values={o?.device || []} />
      <FilterChip k="country" values={o?.country || []} />
      <div className="an-fsel" ref={ref}>
        <button className="an-fchip" data-on={more.some(k => filters.values[k]) || !!filters.values.visitor || !!filters.values.outcome} onClick={() => setOpen(!open)}><span>Mais filtros</span><ChevronDown size={12} /></button>
        {open && (
          <div className="an-fmenu" style={{ padding: 10, display: 'grid', gap: 6, minWidth: 250 }}>
            {more.map(k => <div key={k} style={{ display: 'flex' }}><FilterChip k={k} values={o?.[k] || []} /></div>)}
            <div style={{ display: 'flex' }}><FilterChip k="visitor" values={['new', 'returning']} /></div>
            <div style={{ display: 'flex' }}><FilterChip k="outcome" values={['converted', 'not']} /></div>
          </div>
        )}
      </div>
      {active > 0 && <button className="ed-btn ed-btn-ghost ed-btn-sm" onClick={clearFilters}><X size={12} /> Limpar ({active})</button>}
    </div>
  )
}

function Live() {
  const { projectId } = useAn()
  const [n, setN] = useState(0)
  useEffect(() => {
    let stop = false
    const tick = () => fetch(`/api/projects/${projectId}/analytics/live`, { cache: 'no-store' }).then(r => r.json()).then(j => { if (!stop) setN(j.count || 0) }).catch(() => {})
    tick()
    const t = setInterval(tick, 30000)
    return () => { stop = true; clearInterval(t) }
  }, [projectId])
  return <span className="an-live" data-on={n > 0} title="Pessoas com a página aberta agora (últimos 5 minutos)"><i /><Radio size={13} /> {n} agora</span>
}

function Shell({ projectName, slug, published, backHref }: { projectName: string; slug: string | null; published: boolean; backHref?: string }) {
  const { view, setView, projectId } = useAn()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  useEffect(() => { try { const t = localStorage.getItem('vai-editor-theme'); if (t === 'dark' || t === 'light') setTheme(t) } catch { /* private mode */ } }, [])
  const flip = () => { const t = theme === 'dark' ? 'light' : 'dark'; setTheme(t); try { localStorage.setItem('vai-editor-theme', t) } catch { /* ignore */ } }
  const body = {
    overview: <Overview />, audience: <AudienceView />, journey: <Journey />, video: <VideoView />, maps: <Maps />, friction: <Friction />, recordings: <Recordings />,
    sources: <Sources />, sessions: <Sessions />, ai: <Insights />, tests: <Tests />, settings: <SettingsView published={published} slug={slug} />,
  }[view]
  return (
    <div className="vai-ed vai-an" data-theme={theme} style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <style>{EDITOR_CSS}</style>
      <style>{ANALYTICS_CSS}</style>
      <header className="an-top">
        <Link href={backHref || `/projects/${projectId}`} className="ed-ibtn" aria-label="Voltar ao projeto" title="Voltar ao projeto"><ArrowLeft size={17} /></Link>
        <div className="an-brand">
          <div className="an-logo"><Activity size={16} /></div>
          <div style={{ minWidth: 0 }}><b>Métricas</b><br /><span>{projectName}</span></div>
        </div>
        <div className="an-spacer" />
        <Live />
        {published && slug && <a className="ed-btn ed-btn-sm" href={`/s/${slug}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Ver página</a>}
        <button className="ed-ibtn" onClick={flip} aria-label="Trocar tema" title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
      </header>
      {view !== 'settings' && view !== 'tests' && <FiltersBar />}
      <div className="an-body">
        <nav className="an-rail" aria-label="Seções das métricas">
          {NAV.map(n => <button key={n.view} data-on={view === n.view} onClick={() => setView(n.view)} title={n.label}>{n.icon}<span>{n.label}</span></button>)}
        </nav>
        <main className="an-main"><div className="an-page" key={view}>{body}</div></main>
      </div>
    </div>
  )
}

export function AnalyticsCenter(props: { projectId: string; projectName: string; slug: string | null; published: boolean; backHref?: string }) {
  return (
    <AnalyticsProvider projectId={props.projectId} publicSlug={props.slug || ''}>
      <Shell projectName={props.projectName} slug={props.slug} published={props.published} backHref={props.backHref} />
    </AnalyticsProvider>
  )
}

export { FILTER_KEYS }
