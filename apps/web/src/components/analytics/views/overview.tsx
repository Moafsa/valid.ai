'use client'
import { useMemo, useState } from 'react'
import { Clock, Eye, FileText, Layers, MousePointerClick, Sparkles, Target, TrendingUp, UserPlus, Users } from 'lucide-react'
import { useAn, useData } from '../state'
import { Card, BarList, Empty, ErrorBox, Head, Kpi, Seg, Skel, Pill } from '../ui'
import { StackBar, XYChart, SERIES_COLORS } from '../charts'
import { DEVICE_LABEL, SOURCE_LABEL, channelLabel, countryName, dur, flag, nf, pf, regionLabel } from '../format'

interface Row { key: string; label: string; sessions: number; visitors: number; conversions: number; conversionRate: number; leads: number; avgActiveSec: number; avgScroll: number; bounceRate: number; share: number }
interface PageRow { slug: string; views: number; sessions: number; avgActiveSec: number; avgScroll: number; entries: number; exits: number; exitRate: number; conversions: number; conversionRate: number }
interface Totals { sessions: number; visitors: number; newVisitors: number; pageviews: number; leads: number; conversions: number; conversionRate: number; avgActiveSec: number; avgDurationSec: number; avgScroll: number; avgPages: number; bounceRate: number; abandonRate: number; videoSessions: number; ctaSessions: number; rageSessions: number; deadSessions: number; jsSessions: number }
interface Data { totals: Totals; previous: Totals; series: { bucket: 'hour' | 'day'; points: { t: string; sessions: number; visitors: number; conversions: number; leads: number }[] }; sources: Row[]; devices: Row[]; countries: Row[]; campaigns: Row[]; pages: PageRow[]; entry: Row[]; exit: Row[]; channels: Row[]; browsers: Row[]; os: Row[]; regions: Row[] }

const DEV_COLOR: Record<string, string> = { mobile: 'var(--an-s1)', desktop: 'var(--an-s2)', tablet: 'var(--an-s3)' }

export function Overview() {
  const { setFilter, setView } = useAn()
  const { data, loading, error, reload } = useData<Data>('overview')
  const ins = useData<{ insights: { id: string; kind: string; title: string; severity: string }[] }>('insights')
  const [metric, setMetric] = useState<'sessions' | 'conversions' | 'both'>('both')
  const [geo, setGeo] = useState<'country' | 'region'>('country')
  const [tech, setTech] = useState<'device' | 'browser' | 'os'>('device')

  const series = useMemo(() => {
    if (!data) return []
    const pts = data.series.points
    const x = (i: number) => i
    const all = [
      { name: 'Visitas', color: 'var(--an-s1)', fill: true, pts: pts.map((p, i) => ({ x: x(i), y: p.sessions })) },
      { name: 'Conversões', color: 'var(--an-good)', fill: false, pts: pts.map((p, i) => ({ x: x(i), y: p.conversions })) },
    ]
    return metric === 'sessions' ? [all[0]] : metric === 'conversions' ? [all[1]] : all
  }, [data, metric])

  if (error && !data) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <div style={{ display: 'grid', gap: 14 }}><Head title="Visão geral" /><div className="an-grid c6">{Array.from({ length: 6 }, (_, i) => <Skel key={i} h={104} />)}</div><Skel h={300} /></div>
  const t = data.totals, p = data.previous
  const spark = (k: 'sessions' | 'visitors' | 'conversions' | 'leads') => data.series.points.map(x => x[k])
  const fmtX = (i: number) => {
    const pt = data.series.points[Math.round(i)]
    if (!pt) return ''
    const d = new Date(pt.t)
    return data.series.bucket === 'hour' ? `${String(d.getHours()).padStart(2, '0')}h` : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }
  const tipX = (i: number) => {
    const pt = data.series.points[Math.round(i)]
    if (!pt) return ''
    const d = new Date(pt.t)
    return data.series.bucket === 'hour' ? d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit' }) + 'h' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' })
  }
  const empty = t.sessions === 0
  const techRows = tech === 'device' ? data.devices : tech === 'browser' ? data.browsers : data.os
  const top = ins.data?.insights?.filter(i => i.kind !== 'resumo').slice(0, 3) || []

  return (
    <div className={loading ? 'an-busy' : ''} style={{ transition: 'opacity .2s' }}>
      <Head title="Visão geral" sub="Tudo o que aconteceu na sua página no período, com a comparação com o período anterior de mesma duração." />
      {empty && <Card><Empty title="Ainda não há visitas neste período" text="Assim que alguém abrir a página publicada, tudo aparece aqui: de onde veio, o que fez, onde saiu. Se acabou de publicar, abra a página uma vez para testar." /></Card>}

      {t.sessions >= 5 && t.jsSessions < t.sessions * 0.7 && (
        <div className="an-err" style={{ marginBottom: 14, background: 'rgba(229,146,10,.09)', borderColor: 'rgba(229,146,10,.3)', color: 'var(--an-warn)' }}>
          Em {nf(t.sessions - t.jsSessions)} de {nf(t.sessions)} visitas o navegador não enviou o comportamento (cliques, rolagem, vídeo). Elas entram na contagem, com origem, aparelho e país, mas sem o que a pessoa fez na página. Costuma ser bloqueador de anúncios ou de rastreio, ou alguém que saiu antes de a página carregar.
        </div>
      )}
      <div className="an-grid c6">
        <Kpi hero label="Visitantes" value={nf(t.visitors)} now={t.visitors} before={p.visitors} spark={spark('visitors')} icon={<Users size={13} />} hint="Pessoas diferentes que abriram a página" />
        <Kpi hero label="Visitas" value={nf(t.sessions)} now={t.sessions} before={p.sessions} spark={spark('sessions')} icon={<Eye size={13} />} hint="Cada vez que alguém chega e navega (30 min sem agir encerra a visita)" />
        <Kpi hero label="Leads" value={nf(t.leads)} now={t.leads} before={p.leads} spark={spark('leads')} color="var(--an-s2)" icon={<UserPlus size={13} />} />
        <Kpi hero label="Conversões" value={nf(t.conversions)} now={t.conversions} before={p.conversions} spark={spark('conversions')} color="var(--an-good)" icon={<Target size={13} />} hint="Lead capturado ou clique para o checkout (configurável em Ajustes)" />
        <Kpi hero label="Taxa de conversão" value={pf(t.conversionRate)} now={t.conversionRate} before={p.conversionRate} icon={<TrendingUp size={13} />} />
        <Kpi hero label="Tempo ativo médio" value={dur(t.avgActiveSec)} now={t.avgActiveSec} before={p.avgActiveSec} icon={<Clock size={13} />} hint="Só conta o tempo em que a pessoa realmente estava usando a página" />
      </div>
      <div className="an-grid c4">
        <Kpi label="Profundidade média" value={pf(t.avgScroll, 0)} unit="da página" now={t.avgScroll} before={p.avgScroll} icon={<Layers size={13} />} hint="Até onde as pessoas rolam, em média" />
        <Kpi label="Páginas por visita" value={t.avgPages.toLocaleString('pt-BR')} now={t.avgPages} before={p.avgPages} icon={<FileText size={13} />} />
        <Kpi label="Saem sem interagir" value={pf(t.bounceRate)} now={t.bounceRate} before={p.bounceRate} inverse icon={<MousePointerClick size={13} />} hint="Abriram, não clicaram nem rolaram, e foram embora" />
        <Kpi label="Abandono" value={pf(t.abandonRate)} now={t.abandonRate} before={p.abandonRate} inverse icon={<Target size={13} />} hint="Visitas que não chegaram a converter" />
      </div>

      <div className="an-grid s2">
        <Card title="Visitas e conversões" sub={data.series.bucket === 'hour' ? 'Hora a hora' : 'Dia a dia'} right={<Seg value={metric} onChange={setMetric} options={[{ value: 'both', label: 'Ambas' }, { value: 'sessions', label: 'Visitas' }, { value: 'conversions', label: 'Conversões' }]} />}>
          <XYChart series={series} height={270} xTicks={Math.min(7, data.series.points.length)} xFmt={fmtX} tipTitle={tipX} yFmt={v => nf(v)} />
          <div className="an-legend" style={{ marginTop: 6 }}>{series.map(s => <span key={s.name}><i className="an-dot" style={{ background: s.color }} />{s.name}</span>)}</div>
        </Card>
        <Card title="Inteligência" sub="O que os números dizem" right={<button className="ed-btn ed-btn-sm" onClick={() => setView('ai')}><Sparkles size={13} /> Ver tudo</button>}>
          {top.length === 0 ? <Empty icon={<Sparkles size={22} />} title="Nada urgente" text="Quando houver algo que mereça atenção, aparece aqui." /> : (
            <div style={{ display: 'grid', gap: 10 }}>
              {top.map(i => (
                <div key={i.id} style={{ display: 'grid', gap: 5, padding: '10px 12px', borderRadius: 10, background: 'var(--ed-panel-2)', border: '1px solid var(--ed-line)' }}>
                  <div><Pill tone={i.kind === 'problema' ? 'bad' : i.kind === 'oportunidade' ? 'good' : i.kind === 'teste' ? 'blue' : undefined}>{({ problema: 'Problema', oportunidade: 'Oportunidade', sugestao: 'Sugestão', teste: 'Teste' } as Record<string, string>)[i.kind] || i.kind}</Pill></div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{i.title}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="an-grid c3">
        <Card title="De onde vêm" sub="Origem das visitas e quanto cada uma converte" right={<button className="ed-btn ed-btn-ghost ed-btn-sm" onClick={() => setView('sources')}>Detalhar</button>}>
          <BarList items={data.sources.map((r, i) => ({ key: r.key, label: SOURCE_LABEL(r.key), value: r.sessions, sub: pf(r.conversionRate) + ' conv.', color: SERIES_COLORS[i % 6], onClick: () => setFilter('source', r.key) }))} />
        </Card>
        <Card title="Campanhas" sub="Pelo parâmetro utm_campaign do link">
          <BarList items={data.campaigns.map((r, i) => ({ key: r.key, label: r.label, value: r.sessions, sub: pf(r.conversionRate) + ' conv.', color: SERIES_COLORS[i % 6], onClick: r.key === '(sem campanha)' ? undefined : () => setFilter('campaign', r.key) }))} empty="Nenhuma campanha com utm_campaign ainda." />
        </Card>
        <Card title="Canais" sub="Tipo de tráfego">
          <BarList items={data.channels.map((r, i) => ({ key: r.key, label: channelLabel(r.key), value: r.sessions, sub: pf(r.share, 0), color: SERIES_COLORS[i % 6], onClick: () => setFilter('channel', r.key) }))} />
        </Card>
      </div>

      <div className="an-grid c2">
        <Card title="Páginas" sub="O que as pessoas abrem e onde saem" flush>
          <div className="an-scroll-x">
            <table className="an-table">
              <thead><tr><th>Página</th><th>Aberturas</th><th>Tempo ativo</th><th>Rolagem</th><th>Saída</th><th>Conv.</th></tr></thead>
              <tbody>
                {data.pages.slice(0, 8).map(r => (
                  <tr key={r.slug} className="click" onClick={() => setFilter('page', r.slug)}>
                    <td className="name">{r.slug}</td><td>{nf(r.views)}</td><td>{dur(r.avgActiveSec)}</td>
                    <td><span className="an-mini"><i style={{ width: `${r.avgScroll}%` }} /></span>{pf(r.avgScroll, 0)}</td>
                    <td className={r.exitRate >= 65 ? 'an-bad' : ''}>{pf(r.exitRate, 0)}</td><td>{pf(r.conversionRate)}</td>
                  </tr>
                ))}
                {data.pages.length === 0 && <tr><td colSpan={6}><Empty title="Sem páginas ainda" /></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <Card title="Aparelhos e navegadores" right={<Seg value={tech} onChange={setTech} options={[{ value: 'device', label: 'Aparelho' }, { value: 'browser', label: 'Navegador' }, { value: 'os', label: 'Sistema' }]} />}>
            {tech === 'device' && <div style={{ marginBottom: 14 }}><StackBar parts={data.devices.map(d => ({ key: d.key, label: DEVICE_LABEL[d.key] || d.key, value: d.sessions, color: DEV_COLOR[d.key] || 'var(--an-s6)' }))} /></div>}
            <BarList items={techRows.map((r, i) => ({ key: r.key, label: tech === 'device' ? DEVICE_LABEL[r.key] || r.key : r.label, value: r.sessions, sub: pf(r.conversionRate) + ' conv.', color: SERIES_COLORS[i % 6] }))} />
          </Card>
        </div>
      </div>

      <div className="an-grid c3">
        <Card title="Onde estão" right={<Seg value={geo} onChange={setGeo} options={[{ value: 'country', label: 'País' }, { value: 'region', label: 'Região' }]} />}>
          <BarList items={(geo === 'country' ? data.countries : data.regions).map(r => ({ key: r.key, label: geo === 'country' ? `${flag(r.key)} ${countryName(r.key === '??' ? null : r.key)}` : regionLabel(r.key), value: r.sessions, sub: pf(r.conversionRate) + ' conv.', onClick: geo === 'country' && r.key !== '??' ? () => setFilter('country', r.key) : undefined }))} />
        </Card>
        <Card title="Páginas de entrada" sub="Por onde as pessoas chegam">
          <BarList items={data.entry.map(r => ({ key: r.key, label: r.label, value: r.sessions, sub: pf(r.conversionRate) + ' conv.', onClick: () => setFilter('page', r.key) }))} />
        </Card>
        <Card title="Páginas de saída" sub="Onde a visita termina">
          <BarList items={data.exit.map(r => ({ key: r.key, label: r.label, value: r.sessions, sub: pf(r.share, 0) }))} />
        </Card>
      </div>
    </div>
  )
}
