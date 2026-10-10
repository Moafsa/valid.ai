'use client'
import { useState } from 'react'
import { Flame, Gauge, Smartphone, Snowflake, Sun, Wifi } from 'lucide-react'
import { useData } from '../state'
import { BarList, Card, Empty, ErrorBox, Head, Kpi, Pill, Seg, Skel } from '../ui'
import { SERIES_COLORS, StackBar } from '../charts'
import { SOURCE_LABEL, DEVICE_LABEL, nf, pf, countryName } from '../format'
import type { Audience } from '@/lib/analytics/audience'

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const sec = (ms: number) => `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`

export function AudienceView() {
  const { data, error, reload, loading } = useData<Audience>('audience')
  const [metric, setMetric] = useState<'sessions' | 'conversions'>('sessions')
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <div style={{ display: 'grid', gap: 14 }}><Head title="Público" /><Skel h={420} /></div>
  const a = data
  const total = a.score.hot + a.score.warm + a.score.cold
  const empty = total === 0

  // week x hour heat
  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0))
  for (const h of a.hours) grid[h.dow][h.hour] = metric === 'sessions' ? h.sessions : h.conversions
  const max = Math.max(1, ...grid.flat())
  const best = a.hours.length ? [...a.hours].sort((x, y) => (metric === 'sessions' ? y.sessions - x.sessions : y.conversions - x.conversions))[0] : null
  const sp = a.speed
  const lcpTone = sp.lcp.p75 <= 2500 ? 'good' : sp.lcp.p75 <= 4000 ? 'warn' : 'bad'

  return (
    <div className={loading ? 'an-busy' : ''}>
      <Head title="Público" sub="Quem são as pessoas que chegam: aparelho e modelo, de qual aplicativo abriram o link, a velocidade real que a página teve para elas, quando chegam e quais parecem clientes de verdade." />
      {empty && <Card><Empty title="Ainda sem visitas neste período" text="O perfil do público aparece conforme as pessoas chegam na página publicada." /></Card>}

      <div className="an-grid c4">
        <Kpi hero label="Leads quentes" value={nf(a.score.hot)} unit={`de ${nf(total)}`} icon={<Flame size={13} />} hint="Visitas com nota 70 ou mais: ficaram, rolaram, viram o vídeo ou converteram" />
        <Kpi hero label="Mornos" value={nf(a.score.warm)} icon={<Sun size={13} />} hint="Nota de 40 a 69" />
        <Kpi hero label="Frios" value={nf(a.score.cold)} icon={<Snowflake size={13} />} hint="Nota abaixo de 40: saíram quase sem fazer nada" />
        <Kpi hero label="Nota média" value={`${a.score.avg}`} unit="/ 100" icon={<Gauge size={13} />} />
      </div>
      {total > 0 && <Card style={{ marginBottom: 14 }}><StackBar parts={[{ key: 'q', label: 'Quentes', value: a.score.hot, color: 'var(--an-bad)' }, { key: 'm', label: 'Mornos', value: a.score.warm, color: 'var(--an-warn)' }, { key: 'f', label: 'Frios', value: a.score.cold, color: 'var(--an-s1)' }]} height={12} /></Card>}

      <div className="an-grid c2">
        <Card title="Quem é o lead quente" sub="O que as visitas mais quentes têm em comum, comparado com todo mundo (quanto maior o fator, mais característico)">
          {a.score.profile.length === 0 ? <Empty title="Poucos leads quentes ainda" text="Com pelo menos 3 visitas quentes o perfil aparece." /> : (
            <div className="an-list">
              {a.score.profile.map(p => (
                <div key={p.dim + p.key} className="an-row">
                  <div className="fill" style={{ width: `${Math.min(100, p.hotShare)}%`, background: 'rgba(229,72,77,.09)' }} />
                  <div className="l"><span><b>{p.dim === 'Origem' ? SOURCE_LABEL(p.key) : p.dim === 'Aparelho' ? DEVICE_LABEL[p.key] || p.key : p.dim === 'País' ? countryName(p.key) : p.key}</b> <span className="an-dim">· {p.dim}</span></span></div>
                  <div className="r"><b>{pf(p.hotShare, 0)}</b><em>{p.lift >= 1.2 ? <span className="an-good">{p.lift.toLocaleString('pt-BR')}x</span> : `${p.lift.toLocaleString('pt-BR')}x`}</em></div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Nota por origem" sub="Qual origem traz o tráfego mais qualificado">
          <BarList items={a.score.bySource.map((r, i) => ({ key: r.key, label: SOURCE_LABEL(r.key), value: r.avgScore, text: `${r.avgScore}`, sub: `${pf(r.hotShare, 0)} quentes`, pct: r.avgScore, color: SERIES_COLORS[i % 6] }))} />
        </Card>
      </div>

      <div className="an-grid c2">
        <Card title="Aparelho e modelo" sub="Marca e modelo do celular (o iPhone é reconhecido pelo tamanho da tela)" right={<Smartphone size={15} color="var(--ed-text-3)" />}>
          <BarList items={a.models.slice(0, 10).map((m, i) => ({ key: m.brand + m.model, label: <span>{m.brand !== '—' ? <b>{m.brand}</b> : ''} {m.model !== '—' ? m.model : m.brand === '—' ? 'Computador / desconhecido' : ''}</span>, value: m.sessions, sub: `${pf(m.conversionRate)} conv.`, color: SERIES_COLORS[i % 6] }))} />
        </Card>
        <Card title="De qual aplicativo abriram" sub="Quem clica no anúncio abre dentro do Instagram, do Facebook ou do TikTok, não no navegador do celular">
          <div className="an-scroll-x">
            <table className="an-table">
              <thead><tr><th>Aplicativo</th><th>Visitas</th><th>Conversão</th><th>Saem sem agir</th><th>Nota</th></tr></thead>
              <tbody>{a.inApp.map(r => <tr key={r.key}><td className="name">{r.key}</td><td><b>{nf(r.sessions)}</b> <span className="an-dim">{pf(r.share, 0)}</span></td><td>{pf(r.conversionRate)}</td><td className={r.bounceRate >= 60 ? 'an-bad' : ''}>{pf(r.bounceRate, 0)}</td><td>{r.avgScore}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Velocidade real da página" sub={sp.measured ? `Medida no navegador de ${nf(sp.measured)} visitas. Até 2,5 s para aparecer o conteúdo principal é o que o Google considera bom.` : 'Aparece conforme as visitas chegam.'} right={<Pill tone={lcpTone === 'good' ? 'good' : lcpTone === 'warn' ? 'warn' : 'bad'}>{sp.measured ? `${sec(sp.lcp.p75)} para 3 em cada 4 pessoas` : 'sem dados'}</Pill>}>
        {sp.measured === 0 ? <Empty title="Sem medições ainda" /> : (
          <>
            <div className="an-grid c4" style={{ marginBottom: 8 }}>
              <Kpi label="Conteúdo principal (LCP)" value={sec(sp.lcp.p50)} unit="mediana" hint="Tempo até aparecer a maior parte do que se vê" />
              <Kpi label="Primeiro conteúdo (FCP)" value={sec(sp.fcp75)} unit="p75" />
              <Kpi label="Resposta do servidor (TTFB)" value={`${nf(sp.ttfb75)} ms`} unit="p75" />
              <Kpi label="Páginas boas" value={pf(sp.goodShare, 0)} unit="até 2,5 s" />
            </div>
            <div className="ed-section-title" style={{ margin: '14px 0 8px' }}>O que a lentidão custa</div>
            <div className="an-scroll-x">
              <table className="an-table">
                <thead><tr><th>Quando a página abriu</th><th>Visitas</th><th>Saem sem agir</th><th>Conversão</th></tr></thead>
                <tbody>{sp.buckets.map(b => <tr key={b.label}><td className="name">{b.label}</td><td>{nf(b.sessions)} <span className="an-dim">{pf(b.share, 0)}</span></td><td className={b.bounceRate >= 60 ? 'an-bad' : ''}>{pf(b.bounceRate, 0)}</td><td>{pf(b.conversionRate)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="an-grid c2" style={{ marginTop: 14, marginBottom: 0 }}>
              <div><div className="ed-section-title" style={{ marginBottom: 6 }}>Por aparelho (3 em cada 4)</div><BarList items={sp.byDevice.map((d, i) => ({ key: d.device, label: DEVICE_LABEL[d.device] || d.device, value: d.lcp75, text: sec(d.lcp75), sub: `${nf(d.sessions)} vis.`, color: SERIES_COLORS[i % 6] }))} /></div>
              <div><div className="ed-section-title" style={{ marginBottom: 6 }}>Por aplicativo de origem</div><BarList items={sp.byInApp.map((d, i) => ({ key: d.key, label: d.key, value: d.lcp75, text: sec(d.lcp75), sub: `${nf(d.sessions)} vis.`, color: SERIES_COLORS[i % 6] }))} /></div>
            </div>
          </>
        )}
      </Card>

      <div style={{ height: 14 }} />
      <div className="an-grid c2">
        <Card title="Conexão" sub="Como o navegador diz que está a internet da pessoa (nem todo navegador informa)" right={<Wifi size={15} color="var(--ed-text-3)" />}>
          <BarList items={a.connections.map((r, i) => ({ key: r.key, label: r.key === '4g' ? '4G ou melhor' : r.key, value: r.sessions, sub: `${pf(r.conversionRate)} conv.`, color: SERIES_COLORS[i % 6] }))} />
        </Card>
        <Card title="Tamanho de tela" sub="Largura da janela em que a página foi vista">
          <BarList items={a.screens.map((r, i) => ({ key: r.key, label: r.key, value: r.sessions, sub: `${pf(r.conversionRate)} conv.`, color: SERIES_COLORS[i % 6] }))} />
        </Card>
      </div>

      <div style={{ height: 14 }} />
      <Card title="Quando chegam" sub={best ? `Horário de Brasília. Mais ${metric === 'sessions' ? 'visitas' : 'conversões'}: ${DOW[best.dow]} às ${String(best.hour).padStart(2, '0')}h` : 'Horário de Brasília'} right={<Seg value={metric} onChange={setMetric} options={[{ value: 'sessions', label: 'Visitas' }, { value: 'conversions', label: 'Conversões' }]} />}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '34px repeat(24, minmax(16px, 1fr))', gap: 3, minWidth: 560 }}>
            <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="an-dim" style={{ fontSize: 9.5, textAlign: 'center' }}>{h % 3 === 0 ? h : ''}</span>)}
            {grid.map((row, d) => (
              <div key={d} style={{ display: 'contents' }}>
                <span className="an-dim" style={{ fontSize: 11, lineHeight: '20px' }}>{DOW[d]}</span>
                {row.map((v, h) => <span key={h} title={`${DOW[d]} ${h}h: ${v}`} style={{ height: 20, borderRadius: 4, background: v ? `color-mix(in srgb, var(--ed-accent) ${Math.max(14, Math.round((v / max) * 100))}%, transparent)` : 'var(--ed-panel-2)', border: '1px solid var(--ed-line)' }} />)}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div style={{ height: 14 }} />
      <Card title="Novos e que voltaram" sub="Quem já tinha visitado antes costuma estar mais perto de comprar">
        <div className="an-grid c2" style={{ marginBottom: 0 }}>
          <Kpi label="Visitas de gente nova" value={nf(a.returning.newSessions)} unit={`${pf(a.returning.newRate)} convertem`} />
          <Kpi label="Visitas de quem voltou" value={nf(a.returning.returningSessions)} unit={`${pf(a.returning.returningRate)} convertem`} />
        </div>
      </Card>
    </div>
  )
}
