'use client'
import { useEffect, useState } from 'react'
import { CheckCircle2, MousePointerClick, Video, Zap } from 'lucide-react'
import { useAn, useData } from '../state'
import { ReplayPlayer } from '../replay'
import { Card, Empty, ErrorBox, Head, Pill, Seg, Skel } from '../ui'
import { DEVICE_LABEL, SOURCE_LABEL, clock, countryName, flag, when } from '../format'

interface Rec { id: string; sessionId: string; startedAt: string; durationMs: number; events: number; bytes: number; device: string | null; viewportW: number | null; viewportH: number | null; source: string | null; utmCampaign: string | null; country: string | null; browser: string | null; pageCount: number; clickCount: number; rageCount: number; deadCount: number; converted: boolean; maxScroll: number; landingSlug: string | null }

export function Recordings() {
  const { param, setParam, projectId } = useAn()
  const [sort, setSort] = useState<'recent' | 'frustrated'>('recent')
  const [only, setOnly] = useState<'all' | 'conv' | 'friction'>('all')
  const { data, error, reload, loading } = useData<{ rows: Rec[] }>('recordings', { sort })
  const sel = param('session')
  const rows = (data?.rows || []).filter(r => (only === 'conv' ? r.converted : only === 'friction' ? r.rageCount + r.deadCount > 0 : true))
  const cur = rows.find(r => r.sessionId === sel) || (sel ? (data?.rows || []).find(r => r.sessionId === sel) : undefined) || rows[0]

  const [rec, setRec] = useState<{ events: any[]; viewportW: number | null; viewportH: number | null } | null>(null)
  const [recErr, setRecErr] = useState<string | null>(null)
  const detail = useData<any>('session', { id: cur?.sessionId }, { filters: false, skip: !cur })
  useEffect(() => {
    if (!cur) return
    let dead = false
    setRec(null); setRecErr(null)
    fetch(`/api/projects/${projectId}/analytics/recording?session=${encodeURIComponent(cur.sessionId)}`, { cache: 'no-store' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (dead) return; if (!ok) throw new Error(j.error || 'Gravação não encontrada'); setRec({ events: j.events, viewportW: j.viewportW, viewportH: j.viewportH }) })
      .catch(e => !dead && setRecErr(e.message))
    return () => { dead = true }
  }, [cur?.sessionId, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !data) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <div style={{ display: 'grid', gap: 14 }}><Head title="Gravações" /><Skel h={420} /></div>
  return (
    <div>
      <Head title="Gravações de sessão" sub="Reveja a visita como se estivesse olhando por cima do ombro: o mouse, os cliques, a rolagem. O que a pessoa digita em campos fica oculto."
        right={<>
          <Seg value={only} onChange={setOnly} options={[{ value: 'all', label: 'Todas' }, { value: 'conv', label: 'Converteram' }, { value: 'friction', label: 'Com atrito' }]} />
          <Seg value={sort} onChange={setSort} options={[{ value: 'recent', label: 'Recentes' }, { value: 'frustrated', label: 'Frustradas primeiro' }]} />
        </>} />
      {rows.length === 0 ? (
        <Card><Empty icon={<Video size={26} strokeWidth={1.5} />} title="Nenhuma gravação neste período" text="As gravações começam a aparecer quando as pessoas visitam a página publicada. Dá para ajustar quantas visitas gravar em Ajustes." /></Card>
      ) : (
        <div className={`an-rec ${loading ? 'an-busy' : ''}`}>
          <div className="an-rec-list">
            {rows.map(r => (
              <button key={r.id} className="an-rec-item" data-on={r.sessionId === cur?.sessionId} onClick={() => setParam('session', r.sessionId)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b style={{ fontSize: 12.5 }}>{SOURCE_LABEL(r.source || 'direct')}{r.utmCampaign ? ` · ${r.utmCampaign}` : ''}</b>
                  <span className="an-dim" style={{ fontSize: 11.5 }}>{clock(r.durationMs / 1000)}</span>
                </div>
                <div className="an-dim" style={{ fontSize: 11.5 }}>{DEVICE_LABEL[r.device || ''] || r.device} · {r.browser} · {flag(r.country)} {r.country ? countryName(r.country) : ''} · {when(r.startedAt)}</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {r.converted && <Pill tone="good"><CheckCircle2 size={11} /> converteu</Pill>}
                  {r.rageCount > 0 && <Pill tone="bad"><Zap size={11} /> {r.rageCount}</Pill>}
                  {r.deadCount > 0 && <Pill tone="warn">sem resposta {r.deadCount}</Pill>}
                  <Pill><MousePointerClick size={11} /> {r.clickCount}</Pill><Pill>{r.pageCount} pág.</Pill>
                </div>
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
            {recErr ? <Card><Empty title="Gravação indisponível" text={recErr} /></Card> : !rec ? <Skel h={460} /> : <ReplayPlayer events={rec.events} viewportW={rec.viewportW} viewportH={rec.viewportH} />}
            {detail.data && (
              <Card title="O que aconteceu" sub="A jornada desta visita, na ordem">
                <div className="an-tl" style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {detail.data.timeline.slice(0, 80).map((t: any, i: number) => (
                    <div className="an-tl-i" key={i}>
                      <div className="t">{new Date(t.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                      <div className="d"><i className={`k-${t.kind}`} style={{ width: 10, height: 10, marginTop: 6 }} /></div>
                      <div className="x">{t.label}{t.detail && <small>{t.detail}</small>}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
