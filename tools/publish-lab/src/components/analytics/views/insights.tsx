'use client'
import { useState } from 'react'
import { AlertTriangle, FlaskConical, Lightbulb, Loader2, Sparkles, ThumbsUp, TrendingUp, Wand2 } from 'lucide-react'
import { postJson, useAn, useData } from '../state'
import { Card, Empty, ErrorBox, Head, Pill, Skel } from '../ui'

interface Insight { id: string; kind: 'resumo' | 'problema' | 'oportunidade' | 'sugestao' | 'teste'; severity: 'alta' | 'media' | 'baixa'; title: string; text: string; evidence: string[]; page?: string }
interface Ai { summary: string; priorities: { title: string; why: string; action: string }[]; tests: { idea: string; why: string }[]; working: string[]; provider: string; model: string }

const KIND = {
  resumo: { label: 'Resumo', icon: <TrendingUp size={16} /> },
  problema: { label: 'Problema', icon: <AlertTriangle size={16} /> },
  oportunidade: { label: 'Oportunidade', icon: <ThumbsUp size={16} /> },
  sugestao: { label: 'Sugestão', icon: <Lightbulb size={16} /> },
  teste: { label: 'Teste', icon: <FlaskConical size={16} /> },
} as const

export function Insights() {
  const { projectId, qs, setView, setParam } = useAn()
  const { data, error, reload, loading } = useData<{ insights: Insight[] }>('insights')
  const [ai, setAi] = useState<Ai | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiErr, setAiErr] = useState<string | null>(null)

  const run = async () => {
    setAiBusy(true); setAiErr(null)
    const r = await postJson<any>(projectId, 'ai', {}, qs)
    setAiBusy(false)
    if (r.ok) setAi(r.data.report); else setAiErr(r.data.error || 'Não consegui analisar agora.')
  }
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <div style={{ display: 'grid', gap: 14 }}><Head title="Inteligência" /><Skel h={420} /></div>
  const list = data.insights
  const summary = list.find(i => i.kind === 'resumo')
  const rest = list.filter(i => i.kind !== 'resumo')
  const goPage = (slug?: string) => { if (slug) setView('maps', { page: slug }) }
  return (
    <div className={loading ? 'an-busy' : ''}>
      <Head title="Inteligência" sub="O que os números estão dizendo, em português. Tudo aqui é calculado das visitas reais do período; nenhum número é inventado." right={
        <button className="ed-btn ed-btn-primary" onClick={run} disabled={aiBusy}>{aiBusy ? <Loader2 size={14} className="ed-spin" /> : <Wand2 size={14} />} Analisar com IA</button>} />

      {(ai || aiBusy || aiErr) && (
        <div className="an-ai an-fade" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><Sparkles size={16} color="var(--ed-ai-b)" /><b>Análise da IA</b>{ai && <span className="an-dim" style={{ fontSize: 11 }}>com base só nos números do período</span>}</div>
          {aiBusy && <div style={{ display: 'grid', gap: 10 }}><div className="an-skel" style={{ height: 18, width: '90%' }} /><div className="an-skel" style={{ height: 18, width: '75%' }} /><div className="an-skel" style={{ height: 80 }} /></div>}
          {aiErr && <div className="an-err">{aiErr}</div>}
          {ai && (
            <>
              <p className="an-ai-sum">{ai.summary}</p>
              <div className="an-grid c3" style={{ marginBottom: 0 }}>
                <div>
                  <div className="ed-section-title" style={{ marginBottom: 8 }}>O que fazer primeiro</div>
                  <div style={{ display: 'grid', gap: 10 }}>{ai.priorities.map((p, i) => (
                    <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--ed-panel-2)', border: '1px solid var(--ed-line)' }}>
                      <div style={{ fontWeight: 650, marginBottom: 3 }}>{i + 1}. {p.title}</div>
                      <div className="an-dim" style={{ fontSize: 12 }}>{p.why}</div>
                      <div style={{ fontSize: 12.5, marginTop: 5 }}><b>Como:</b> {p.action}</div>
                    </div>
                  ))}</div>
                </div>
                <div>
                  <div className="ed-section-title" style={{ marginBottom: 8 }}>Vale testar</div>
                  <div style={{ display: 'grid', gap: 10 }}>{ai.tests.map((t, i) => (
                    <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--ed-panel-2)', border: '1px solid var(--ed-line)' }}>
                      <div style={{ fontWeight: 650, marginBottom: 3 }}>{t.idea}</div><div className="an-dim" style={{ fontSize: 12 }}>{t.why}</div>
                    </div>
                  ))}{ai.tests.length > 0 && <button className="ed-btn ed-btn-sm" onClick={() => setView('tests')}><FlaskConical size={13} /> Criar um teste A/B</button>}</div>
                </div>
                <div>
                  <div className="ed-section-title" style={{ marginBottom: 8 }}>O que está funcionando</div>
                  <div style={{ display: 'grid', gap: 8 }}>{ai.working.map((w, i) => <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(47,165,106,.08)', border: '1px solid rgba(47,165,106,.25)', fontSize: 12.5 }}>{w}</div>)}{ai.working.length === 0 && <span className="an-dim">Ainda sem pontos fortes claros.</span>}</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {summary && (
        <Card style={{ marginBottom: 14 }}>
          <div className="an-ins" style={{ padding: 0, border: 0 }}>
            <div className="an-ins-ico">{KIND.resumo.icon}</div>
            <div><h4>{summary.title}</h4><p>{summary.text}</p>{summary.evidence.length > 0 && <ul>{summary.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>}</div>
          </div>
        </Card>
      )}
      <Card title="Achados" sub={`${rest.length} ${rest.length === 1 ? 'ponto' : 'pontos'} neste período, dos mais importantes para os menos`}>
        {rest.length === 0 ? <Empty icon={<Lightbulb size={24} />} title="Nada que chame atenção" text="Quando houver um problema ou uma oportunidade clara nos dados, ela aparece aqui com os números que a provam." /> : rest.map(i => (
          <div className="an-ins" key={i.id}>
            <div className={`an-ins-ico ${i.kind}`}>{KIND[i.kind].icon}</div>
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                <Pill tone={i.kind === 'problema' ? 'bad' : i.kind === 'oportunidade' ? 'good' : i.kind === 'teste' ? 'blue' : undefined}>{KIND[i.kind].label}</Pill>
                {i.severity === 'alta' && <Pill tone="warn">alta prioridade</Pill>}
              </div>
              <h4>{i.title}</h4><p>{i.text}</p>
              {i.evidence.length > 0 && <ul>{i.evidence.map((e, k) => <li key={k}>{e}</li>)}</ul>}
              {i.page && <button className="ed-btn ed-btn-ghost ed-btn-sm" style={{ marginTop: 6, paddingLeft: 0 }} onClick={() => goPage(i.page)}>Ver “{i.page}” no mapa de calor →</button>}
            </div>
          </div>
        ))}
      </Card>
      <p className="an-dim" style={{ fontSize: 11.5, marginTop: 12 }}>Com poucas visitas os percentuais oscilam bastante. {aiErr ? '' : 'A análise da IA usa a chave configurada no sistema.'}</p>
    </div>
  )
}
