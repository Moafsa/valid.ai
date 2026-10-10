'use client'
import { useState } from 'react'
import { Check, FlaskConical, Pause, Play, Plus, Trash2, Trophy, X } from 'lucide-react'
import { postJson, useAn, useData } from '../state'
import { Card, Empty, ErrorBox, Head, Pill, Skel } from '../ui'
import { dur, nf, pf } from '../format'

interface VR { id: string; name: string; slug: string; weight: number; sessions: number; visitors: number; conversions: number; conversionRate: number; bounceRate: number; avgActiveSec: number; avgScroll: number; clicksPerSession: number; ctaRate: number; videoPlayRate: number; videoAvgPct: number; abandonRate: number; confidence: number | null; lift: number | null }
interface Exp { id: string; name: string; kind: string; status: 'running' | 'paused' | 'done'; goal: string; startedAt: string; endedAt: string | null; winner: string | null; results: { variants: VR[]; total: number; enough: boolean; leader: string | null } | null }
interface Data { experiments: Exp[]; pages: { slug: string; name: string }[]; published: boolean }

const KINDS = [{ v: 'page', l: 'Página inteira' }, { v: 'headline', l: 'Título' }, { v: 'image', l: 'Imagem' }, { v: 'video', l: 'Vídeo' }, { v: 'cta', l: 'Botão (CTA)' }, { v: 'other', l: 'Outro' }]

export function Tests() {
  const { projectId } = useAn()
  const { data, error, reload } = useData<Data>('experiments', undefined, { filters: false })
  const [creating, setCreating] = useState(false)
  const act = async (body: any) => { const r = await postJson(projectId, 'experiments', body); if (!r.ok) alert(r.data.error || 'Não deu certo.'); reload() }
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <div style={{ display: 'grid', gap: 14 }}><Head title="Testes A/B" /><Skel h={300} /></div>
  return (
    <div>
      <Head title="Testes A/B" sub="Compare duas ou mais versões da mesma página (títulos, imagens, vídeos, botões). Quem acessa o endereço da página original recebe uma das versões, sempre a mesma ao voltar, e o sistema mostra qual converte mais."
        right={<button className="ed-btn ed-btn-primary" onClick={() => setCreating(true)} disabled={data.pages.length < 2}><Plus size={14} /> Novo teste</button>} />
      {data.pages.length < 2 && <Card style={{ marginBottom: 14 }}><Empty title="Faça uma cópia da página primeiro" text="Um teste compara páginas diferentes do mesmo projeto. Duplique a página no editor, mude o que quer testar (título, imagem, vídeo, botão) e volte aqui." /></Card>}
      {!data.published && <div className="an-err" style={{ marginBottom: 14, background: 'rgba(229,146,10,.1)', borderColor: 'rgba(229,146,10,.3)', color: 'var(--an-warn)' }}>O teste só recebe visitas depois de publicar o site (botão Publicar no editor).</div>}
      {creating && <NewTest pages={data.pages} onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload() }} />}
      {data.experiments.length === 0 && !creating && data.pages.length >= 2 && <Card><Empty icon={<FlaskConical size={26} strokeWidth={1.5} />} title="Nenhum teste ainda" text="Crie o primeiro: escolha a página original e a versão alternativa." /></Card>}
      <div style={{ display: 'grid', gap: 14 }}>
        {data.experiments.map(e => <ExpCard key={e.id} e={e} act={act} />)}
      </div>
    </div>
  )
}

function ExpCard({ e, act }: { e: Exp; act: (b: any) => void }) {
  const r = e.results
  const best = r?.leader
  const sure = r?.variants.find(v => v.confidence !== null && v.confidence >= 95)
  const metrics: { label: string; get: (v: VR) => string; better?: 'high' | 'low'; raw: (v: VR) => number }[] = [
    { label: 'Visitas', get: v => nf(v.sessions), raw: v => v.sessions },
    { label: 'Conversões', get: v => nf(v.conversions), raw: v => v.conversions, better: 'high' },
    { label: 'Taxa de conversão', get: v => pf(v.conversionRate), raw: v => v.conversionRate, better: 'high' },
    { label: 'Clique no botão', get: v => pf(v.ctaRate), raw: v => v.ctaRate, better: 'high' },
    { label: 'Retenção do vídeo (média)', get: v => (v.videoPlayRate ? pf(v.videoAvgPct, 0) : '—'), raw: v => v.videoAvgPct, better: 'high' },
    { label: 'Tempo ativo', get: v => dur(v.avgActiveSec), raw: v => v.avgActiveSec, better: 'high' },
    { label: 'Rolagem', get: v => pf(v.avgScroll, 0), raw: v => v.avgScroll, better: 'high' },
    { label: 'Saem sem interagir', get: v => pf(v.bounceRate), raw: v => v.bounceRate, better: 'low' },
    { label: 'Abandono', get: v => pf(v.abandonRate), raw: v => v.abandonRate, better: 'low' },
  ]
  return (
    <Card title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{e.name} <Pill tone={e.status === 'running' ? 'good' : e.status === 'done' ? 'blue' : 'warn'}>{e.status === 'running' ? 'Rodando' : e.status === 'done' ? 'Encerrado' : 'Pausado'}</Pill></span>}
      sub={`${KINDS.find(k => k.v === e.kind)?.l || 'Teste'} · desde ${new Date(e.startedAt).toLocaleDateString('pt-BR')} · ${nf(r?.total || 0)} visitas`}
      right={<>
        {e.status === 'running' && <button className="ed-btn ed-btn-sm" onClick={() => act({ action: 'pause', id: e.id })}><Pause size={13} /> Pausar</button>}
        {e.status === 'paused' && <button className="ed-btn ed-btn-sm" onClick={() => act({ action: 'resume', id: e.id })}><Play size={13} /> Retomar</button>}
        {e.status !== 'done' && best && <button className="ed-btn ed-btn-sm ed-btn-primary" onClick={() => confirm('Encerrar o teste e mostrar a versão líder para todo mundo?') && act({ action: 'finish', id: e.id, winner: best })}><Trophy size={13} /> Encerrar com a líder</button>}
        <button className="ed-ibtn" title="Excluir" onClick={() => confirm('Excluir este teste? Os dados das visitas continuam guardados.') && act({ action: 'delete', id: e.id })}><Trash2 size={15} /></button>
      </>}>
      {sure && e.status === 'running' && <div className="an-ins-ico sugestao" style={{ width: 'auto', height: 'auto', padding: '9px 12px', marginBottom: 12, justifyContent: 'flex-start', gap: 8, fontSize: 12.5, display: 'flex' }}><Trophy size={15} /> {sure.name} está ganhando com {pf(sure.confidence || 0, 0)} de confiança{sure.lift !== null ? ` (${sure.lift >= 0 ? '+' : ''}${pf(sure.lift)} de conversão sobre a original)` : ''}.</div>}
      {r && !r.enough && e.status === 'running' && <div className="an-dim" style={{ marginBottom: 10, fontSize: 12 }}>Ainda poucas visitas: cada versão precisa de pelo menos 100 para dar para confiar no resultado.</div>}
      {e.status === 'done' && e.winner && <div style={{ marginBottom: 12 }}><Pill tone="good"><Check size={12} /> Versão vencedora: {r?.variants.find(v => v.id === e.winner)?.name}</Pill></div>}
      {!r || r.variants.length === 0 ? <Empty title="Sem dados ainda" /> : (
        <div className="an-scroll-x">
          <table className="an-table">
            <thead><tr><th>Versão</th>{r.variants.map(v => <th key={v.id}>{v.name}{v.id === e.winner || (e.status !== 'done' && v.id === best && r.total > 0) ? ' 🏆' : ''}<div style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{v.slug} · {v.weight}%</div></th>)}</tr></thead>
            <tbody>
              {metrics.map(m => {
                const vals = r.variants.map(v => m.raw(v))
                const win = m.better ? (m.better === 'high' ? Math.max(...vals) : Math.min(...vals)) : null
                return (
                  <tr key={m.label}>
                    <td className="name">{m.label}</td>
                    {r.variants.map(v => <td key={v.id} className={m.better && win !== null && m.raw(v) === win && vals.filter(x => x === win).length === 1 && v.sessions > 0 ? 'an-good' : ''}><b>{m.get(v)}</b></td>)}
                  </tr>
                )
              })}
              <tr><td className="name">Confiança de ser melhor que a original</td>{r.variants.map((v, i) => <td key={v.id}>{i === 0 ? <span className="an-dim">original</span> : v.confidence === null ? <span className="an-dim">poucos dados</span> : <b className={v.confidence >= 95 ? 'an-good' : v.confidence <= 5 ? 'an-bad' : ''}>{pf(v.confidence, 0)}{v.lift !== null && <span className="an-dim"> ({v.lift >= 0 ? '+' : ''}{pf(v.lift, 0)})</span>}</b>}</td>)}</tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function NewTest({ pages, onClose, onDone }: { pages: { slug: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const { projectId } = useAn()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('headline')
  const [vs, setVs] = useState<{ name: string; slug: string; weight: number }[]>([
    { name: 'Original', slug: pages[0]?.slug || '', weight: 50 },
    { name: 'Versão B', slug: pages[1]?.slug || '', weight: 50 },
  ])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    setBusy(true); setErr(null)
    const r = await postJson(projectId, 'experiments', { action: 'create', name: name.trim() || 'Novo teste', kind, goal: 'lead', variants: vs })
    setBusy(false)
    if (r.ok) onDone(); else setErr(r.data.error || 'Não consegui criar o teste.')
  }
  return (
    <Card title="Novo teste A/B" sub="A primeira versão é a original (o endereço que as pessoas já usam). As outras são páginas do projeto" right={<button className="ed-ibtn" onClick={onClose}><X size={16} /></button>} style={{ marginBottom: 14 }}>
      <div className="an-form">
        <div className="an-twocol">
          <div className="an-field"><label>Nome do teste</label><input className="ed-input" placeholder="Ex.: título novo na página de vendas" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="an-field"><label>O que está testando</label><select className="ed-select" value={kind} onChange={e => setKind(e.target.value)}>{KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}</select></div>
        </div>
        <div>
          <label className="ed-label">Versões</label>
          <div style={{ display: 'grid', gap: 8 }}>
            {vs.map((v, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr) 90px 30px', gap: 8, alignItems: 'center' }}>
                <input className="ed-input" value={v.name} onChange={e => setVs(vs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                <select className="ed-select" value={v.slug} onChange={e => setVs(vs.map((x, k) => (k === i ? { ...x, slug: e.target.value } : x)))}>{pages.map(p => <option key={p.slug} value={p.slug}>{p.name} ({p.slug})</option>)}</select>
                <div className="ed-num"><input className="ed-input" type="number" min={1} max={100} value={v.weight} onChange={e => setVs(vs.map((x, k) => (k === i ? { ...x, weight: Number(e.target.value) || 1 } : x)))} /><span>%</span></div>
                <button className="ed-ibtn ed-ibtn-sm" disabled={vs.length <= 2} onClick={() => setVs(vs.filter((_, k) => k !== i))} title="Remover"><X size={14} /></button>
              </div>
            ))}
          </div>
          {vs.length < 4 && <button className="ed-btn ed-btn-sm" style={{ marginTop: 8 }} onClick={() => setVs([...vs, { name: `Versão ${String.fromCharCode(65 + vs.length)}`, slug: pages[vs.length]?.slug || pages[0].slug, weight: 50 }])}><Plus size={13} /> Adicionar versão</button>}
        </div>
        {err && <div className="an-err">{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="ed-btn" onClick={onClose}>Cancelar</button><button className="ed-btn ed-btn-primary" onClick={save} disabled={busy}>Começar o teste</button></div>
      </div>
    </Card>
  )
}
