'use client'
import { useAn, useData, type FilterKey } from '../state'
import { Card, Empty, ErrorBox, Head, Skel } from '../ui'
import { DEVICE_LABEL, SOURCE_LABEL, channelLabel, countryName, dur, flag, nf, pf, regionLabel } from '../format'

interface Row { key: string; label: string; sessions: number; visitors: number; conversions: number; conversionRate: number; leads: number; avgActiveSec: number; avgScroll: number; bounceRate: number; share: number }

const DIMS: { key: string; label: string; filter?: FilterKey; fmt?: (k: string) => string }[] = [
  { key: 'source', label: 'Origem', filter: 'source', fmt: SOURCE_LABEL },
  { key: 'channel', label: 'Canal', filter: 'channel', fmt: channelLabel },
  { key: 'campaign', label: 'Campanha', filter: 'campaign' },
  { key: 'content', label: 'Anúncio', filter: 'content' },
  { key: 'medium', label: 'Mídia', filter: 'medium' },
  { key: 'term', label: 'Termo' },
  { key: 'referrer', label: 'Site de origem' },
  { key: 'landing', label: 'Entrada', filter: 'page' },
  { key: 'exit', label: 'Saída' },
  { key: 'device', label: 'Aparelho', filter: 'device', fmt: k => DEVICE_LABEL[k] || k },
  { key: 'browser', label: 'Navegador', filter: 'browser' },
  { key: 'os', label: 'Sistema', filter: 'os' },
  { key: 'country', label: 'País', filter: 'country', fmt: k => `${flag(k)} ${countryName(k === '??' ? null : k)}` },
  { key: 'region', label: 'Região', fmt: regionLabel },
  { key: 'language', label: 'Idioma' },
  { key: 'host', label: 'Domínio', filter: 'host' },
]

export function Sources() {
  const { param, setParam, setFilter } = useAn()
  const dim = param('dim') || 'source'
  const d = DIMS.find(x => x.key === dim) || DIMS[0]
  const { data, error, reload, loading } = useData<{ rows: Row[] }>('breakdown', { dim, limit: 50 })
  const max = Math.max(...(data?.rows.map(r => r.sessions) || [1]), 1)
  return (
    <div>
      <Head title="Origens e públicos" sub="De onde vem cada visita e como cada grupo se comporta. Clique numa linha para filtrar todas as telas por ela." />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {DIMS.map(x => <button key={x.key} className="an-fchip" data-on={x.key === dim} onClick={() => setParam('dim', x.key)}>{x.label}</button>)}
      </div>
      {error && !data && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Skel h={360} />}
      {data && (
        <Card flush className={loading ? 'an-busy' : ''}>
          {data.rows.length === 0 ? <Empty title="Sem dados neste período" /> : (
            <div className="an-scroll-x">
              <table className="an-table">
                <thead><tr><th>{d.label}</th><th>Visitas</th><th>Visitantes</th><th>Leads</th><th>Conversões</th><th>Taxa</th><th>Tempo ativo</th><th>Rolagem</th><th>Sem interagir</th></tr></thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.key} className={d.filter && r.key !== '(sem campanha)' && r.key !== '(sem anúncio)' ? 'click' : ''} onClick={() => d.filter && setFilter(d.filter, r.key)}>
                      <td className="name">{d.fmt ? d.fmt(r.key) : r.label}</td>
                      <td><span className="an-mini" style={{ width: 70 }}><i style={{ width: `${(r.sessions / max) * 100}%` }} /></span><b>{nf(r.sessions)}</b> <span className="an-dim">{pf(r.share, 0)}</span></td>
                      <td>{nf(r.visitors)}</td><td>{nf(r.leads)}</td><td>{nf(r.conversions)}</td>
                      <td><b className={r.conversionRate >= 3 ? 'an-good' : ''}>{pf(r.conversionRate)}</b></td>
                      <td>{dur(r.avgActiveSec)}</td><td>{pf(r.avgScroll, 0)}</td><td className={r.bounceRate >= 60 ? 'an-bad' : ''}>{pf(r.bounceRate, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
