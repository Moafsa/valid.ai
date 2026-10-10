'use client'
import { useMemo } from 'react'
import { Clock, Flag, MousePointerClick, Percent, Play, TrendingDown, Users, Eye, Target } from 'lucide-react'
import { useAn, useData } from '../state'
import { Bars, XYChart, SERIES_COLORS } from '../charts'
import { Card, Empty, ErrorBox, Head, Kpi, Pill, Seg, Skel } from '../ui'
import { clock, dur, nf, pf, SOURCE_LABEL } from '../format'

interface VideoSummary { src: string; slug: string | null; duration: number; seen: number; plays: number; viewers: number; playRate: number; avgWatchedSec: number; avgPct: number; reachedEnd: number; endRate: number; videoClicks: number; convAfter: number; convAfterRate: number; embedded: boolean }
interface Retention { src: string; duration: number; starters: number; curve: { s: number; pct: number }[]; reach: number[]; drops: { from: number; to: number; lost: number; atStart: number }[]; leaves: { from: number; to: number; count: number; share: number }[]; byWatched: { label: string; sessions: number; conversions: number; rate: number }[]; neverPlayed: { sessions: number; conversions: number; rate: number } }
interface CompareRow { key: string; label: string; viewers: number; avgPct: number; avgWatchedSec: number; marks: { label: string; pct: number }[]; conversions: number; conversionRate: number }
interface Data { videos: VideoSummary[]; src?: string; retention: Retention | null; compare: CompareRow[]; by?: string }

const DIMS = [
  { value: 'source', label: 'Origem' }, { value: 'campaign', label: 'Campanha' }, { value: 'content', label: 'Anúncio' }, { value: 'device', label: 'Aparelho' },
  { value: 'browser', label: 'Navegador' }, { value: 'country', label: 'País' }, { value: 'page', label: 'Página' },
] as const

export function VideoView() {
  const { param, setParam } = useAn()
  const src = param('src') || undefined
  const by = param('by') || 'source'
  const { data, error, reload, loading } = useData<Data>('video', { src, by })
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <div style={{ display: 'grid', gap: 14 }}><Head title="Vídeo" /><Skel h={420} /></div>
  const cur = data.videos.find(v => v.src === (data.src || src))
  const r = data.retention
  const nice = (u: string) => decodeURIComponent(u.split('?')[0].split('/').slice(-1)[0] || u).slice(0, 38)

  return (
    <div className={loading ? 'an-busy' : ''}>
      <Head title="Vídeo" sub="Quantos apertam play, quanto tempo ficam e o segundo exato em que saem. A curva vem dos trechos que cada pessoa realmente assistiu, então quem pula para frente não conta como se tivesse visto o que pulou." />
      {data.videos.length === 0 && <Card><Empty title="Nenhum vídeo medido neste período" text="Quando alguém abrir uma página com vídeo, as métricas aparecem aqui." /></Card>}
      {data.videos.length > 1 && (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', marginBottom: 14 }}>
          {data.videos.map(v => (
            <button key={v.src} className="an-vcard" data-on={v.src === cur?.src} onClick={() => setParam('src', v.src)}>
              <Play size={18} />
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nice(v.src)}</div><div className="an-dim" style={{ fontSize: 11.5 }}>{v.slug || 'página'} · {nf(v.plays)} plays{v.embedded ? ' · incorporado' : ''}</div></div>
            </button>
          ))}
        </div>
      )}
      {cur && (
        <>
          <div className="an-grid c4">
            <Kpi hero label="Taxa de play" value={pf(cur.playRate)} icon={<Play size={13} />} hint="Das visitas em que o vídeo apareceu na tela, quantas apertaram play" />
            <Kpi hero label="Plays" value={nf(cur.plays)} icon={<Eye size={13} />} hint={`${nf(cur.seen)} visitas viram o vídeo`} />
            <Kpi hero label="Espectadores" value={nf(cur.viewers)} icon={<Users size={13} />} hint="Pessoas diferentes que assistiram" />
            <Kpi hero label="Converteram depois de assistir" value={pf(cur.convAfterRate)} icon={<Target size={13} />} hint={`${nf(cur.convAfter)} de ${nf(cur.plays)}`} />
          </div>
          {!cur.embedded && (
            <div className="an-grid c4">
              <Kpi label="Tempo médio assistido" value={dur(cur.avgWatchedSec)} icon={<Clock size={13} />} />
              <Kpi label="% médio assistido" value={pf(cur.avgPct, 0)} icon={<Percent size={13} />} />
              <Kpi label="Chegaram ao fim" value={pf(cur.endRate)} icon={<Flag size={13} />} hint={`${nf(cur.reachedEnd)} pessoas`} />
              <Kpi label="Cliques no vídeo" value={nf(cur.videoClicks)} icon={<MousePointerClick size={13} />} hint="Cliques em cima do player na página" />
            </div>
          )}
          {cur.embedded && <Card><Empty title="Vídeo incorporado de outro site" text="Esse vídeo roda dentro de um player de terceiros (iframe), que não deixa a página ler o tempo. Só dá para saber que apertaram play. Para ter a curva de retenção, o vídeo precisa estar hospedado no nosso player." /></Card>}
        </>
      )}

      {r && cur && (
        <>
          <Card title="Retenção segundo a segundo" sub={`${nf(r.starters)} ${r.starters === 1 ? 'pessoa' : 'pessoas'} começaram o vídeo · ${clock(r.duration)} no total. Passe o mouse para ver o segundo exato.`}>
            <RetentionChart r={r} />
            {r.drops.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {[...r.drops].sort((a, b) => b.lost - a.lost).map((d, i) => (
                  <Pill key={i} tone={i === 0 ? 'bad' : 'warn'}><TrendingDown size={12} /> {pf(d.lost)} saem entre {clock(d.from)} e {clock(d.to)}</Pill>
                ))}
              </div>
            )}
          </Card>

          <div className="an-grid c2">
            <Card title="Quanto do vídeo cada um viu" sub="% das pessoas que chegaram até cada parte">
              <Bars data={r.reach} labels={r.reach.map((_, i) => `${(i + 1) * 10}%`)} height={150} />
            </Card>
            <Card title="Onde as pessoas saem" sub="O segundo em que pararam de assistir (não conta quem viu até o fim)">
              {r.leaves.length === 0 ? <Empty title="Todos chegaram ao fim" /> : <Bars data={r.leaves.map(l => l.share)} labels={r.leaves.map(l => clock(l.from))} height={150} color="var(--an-bad)" fmt={v => `${v}%`} />}
            </Card>
          </div>

          <div className="an-grid c2">
            <Card title="Assistir mais converte mais?" sub="Taxa de conversão por quanto do vídeo a pessoa viu">
              <table className="an-table">
                <thead><tr><th>Assistiu</th><th>Pessoas</th><th>Converteram</th><th>Taxa</th></tr></thead>
                <tbody>
                  {r.byWatched.map(b => <tr key={b.label}><td className="name">{b.label}</td><td>{nf(b.sessions)}</td><td>{nf(b.conversions)}</td><td><b>{pf(b.rate)}</b></td></tr>)}
                  <tr><td className="name an-dim">Viu o vídeo e não apertou play</td><td>{nf(r.neverPlayed.sessions)}</td><td>{nf(r.neverPlayed.conversions)}</td><td><b>{pf(r.neverPlayed.rate)}</b></td></tr>
                </tbody>
              </table>
            </Card>
            <Card title="Quedas de audiência" sub="Os trechos que mais perdem gente">
              {r.drops.length === 0 ? <Empty title="Sem quedas fortes" text="A audiência cai de forma suave." /> : (
                <div className="an-list">
                  {[...r.drops].sort((a, b) => b.lost - a.lost).map((d, i) => (
                    <div key={i} className="an-row">
                      <div className="fill" style={{ width: `${Math.min(100, (d.lost / Math.max(...r.drops.map(x => x.lost))) * 100)}%`, background: 'rgba(229,72,77,.1)' }} />
                      <div className="l"><span><b>{clock(d.from)}</b> até <b>{clock(d.to)}</b></span></div>
                      <div className="r"><b className="an-bad">−{pf(d.lost)}</b><em>{pf(d.atStart, 0)} ainda viam</em></div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card title="Retenção por origem" sub="O mesmo vídeo, separado por quem veio de onde: descubra qual público, campanha ou anúncio segura mais gente" right={<Seg value={by as any} onChange={v => setParam('by', v)} options={DIMS.map(d => ({ value: d.value, label: d.label }))} />}>
            <CompareTable rows={data.compare} by={by} />
          </Card>
        </>
      )}
    </div>
  )
}

function RetentionChart({ r }: { r: Retention }) {
  const series = useMemo(() => [{ name: 'Ainda assistindo', color: 'var(--ed-accent)', fill: true, pts: r.curve.map(c => ({ x: c.s, y: c.pct })) }], [r])
  const top = [...r.drops].sort((a, b) => b.lost - a.lost)[0]
  return (
    <XYChart series={series} height={300} yMax={100} xTicks={Math.min(9, Math.max(3, Math.round(r.duration / 30) + 1))} xFmt={clock} yFmt={v => `${Math.round(v)}%`} tipTitle={x => `Aos ${clock(x)} do vídeo`}
      bands={r.drops.map(d => ({ x1: d.from, x2: d.to, tone: 'bad' as const, label: d === top ? `−${Math.round(d.lost)}%` : undefined }))} />
  )
}

function CompareTable({ rows, by }: { rows: CompareRow[]; by: string }) {
  if (rows.length === 0) return <Empty title="Sem dados para comparar" text="É preciso ter espectadores de mais de uma origem para comparar." />
  const labels = rows[0].marks.map(m => m.label)
  const best = (i: number) => Math.max(...rows.map(r => r.marks[i]?.pct ?? 0))
  const label = (r: CompareRow) => (by === 'source' ? SOURCE_LABEL(r.key) : by === 'device' ? ({ mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet' } as any)[r.key] || r.key : r.label)
  return (
    <div className="an-scroll-x">
      <table className="an-table">
        <thead><tr><th>{DIMS.find(d => d.value === by)?.label}</th><th>Espectadores</th>{labels.map(l => <th key={l} title="% que chegou pelo menos até aqui">Chegam a {l}</th>)}<th>Média</th><th>Conversão</th></tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.key}>
              <td className="name"><i className="an-dot" style={{ background: SERIES_COLORS[ri % 6], display: 'inline-block', marginRight: 8 }} />{label(r)}</td>
              <td>{nf(r.viewers)}</td>
              {r.marks.map((m, i) => <td key={i} className={m.pct === best(i) && rows.length > 1 && m.pct > 0 ? 'an-good' : ''}><b>{pf(m.pct, 0)}</b></td>)}
              <td>{pf(r.avgPct, 0)}</td><td>{pf(r.conversionRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="an-dim" style={{ fontSize: 11.5, margin: '10px 4px 0' }}>Em verde, o melhor de cada coluna. Compare duas campanhas, dois anúncios ou celular contra computador para ver quem segura melhor a atenção.</p>
    </div>
  )
}
