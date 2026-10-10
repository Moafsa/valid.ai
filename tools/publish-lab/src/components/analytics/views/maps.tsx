'use client'
import { useMemo } from 'react'
import { Flame, Layers, MousePointerClick, Zap } from 'lucide-react'
import { useAn, useData } from '../state'
import { Heatmap, type HElement, type HPoint, type HeatMode } from '../heatmap'
import { BarList, Card, Empty, ErrorBox, Head, Kpi, Pill, Seg, Skel } from '../ui'
import { Bars } from '../charts'
import { dur, nf, pf, selName } from '../format'

interface HeatData {
  clicks: { total: number; sessions: number; elements: (HElement & { tag: string | null; href: string | null; sessions: number })[]; points: HPoint[] }
  scroll: { views: number; avgScroll: number; medianScroll: number; avgActiveSec: number; reach: number[]; attention: number[]; seconds: number[] }
}

const MODES: { value: HeatMode; label: string; icon: React.ReactNode }[] = [
  { value: 'click', label: 'Cliques', icon: <Flame size={13} /> },
  { value: 'scroll', label: 'Rolagem', icon: <Layers size={13} /> },
  { value: 'attention', label: 'Atenção', icon: <Zap size={13} /> },
  { value: 'friction', label: 'Atrito', icon: <MousePointerClick size={13} /> },
]

export function Maps() {
  const { param, setParam, publicSlug } = useAn()
  const pages = useData<{ rows: { slug: string; views: number }[] }>('pages')
  const slug = param('page') || pages.data?.rows[0]?.slug || ''
  const device = param('device') || 'desktop'
  const mode = (param('mode') as HeatMode) || 'click'
  const heat = useData<HeatData>('heatmap', { page: slug, device }, { skip: !slug })

  const els = useMemo(() => heat.data?.clicks.elements ?? [], [heat.data])
  const pts = useMemo(() => heat.data?.clicks.points ?? [], [heat.data])
  if (pages.error && !pages.data) return <ErrorBox message={pages.error} onRetry={pages.reload} />
  if (!pages.data) return <div style={{ display: 'grid', gap: 14 }}><Head title="Mapas de calor" /><Skel h={500} /></div>
  if (pages.data.rows.length === 0) return <div><Head title="Mapas de calor" /><Card><Empty title="Sem visitas ainda" text="Os mapas aparecem quando as primeiras pessoas passarem pela página." /></Card></div>

  const d = heat.data
  const sc = d?.scroll
  const frictionN = pts.filter(p => p.rage || p.dead).length
  return (
    <div>
      <Head title="Mapas de calor" sub="Veja a própria página com o comportamento por cima: onde clicam, até onde rolam, onde a atenção fica e onde clicam sem resposta."
        right={<>
          <select className="ed-select" style={{ width: 200 }} value={slug} onChange={e => setParam('page', e.target.value)}>
            {pages.data.rows.map(r => <option key={r.slug} value={r.slug}>{r.slug} ({nf(r.views)})</option>)}
          </select>
          <Seg value={device as any} onChange={v => setParam('device', v)} options={[{ value: 'desktop', label: 'Computador' }, { value: 'tablet', label: 'Tablet' }, { value: 'mobile', label: 'Celular' }]} />
        </>} />
      <div style={{ marginBottom: 14 }}><Seg value={mode} onChange={v => setParam('mode', v)} options={MODES.map(m => ({ value: m.value, label: <>{m.icon}{m.label}</> }))} /></div>

      <div className="an-grid s3" style={{ alignItems: 'start' }}>
        <div className={heat.loading ? 'an-busy' : ''}>
          {slug && <Heatmap publicSlug={publicSlug} slug={slug} device={device} mode={mode} points={pts} elements={els} scroll={sc ? { reach: sc.reach, attention: sc.attention, views: sc.views } : null} />}
          {d && d.clicks.total === 0 && mode === 'click' && <p className="an-dim" style={{ textAlign: 'center', marginTop: 10 }}>Ainda não há cliques nesta página neste tipo de tela.</p>}
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="an-grid c2" style={{ marginBottom: 0 }}>
            <Kpi label="Cliques" value={nf(d?.clicks.total ?? 0)} hint={`${nf(d?.clicks.sessions ?? 0)} visitas`} />
            <Kpi label="Rolagem média" value={pf(sc?.avgScroll ?? 0, 0)} hint={`Metade das pessoas passa de ${sc?.medianScroll ?? 0}%`} />
          </div>
          {(mode === 'click' || mode === 'friction') && (
            <Card title={mode === 'click' ? 'O que mais recebe clique' : 'Cliques sem resposta'} sub={mode === 'click' ? 'Em ordem; os números também estão no mapa' : `${nf(frictionN)} cliques repetidos ou sem efeito`}>
              <BarList items={els.filter(e => mode === 'click' || e.rage || e.dead).slice(0, 10).map((e, i) => ({
                key: e.sel, label: <span title={e.sel}>{mode === 'click' ? `${i + 1}. ` : ''}{e.text || selName(e.sel)}</span>, value: mode === 'click' ? e.clicks : e.rage + e.dead, sub: mode === 'click' ? pf(e.share, 0) : '',
                text: nf(mode === 'click' ? e.clicks : e.rage + e.dead),
              }))} empty="Nada por aqui." />
              {mode === 'friction' && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><Pill tone="bad">● repetidos</Pill><Pill tone="warn">● sem resposta</Pill></div>}
            </Card>
          )}
          {(mode === 'scroll' || mode === 'attention') && sc && (
            <Card title={mode === 'scroll' ? 'Quem chega até onde' : 'Onde a atenção fica'} sub={mode === 'scroll' ? 'Cada barra: % das pessoas que viram a página até esse ponto' : 'Parte do tempo total que cada décimo da página ficou na tela'}>
              <Bars data={mode === 'scroll' ? sc.reach : sc.attention} labels={sc.reach.map((_, i) => `${(i + 1) * 10}`)} height={140} />
              <p className="an-dim" style={{ fontSize: 11.5, margin: '10px 0 0' }}>{nf(sc.views)} aberturas medidas · tempo ativo médio {dur(sc.avgActiveSec)}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
