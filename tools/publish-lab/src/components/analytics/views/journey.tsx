'use client'
import { ArrowRight, Flag, Globe, LogIn } from 'lucide-react'
import { useAn, useData } from '../state'
import { BarList, Card, Empty, ErrorBox, Head, Skel } from '../ui'
import { SERIES_COLORS } from '../charts'
import { SOURCE_LABEL, nf, pf, when } from '../format'
import { useState } from 'react'
import { SessionDrawer } from './sessions'

interface Step { key: string; label: string; count: number; ofTotal: number; ofPrev: number; lost: number; lostAt: { slug: string; count: number } | null; hint?: string }
interface Data { steps: Step[]; origins: { source: string; sessions: number }[]; entry: { slug: string; sessions: number }[]; paths: { from: string; to: string; sessions: number }[] }

export function Journey() {
  const { setFilter, setView } = useAn()
  const { data, error, reload, loading } = useData<Data>('journey')
  const leads = useData<{ rows: any[] }>('sessions', { lead: '1', size: 8 })
  const [open, setOpen] = useState<string | null>(null)
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <div style={{ display: 'grid', gap: 14 }}><Head title="Jornada do lead" /><Skel h={420} /></div>
  const first = data.steps[0]?.count || 0
  const last = data.steps[data.steps.length - 1]
  return (
    <div className={loading ? 'an-busy' : ''}>
      <Head title="Jornada do lead" sub="Do anúncio até a conversão: quantas pessoas chegam em cada etapa e onde as outras ficam pelo caminho. Cada número vem de uma ação registrada na página." />
      {first === 0 ? <Card><Empty title="Sem visitas neste período" text="Quando houver visitas, a jornada aparece aqui." /></Card> : (
        <>
          <div className="an-grid c3" style={{ gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr)' }}>
            <Card title="1. Origem" sub="De onde vieram" right={<Globe size={15} color="var(--ed-text-3)" />}>
              <BarList items={data.origins.map((o, i) => ({ key: o.source, label: SOURCE_LABEL(o.source), value: o.sessions, color: SERIES_COLORS[i % 6], sub: pf((o.sessions / first) * 100, 0), onClick: () => setFilter('source', o.source) }))} />
            </Card>
            <Card title="2. Página de entrada" sub="Onde chegaram" right={<LogIn size={15} color="var(--ed-text-3)" />}>
              <BarList items={data.entry.map(o => ({ key: o.slug, label: o.slug, value: o.sessions, sub: pf((o.sessions / first) * 100, 0), onClick: () => setFilter('page', o.slug) }))} />
            </Card>
            <Card title="Resultado" sub="No fim do caminho" right={<Flag size={15} color="var(--ed-text-3)" />}>
              <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', marginTop: 4 }}>{nf(last.count)}</div>
              <div className="an-dim" style={{ marginBottom: 10 }}>converteram de {nf(first)} visitas ({pf(last.ofTotal)})</div>
              <div className="an-dim" style={{ fontSize: 12 }}>A cada 100 pessoas que chegam, {Math.round(last.ofTotal)} chegam ao fim.</div>
            </Card>
          </div>

          <Card title="Funil da jornada" sub="Cada barra é uma etapa; a perda aparece entre uma e outra">
            <div className="an-funnel">
              {data.steps.map((s, i) => (
                <div key={s.key}>
                  {i > 0 && s.lost > 0 && (
                    <div className="an-floss">
                      −{nf(s.lost)} ({pf(100 - s.ofPrev, 0)}) não seguiram
                      {s.lostAt && <span className="an-dim"> · a maioria terminou em “{s.lostAt.slug}” ({nf(s.lostAt.count)})</span>}
                    </div>
                  )}
                  <div className="an-fstep">
                    <div className="name">{i + 1}. {s.label}{s.hint && <small>{s.hint}</small>}</div>
                    <div className="an-fbar"><i style={{ width: `${Math.max(1.5, s.ofTotal)}%`, opacity: 1 - i * 0.04 }} /><span>{nf(s.count)}</span></div>
                    <div className="an-fnum"><b>{pf(s.ofTotal, 1)}</b><small>{i === 0 ? 'de todas as visitas' : `${pf(s.ofPrev, 0)} da etapa anterior`}</small></div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="an-grid c2" style={{ marginTop: 14 }}>
            <Card title="Caminhos mais comuns" sub="Para onde as pessoas vão depois de cada página">
              {data.paths.length === 0 ? <Empty title="Só uma página" text="Os caminhos aparecem quando há mais de uma página no funil." /> : (
                <div className="an-list">
                  {data.paths.slice(0, 10).map((p, i) => (
                    <div key={i} className="an-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                      <div className="fill" style={{ width: `${(p.sessions / data.paths[0].sessions) * 100}%` }} />
                      <div className="l"><span>{p.from}</span><ArrowRight size={13} color="var(--ed-text-3)" /><span className={p.to === '(saiu)' ? 'an-bad' : ''}>{p.to === '(saiu)' ? 'saiu do site' : p.to}</span></div>
                      <div className="r"><b>{nf(p.sessions)}</b></div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title="Últimos leads" sub="Clique para ver a jornada inteira de cada um" right={<button className="ed-btn ed-btn-ghost ed-btn-sm" onClick={() => setView('sessions', { lead: '1' })}>Ver todos</button>}>
              {!leads.data ? <Skel h={160} /> : leads.data.rows.length === 0 ? <Empty title="Nenhum lead ainda" text="Quando alguém preencher um formulário, a jornada dele aparece aqui." /> : (
                <div className="an-list">
                  {leads.data.rows.map((r: any) => (
                    <div key={r.id} className="an-row click" onClick={() => setOpen(r.id)}>
                      <div className="l"><span><b>{r.lead?.name || r.lead?.email || r.lead?.phone || 'Lead'}</b> <span className="an-dim">· {SOURCE_LABEL(r.source || 'direct')}{r.campaign ? ` / ${r.campaign}` : ''}</span></span></div>
                      <div className="r"><em style={{ minWidth: 0 }}>{when(r.startedAt)}</em></div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
      {open && <SessionDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
