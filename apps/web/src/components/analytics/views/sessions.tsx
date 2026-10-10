'use client'
import { useState } from 'react'
import { AlertCircle, ArrowRight, CheckCircle2, ExternalLink, FileText, Flag, LogOut, MousePointerClick, Play, Phone, ScrollText, Send, Video, Zap } from 'lucide-react'
import { useAn, useData } from '../state'
import { Card, Drawer, Empty, ErrorBox, Head, Pill, Seg, Skel } from '../ui'
import { DEVICE_LABEL, SOURCE_LABEL, channelLabel, countryName, dur, flag, nf, regionLabel, when, clock } from '../format'

interface SRow { id: string; startedAt: string; source: string | null; channel: string | null; campaign: string | null; content: string | null; landingSlug: string | null; exitSlug: string | null; device: string | null; browser: string | null; os: string | null; country: string | null; region: string | null; city: string | null; pageCount: number; activeSec: number; durationSec: number; maxScroll: number; clickCount: number; rageCount: number; deadCount: number; brand: string | null; model: string | null; inApp: string | null; score: number; videoMaxPct: number; videoPlays: number; converted: boolean; goal: string | null; isNew: boolean; lead: { id: string; name: string | null; email: string | null; phone: string | null } | null; recording: boolean }

export function Sessions() {
  const { param, setParam, setView } = useAn()
  const lead = param('lead') === '1', rec = param('rec') === '1'
  const sort = param('sort') || 'recent'
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const { data, error, reload, loading } = useData<{ rows: SRow[]; total: number }>('sessions', { page, size: 30, sort, lead: lead ? 1 : 0, rec: rec ? 1 : 0 })
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 30))
  return (
    <div>
      <Head title="Visitantes" sub="Cada visita com origem, aparelho, o que fez e se converteu. Abra uma para ver a jornada passo a passo."
        right={<>
          <Seg value={sort as any} onChange={v => { setParam('sort', v); setPage(1) }} options={[{ value: 'recent', label: 'Recentes' }, { value: 'long', label: 'Mais tempo' }, { value: 'clicks', label: 'Mais cliques' }, { value: 'frustrated', label: 'Frustradas' }]} />
          <button className={`an-fchip`} data-on={lead} onClick={() => { setParam('lead', lead ? null : '1'); setPage(1) }}>Só leads</button>
          <button className={`an-fchip`} data-on={rec} onClick={() => { setParam('rec', rec ? null : '1'); setPage(1) }}>Com gravação</button>
        </>} />
      {error && !data && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Skel h={420} />}
      {data && (
        <Card flush className={loading ? 'an-busy' : ''}>
          {data.rows.length === 0 ? <Empty title="Nenhuma visita assim" text="Ajuste os filtros ou o período." /> : (
            <div className="an-scroll-x">
              <table className="an-table">
                <thead><tr><th>Visitante</th><th>Nota</th><th>Origem</th><th>Aparelho</th><th>Onde</th><th>Páginas</th><th>Tempo</th><th>Rolagem</th><th>Cliques</th><th>Vídeo</th><th></th></tr></thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.id} className="click" onClick={() => setOpen(r.id)}>
                      <td className="name">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {r.converted ? <CheckCircle2 size={15} color="var(--an-good)" /> : <span style={{ width: 15 }} />}
                          <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{r.lead ? r.lead.name || r.lead.email || r.lead.phone : r.isNew ? 'Novo visitante' : 'Visitante que voltou'}</div><div className="an-dim" style={{ fontSize: 11 }}>{when(r.startedAt)}{r.goal ? ` · ${r.goal}` : ''}</div></div>
                        </div>
                      </td>
                      <td><span className={`an-pill ${r.score >= 70 ? 'bad' : r.score >= 40 ? 'warn' : ''}`}>{r.score}</span></td>
                      <td style={{ textAlign: 'left' }}>{SOURCE_LABEL(r.source || 'direct')}{r.campaign ? <div className="an-dim" style={{ fontSize: 11 }}>{r.campaign}</div> : null}</td>
                      <td style={{ textAlign: 'left' }}>{r.model && r.model !== '—' ? r.model : DEVICE_LABEL[r.device || ''] || r.device}<div className="an-dim" style={{ fontSize: 11 }}>{r.inApp ? `dentro do ${r.inApp}` : r.browser}</div></td>
                      <td style={{ textAlign: 'left' }}>{flag(r.country)} {r.country ? (r.region && r.country === 'BR' ? regionLabel(`${r.country}/${r.region}`).replace(/^.. /, '') : countryName(r.country)) : '—'}</td>
                      <td>{r.pageCount}</td><td>{dur(r.activeSec)}</td><td>{r.maxScroll}%</td>
                      <td>{nf(r.clickCount)}{r.rageCount > 0 && <Pill tone="bad">{r.rageCount}×</Pill>}</td>
                      <td>{r.videoPlays > 0 ? `${r.videoMaxPct}%` : <span className="an-dim">—</span>}</td>
                      <td>{r.recording && <Video size={14} color="var(--ed-accent)" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid var(--ed-line)' }}>
              <span className="an-dim">{nf(data.total)} visitas · página {page} de {pages}</span>
              <div style={{ display: 'flex', gap: 6 }}><button className="ed-btn ed-btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><button className="ed-btn ed-btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Próxima</button></div>
            </div>
          )}
        </Card>
      )}
      {open && <SessionDrawer id={open} onClose={() => setOpen(null)} onRecording={() => { setOpen(null); setView('recordings', { session: open }) }} />}
    </div>
  )
}

const ICONS: Record<string, React.ReactNode> = {
  page: <FileText size={12} />, click: <MousePointerClick size={12} />, rage: <Zap size={12} />, dead: <AlertCircle size={12} />, scroll: <ScrollText size={12} />, video: <Play size={12} />,
  form: <Send size={12} />, lead: <Flag size={12} />, goal: <Flag size={12} />, checkout: <CheckCircle2 size={12} />, outbound: <ExternalLink size={12} />, contact: <Phone size={12} />, exit: <LogOut size={12} />, custom: <Zap size={12} />,
}

export function SessionDrawer({ id, onClose, onRecording }: { id: string; onClose: () => void; onRecording?: () => void }) {
  const { projectId } = useAn()
  const { data, error } = useData<any>('session', { id }, { filters: false })
  const s = data?.session
  return (
    <Drawer title={s ? (data.lead ? data.lead.name || data.lead.email || data.lead.phone || 'Lead' : 'Visita') : 'Visita'} onClose={onClose}>
      {error && <ErrorBox message={error} />}
      {!data && !error && <Skel h={300} />}
      {s && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {s.converted ? <Pill tone="good"><CheckCircle2 size={12} /> Converteu{s.goal ? `: ${s.goal}` : ''}</Pill> : <Pill>Não converteu</Pill>}
            {s.isNew ? <Pill>Novo</Pill> : <Pill tone="blue">Voltou</Pill>}
            <Pill>{s.mode === 'draft' ? 'Rascunho' : 'Publicado'}</Pill>
            {s.rageCount > 0 && <Pill tone="bad">{s.rageCount} cliques repetidos</Pill>}
            {s.deadCount > 0 && <Pill tone="warn">{s.deadCount} sem resposta</Pill>}
            {s.expId && <Pill tone="blue">Teste A/B · versão {s.variant}</Pill>}
          </div>
          <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 18px', margin: 0, fontSize: 12.5 }}>
            {[
              ['Origem', `${SOURCE_LABEL(s.source || 'direct')} · ${channelLabel(s.channel || 'direct')}`], ['Campanha', s.utmCampaign || '—'],
              ['Anúncio', s.utmContent || '—'], ['Mídia / termo', [s.utmMedium, s.utmTerm].filter(Boolean).join(' / ') || '—'],
              ['Chegou por', s.referrerDomain || 'acesso direto'], ['Entrou em', s.landingSlug || '—'],
              ['Aparelho', `${[s.deviceBrand, s.deviceModel].filter(x => x && x !== '—').join(' ') || DEVICE_LABEL[s.device] || s.device} · ${s.os || ''} ${s.osVersion || ''}`], ['Aberto em', s.inApp ? `dentro do ${s.inApp}` : `${s.browser || ''} ${s.browserVersion || ''}`],
              ['Nota do lead', `${s.score} de 100 (${s.score >= 70 ? 'quente' : s.score >= 40 ? 'morno' : 'frio'})`], ['Velocidade', s.lcpMs ? `conteúdo em ${(s.lcpMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s${s.connection ? ` · conexão ${s.connection}` : ''}` : '—'],
              ['Tela', s.viewportW ? `${s.viewportW}×${s.viewportH}` : '—'], ['Local', `${flag(s.country)} ${[s.city, s.region, s.country ? countryName(s.country) : ''].filter(Boolean).join(', ') || '—'}`],
              ['Tempo ativo', `${dur(Math.round(s.activeMs / 1000))} de ${dur(Math.round(s.durationMs / 1000))}`], ['Rolagem máxima', `${s.maxScroll}%`],
              ['Quando', new Date(s.startedAt).toLocaleString('pt-BR')], ['Visitante', String(s.visitorId).slice(0, 10)],
            ].map(([k, v]) => <div key={k as string}><dt className="an-dim" style={{ fontSize: 11 }}>{k}</dt><dd style={{ margin: 0, fontWeight: 550, wordBreak: 'break-word' }}>{v}</dd></div>)}
          </dl>
          {data.lead && (
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--ed-panel-2)', border: '1px solid var(--ed-line)' }}>
              <div style={{ fontWeight: 650, marginBottom: 4 }}>Lead</div>
              <div style={{ fontSize: 12.5 }}>{[data.lead.name, data.lead.email, data.lead.phone].filter(Boolean).join(' · ') || 'Sem contato informado'}</div>
            </div>
          )}
          {data.videos.length > 0 && (
            <div>
              <div className="ed-section-title" style={{ marginBottom: 8 }}><Video size={12} /> Vídeo</div>
              {data.videos.map((v: any) => (
                <div key={v.id} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>Assistiu {dur(v.watchedSecs)} de {v.duration ? clock(v.duration) : '?'}</span><b>{v.duration ? `${Math.min(100, Math.round((v.maxTime / v.duration) * 100))}%` : ''}</b></div>
                  <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'var(--ed-active)', marginTop: 5, overflow: 'hidden' }}>
                    {(v.ranges as [number, number][]).map((r, i) => <i key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(r[0] / Math.max(1, v.duration || v.maxTime)) * 100}%`, width: `${Math.max(0.8, ((r[1] - r[0] + 1) / Math.max(1, v.duration || v.maxTime)) * 100)}%`, background: 'var(--ed-accent)' }} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div>
            <div className="ed-section-title" style={{ marginBottom: 8 }}><ArrowRight size={12} /> Jornada</div>
            <div className="an-tl">
              {data.timeline.map((t: any, i: number) => (
                <div className="an-tl-i" key={i}>
                  <div className="t">{new Date(t.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                  <div className="d"><i className={`k-${t.kind}`}>{ICONS[t.kind] || <Zap size={12} />}</i></div>
                  <div className="x">{t.label}{t.detail && <small title={t.detail}>{t.detail}</small>}</div>
                </div>
              ))}
              {data.timeline.length === 0 && <span className="an-dim">Sem registros.</span>}
            </div>
          </div>
          {data.recording && onRecording && <button className="ed-btn ed-btn-primary" onClick={onRecording}><Video size={14} /> Ver a gravação desta visita</button>}
          {data.recording && !onRecording && <a className="ed-btn" href={`/projects/${projectId}/metricas?v=recordings&session=${s.id}`}><Video size={14} /> Ver a gravação desta visita</a>}
        </div>
      )}
    </Drawer>
  )
}
