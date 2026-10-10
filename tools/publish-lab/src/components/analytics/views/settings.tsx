'use client'
import { useEffect, useState } from 'react'
import { Check, Plus, Radio, Trash2 } from 'lucide-react'
import { postJson, useAn, useData } from '../state'
import { Card, ErrorBox, Head, Skel } from '../ui'

interface Goal { id: string; name: string; type: 'lead' | 'checkout' | 'page' | 'click' | 'video' | 'outbound'; value?: string; conversion: boolean }
interface Settings { goals: Goal[]; recording: { on: boolean; sample: number; maxPerDay: number } }

const TYPES: { v: Goal['type']; l: string; hint: string; ph?: string }[] = [
  { v: 'lead', l: 'Lead capturado', hint: 'Alguém envia um formulário' },
  { v: 'checkout', l: 'Foi para o checkout', hint: 'Clicou num link de pagamento (Hotmart, Kiwify, Eduzz, Stripe...)' },
  { v: 'page', l: 'Chegou numa página', hint: 'Abriu uma página do funil', ph: 'obrigado' },
  { v: 'click', l: 'Clicou num botão', hint: 'Texto ou endereço do que foi clicado contém...', ph: 'Quero comprar' },
  { v: 'video', l: 'Assistiu ao vídeo', hint: '% mínimo do vídeo', ph: '75' },
  { v: 'outbound', l: 'Saiu para um link', hint: 'O endereço do link contém...', ph: 'wa.me' },
]

export function Settings({ published, slug }: { published: boolean; slug: string | null }) {
  const { projectId } = useAn()
  const { data, error, reload } = useData<{ settings: Settings }>('settings', undefined, { filters: false })
  const [s, setS] = useState<Settings | null>(null)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  useEffect(() => { if (data) setS(data.settings) }, [data])
  const last = useData<{ totals: { sessions: number; jsSessions: number } }>('overview', { period: '7d' }, { filters: false })
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />
  if (!s) return <div style={{ display: 'grid', gap: 14 }}><Head title="Ajustes" /><Skel h={300} /></div>
  const set = (p: Partial<Settings>) => { setS({ ...s, ...p }); setSaved('idle') }
  const save = async () => {
    setSaved('saving')
    const r = await postJson(projectId, 'settings', s)
    setSaved(r.ok ? 'ok' : 'err')
    if (r.ok) reload()
  }
  const setGoal = (i: number, p: Partial<Goal>) => set({ goals: s.goals.map((g, k) => (k === i ? { ...g, ...p } : g)) })
  return (
    <div style={{ maxWidth: 860 }}>
      <Head title="Ajustes" sub="O que conta como conversão e quanto gravar. As mudanças valem para as próximas visitas e para os números calculados daqui para frente." right={
        <button className="ed-btn ed-btn-primary" onClick={save} disabled={saved === 'saving'}>{saved === 'ok' ? <><Check size={14} /> Salvo</> : 'Salvar ajustes'}</button>} />
      {saved === 'err' && <div className="an-err" style={{ marginBottom: 12 }}>Não consegui salvar. Confira os campos.</div>}

      <Card title="Rastreamento" sub="Já está ligado em todas as páginas publicadas por aqui, sem colar código nenhum">
        <div className="an-switch-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Radio size={16} color={last.data && last.data.totals.sessions > 0 ? 'var(--ed-ok)' : 'var(--ed-text-3)'} /><div><b>{last.data && last.data.totals.sessions > 0 ? 'Recebendo visitas' : 'Aguardando as primeiras visitas'}</b><p>{published && slug ? `Endereço público: /s/${slug}` : 'Publique o site para começar a medir (visitas na prévia do editor não entram).'}</p></div></div>
          <span className="an-dim" style={{ textAlign: 'right' }}>{last.data ? <>{last.data.totals.sessions} visitas nos últimos 7 dias<br />{last.data.totals.jsSessions} com comportamento completo</> : ''}</span>
        </div>
        <p className="an-dim" style={{ fontSize: 12, margin: '10px 0 0' }}>Toda entrada na página publicada é registrada pelo próprio servidor (origem, aparelho, país), mesmo que o navegador da pessoa bloqueie rastreadores; o que ela faz dentro (cliques, rolagem, vídeo) vem do navegador. Suas visitas à página publicada também contam, então dá para testar. O link de edição e a prévia nunca contam. Robôs conhecidos ficam de fora. O endereço de IP nunca é guardado: ele só serve para descobrir o país e depois é descartado.</p>
      </Card>

      <div style={{ height: 14 }} />
      <Card title="O que é uma conversão" sub="A visita conta como convertida quando atinge qualquer um dos objetivos marcados como conversão">
        <div style={{ display: 'grid', gap: 10 }}>
          {s.goals.map((g, i) => {
            const t = TYPES.find(x => x.v === g.type)!
            return (
              <div key={g.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr) auto 30px', gap: 8, alignItems: 'center' }}>
                <input className="ed-input" value={g.name} onChange={e => setGoal(i, { name: e.target.value })} aria-label="Nome do objetivo" />
                <select className="ed-select" value={g.type} onChange={e => setGoal(i, { type: e.target.value as Goal['type'], value: '' })}>{TYPES.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}</select>
                {g.type === 'lead' || g.type === 'checkout' ? <span className="an-dim" style={{ fontSize: 11.5 }}>{t.hint}</span> : <input className="ed-input" placeholder={t.ph} value={g.value || ''} onChange={e => setGoal(i, { value: e.target.value })} title={t.hint} />}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap' }}><button className="ed-switch" data-on={g.conversion} onClick={() => setGoal(i, { conversion: !g.conversion })} aria-label="Conta como conversão" /> conversão</label>
                <button className="ed-ibtn ed-ibtn-sm" onClick={() => set({ goals: s.goals.filter((_, k) => k !== i) })} title="Remover"><Trash2 size={14} /></button>
              </div>
            )
          })}
          <div><button className="ed-btn ed-btn-sm" onClick={() => set({ goals: [...s.goals, { id: `g${Date.now().toString(36)}`, name: 'Novo objetivo', type: 'page', value: '', conversion: true }] })}><Plus size={13} /> Adicionar objetivo</button></div>
        </div>
      </Card>

      <div style={{ height: 14 }} />
      <Card title="Gravações de sessão" sub="Reveja visitas como um filme. Letras digitadas em campos nunca são gravadas">
        <div className="an-switch-row">
          <div><b>Gravar visitas</b><p>Desligue se não quiser gravar ninguém</p></div>
          <button className="ed-switch" data-on={s.recording.on} onClick={() => set({ recording: { ...s.recording, on: !s.recording.on } })} aria-label="Gravar visitas" />
        </div>
        <div className="an-switch-row" style={{ opacity: s.recording.on ? 1 : 0.45 }}>
          <div style={{ flex: 1 }}><b>Quantas visitas gravar</b><p>{Math.round(s.recording.sample * 100)}% das visitas</p></div>
          <input className="ed-range" type="range" min={0} max={100} step={5} style={{ width: 220 }} disabled={!s.recording.on} value={Math.round(s.recording.sample * 100)} onChange={e => set({ recording: { ...s.recording, sample: Number(e.target.value) / 100 } })} />
        </div>
        <div className="an-switch-row" style={{ opacity: s.recording.on ? 1 : 0.45 }}>
          <div style={{ flex: 1 }}><b>Limite por dia</b><p>Para o banco não crescer sem controle quando o tráfego sobe</p></div>
          <div className="ed-num" style={{ width: 110 }}><input className="ed-input" type="number" min={0} max={5000} disabled={!s.recording.on} value={s.recording.maxPerDay} onChange={e => set({ recording: { ...s.recording, maxPerDay: Number(e.target.value) || 0 } })} /><span>/dia</span></div>
        </div>
      </Card>
    </div>
  )
}
