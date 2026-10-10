'use client'
import { AlertTriangle, MousePointerClick, Repeat, Sparkles } from 'lucide-react'
import { useAn, useData } from '../state'
import { Bars } from '../charts'
import { BarList, Card, Empty, ErrorBox, Head, Kpi, Pill, Skel } from '../ui'
import { dur, nf, pf, selName } from '../format'

interface Data {
  items: { slug: string | null; sel: string; text: string | null; tag: string | null; kind: 'rage' | 'dead'; clicks: number; sessions: number }[]
  rageSessions: number; deadSessions: number; sessions: number
  attention: { slug: string | null; sel: string; text: string | null; tag: string | null; clicks: number; sessions: number; conversionRate: number; lift: number }[]
  abandonment: { slug: string; leavers: number; views: number; leaveRate: number; avgScrollAtExit: number; depth: number[]; avgActiveSec: number }[]
}

export function Friction() {
  const { setView, setParam } = useAn()
  const { data, error, reload, loading } = useData<Data>('frictions')
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <div style={{ display: 'grid', gap: 14 }}><Head title="Atrito e atenção" /><Skel h={420} /></div>
  const rage = data.items.filter(i => i.kind === 'rage'), dead = data.items.filter(i => i.kind === 'dead')
  const goMap = (slug: string | null, mode: string) => { if (slug) { setParam('page', slug); setParam('mode', mode); setView('maps', { page: slug, mode }) } }
  return (
    <div className={loading ? 'an-busy' : ''}>
      <Head title="Atrito e atenção" sub="Onde as pessoas se frustram (clicam várias vezes ou clicam e nada acontece), o que mais prende a atenção e em que ponto de cada página elas desistem." />
      <div className="an-grid c4">
        <Kpi hero label="Visitas com cliques repetidos" value={nf(data.rageSessions)} unit={`de ${nf(data.sessions)}`} icon={<Repeat size={13} />} hint="3 ou mais cliques seguidos no mesmo ponto em 1 segundo" />
        <Kpi hero label="Visitas com clique sem resposta" value={nf(data.deadSessions)} unit={`de ${nf(data.sessions)}`} icon={<MousePointerClick size={13} />} hint="Clicaram em algo que parece clicável e nada aconteceu" />
        <Kpi label="% com algum atrito" value={pf(data.sessions ? ((data.rageSessions + data.deadSessions) / data.sessions) * 100 : 0, 1)} icon={<AlertTriangle size={13} />} />
        <Kpi label="Elementos que concentram atenção" value={nf(data.attention.length)} icon={<Sparkles size={13} />} />
      </div>
      <div className="an-grid c2">
        <Card title="Cliques repetidos" sub="A pessoa apertou o mesmo ponto várias vezes seguidas: costuma ser algo que parece botão, ou um botão lento">
          {rage.length === 0 ? <Empty title="Nenhum caso" text="Ótimo sinal: ninguém clicou repetidamente." /> : (
            <BarList items={rage.slice(0, 8).map(i => ({ key: i.sel, label: <span title={i.sel}>{i.text ? `“${i.text}”` : selName(i.sel)} <span className="an-dim">· {i.slug}</span></span>, value: i.clicks, sub: `${nf(i.sessions)} vis.`, color: 'var(--an-bad)', onClick: () => goMap(i.slug, 'friction') }))} />
          )}
        </Card>
        <Card title="Cliques sem resposta" sub="Parece clicável, mas nada acontece. Transforme em link ou tire a aparência de botão">
          {dead.length === 0 ? <Empty title="Nenhum caso" text="Tudo que foi clicado respondeu." /> : (
            <BarList items={dead.slice(0, 8).map(i => ({ key: i.sel, label: <span title={i.sel}>{i.text ? `“${i.text}”` : selName(i.sel)} <span className="an-dim">· {i.slug}</span></span>, value: i.clicks, sub: `${nf(i.sessions)} vis.`, color: 'var(--an-warn)', onClick: () => goMap(i.slug, 'friction') }))} />
          )}
        </Card>
      </div>
      <Card title="Elementos de atenção" sub="O que mais recebe clique, e se quem clica converte mais que a média (lift)" flush>
        {data.attention.length === 0 ? <Empty title="Ainda sem cliques suficientes" text="Aparecem elementos clicados por pelo menos duas visitas." /> : (
          <div className="an-scroll-x">
            <table className="an-table">
              <thead><tr><th>Elemento</th><th>Página</th><th>Cliques</th><th>Visitas</th><th>Conversão de quem clicou</th><th>vs. média</th></tr></thead>
              <tbody>
                {data.attention.map(a => (
                  <tr key={a.slug + a.sel} className="click" onClick={() => goMap(a.slug, 'click')}>
                    <td className="name" title={a.sel}>{a.text ? `“${a.text}”` : selName(a.sel)}</td><td>{a.slug}</td><td>{nf(a.clicks)}</td><td>{nf(a.sessions)}</td><td>{pf(a.conversionRate)}</td>
                    <td>{a.lift > 0 ? <Pill tone={a.lift >= 1.3 ? 'good' : a.lift <= 0.7 ? 'bad' : undefined}>{a.lift.toLocaleString('pt-BR')}x</Pill> : <span className="an-dim">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div style={{ height: 14 }} />
      <Card title="Pontos de abandono" sub="Em que altura de cada página as pessoas que não converteram saem. Cada barra é um décimo da página, de cima para baixo">
        {data.abandonment.length === 0 ? <Empty title="Sem abandonos registrados" /> : (
          <div style={{ display: 'grid', gap: 22 }}>
            {data.abandonment.slice(0, 5).map(a => {
              const worst = a.depth.indexOf(Math.max(...a.depth))
              return (
                <div key={a.slug}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div><b>{a.slug}</b> <span className="an-dim">· {nf(a.leavers)} saíram sem converter ({pf(a.leaveRate, 0)} das aberturas) · ficaram {dur(a.avgActiveSec)}</span></div>
                    <Pill tone="bad">mais gente sai entre {worst * 10}% e {(worst + 1) * 10}% da página</Pill>
                  </div>
                  <Bars data={a.depth} labels={a.depth.map((_, i) => `${i * 10}%`)} height={92} color="var(--an-bad)" />
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
