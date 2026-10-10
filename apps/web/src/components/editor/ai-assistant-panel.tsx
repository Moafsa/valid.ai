'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from 'grapesjs'
import {
  ArrowUp, Check, Image as ImageIcon, MessageSquareQuote, Maximize2, Minimize2, Minus, MousePointerClick, Moon, Palette, Trash2, Type, Wand2, X,
} from 'lucide-react'
import { IconBtn, Seg, Sparkle } from './editor-ui'
import {
  applyOperations, describePage, flash, interpretLocally, redoBatch, reveal, undoBatch,
  type Change, type EngineCtx,
} from '@/lib/visual-editor/ai-engine'
import type { Operation } from '@/lib/visual-editor/ai-types'
import { AgentModelError, compactRun, fetchAgentTurn, runAgent, type StepView } from '@/lib/visual-editor/agent-session'
import type { AgentMsg } from '@/lib/visual-editor/agent-tools'

interface Msg {
  id: number
  role: 'user' | 'assistant'
  text: string
  image?: string
  changes?: Change[]
  undoSteps?: number
  applied?: boolean
  source?: 'ai' | 'local'
  error?: boolean
  /** operations that had nothing to aim at, or that ran without showing any change */
  missed?: number
  /** the agent checked the page after its last change and found nothing wrong */
  verified?: boolean
  openIssues?: number
  /** the task stopped before it was finished (limit, error, stop): offer to pick it up */
  resumable?: boolean
}

type Sug = { icon: React.ReactNode; title: string; hint: string; ask: string }
const PAGE_SUGS: Sug[] = [
  { icon: <Wand2 size={15} />, title: 'Deixar premium', hint: 'Visual elegante, respirado e forte', ask: 'Deixe a página mais premium' },
  { icon: <Moon size={15} />, title: 'Fundo escuro', hint: 'Tema escuro com texto claro', ask: 'Troque o fundo da página para preto e ajuste as cores' },
  { icon: <Palette size={15} />, title: 'Mudar a cor de destaque', hint: 'Botões e links em outra cor', ask: 'Troque a cor de destaque dos botões e links para azul' },
  { icon: <MousePointerClick size={15} />, title: 'Botões maiores', hint: 'Mais chamativos e arredondados', ask: 'Deixe todos os botões maiores e arredondados' },
  { icon: <MessageSquareQuote size={15} />, title: 'Adicionar depoimentos', hint: 'Nova seção de prova social', ask: 'Adicione uma seção de depoimentos' },
  { icon: <ImageIcon size={15} />, title: 'Seguir uma referência', hint: 'Anexe uma imagem e eu aproximo', ask: 'Deixe a página mais parecida com a referência (anexe uma imagem)' },
]
const SELECTION_SUGS: Sug[] = [
  { icon: <Wand2 size={15} />, title: 'Deixar mais moderno', hint: 'Só este elemento', ask: 'Deixe esse elemento mais moderno' },
  { icon: <Palette size={15} />, title: 'Mudar a cor', hint: 'Troco para azul', ask: 'Troque a cor dele para azul' },
  { icon: <Type size={15} />, title: 'Aumentar o texto', hint: 'Tamanho e peso', ask: 'Aumente o tamanho do texto' },
  { icon: <Trash2 size={15} />, title: 'Remover', hint: 'Tira da página', ask: 'Remova esse elemento' },
]

async function downscale(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = url })
    const max = 1100
    const k = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.82)
  } finally { URL.revokeObjectURL(url) }
}

export function AiAssistantPanel({
  editor, ctx, getSelected, selectedLabel, onClose, onSeed,
}: {
  editor: Editor
  ctx: EngineCtx
  getSelected: () => any
  selectedLabel: string | null
  onClose: () => void
  /** let the parent pre-fill the composer (e.g. "ask AI about this element") */
  onSeed?: (set: (text: string) => void) => void
}) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [full, setFull] = useState(false)
  const [ref, setRef] = useState<string | null>(null)
  const [scope, setScope] = useState<'page' | 'selection'>('page')
  const [credits, setCredits] = useState<{ used: number; limit: number | null; plan: string } | null>(null)
  const [steps, setSteps] = useState<StepView[]>([])
  const abortRef = useRef<AbortController | null>(null)
  /** what this conversation remembers (earlier requests and what was done), without the heavy tool traffic */
  const convoRef = useRef<AgentMsg[]>([])
  const idRef = useRef(1)
  const feedRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const loadCredits = useCallback(() => { fetch('/api/ai/credits').then(r => (r.ok ? r.json() : null)).then(d => d && setCredits(d)).catch(() => {}) }, [])
  useEffect(() => { loadCredits() }, [loadCredits])
  useEffect(() => { onSeed?.(t => { setDraft(t); setTimeout(() => taRef.current?.focus(), 30) }) }, [onSeed])
  useEffect(() => { setTimeout(() => taRef.current?.focus(), 250) }, [])
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy, steps])
  useEffect(() => {
    if (!taRef.current) return
    taRef.current.style.height = '0px'
    taRef.current.style.height = Math.min(140, taRef.current.scrollHeight) + 'px'
  }, [draft])

  const hasSel = !!selectedLabel
  // picking something on the page makes it the target; deselecting goes back to the whole page
  useEffect(() => { setScope(selectedLabel ? 'selection' : 'page') }, [selectedLabel])
  const useSel = hasSel && scope === 'selection'
  const suggestions = useSel ? SELECTION_SUGS : PAGE_SUGS

  const send = useCallback(async (textIn?: string) => {
    const instruction = (textIn ?? draft).trim()
    if (!instruction || busy) return
    const image = ref
    setDraft(''); setRef(null); setBusy(true); setSteps([])
    const userMsg: Msg = { id: idRef.current++, role: 'user', text: instruction, image: image || undefined }
    setMsgs(m => [...m, userMsg])
    const selected = useSel ? getSelected() : null
    const ac = new AbortController()
    abortRef.current = ac
    const say = (m: Omit<Msg, 'id' | 'role'>) => setMsgs(list => [...list, { id: idRef.current++, role: 'assistant', ...m }])
    try {
      // 1) the agent: it looks at the page, changes it with tools, checks the result and fixes what is wrong
      let local = false
      try {
        const r = await runAgent({
          ctx, selected, instruction, image, history: convoRef.current, signal: ac.signal, onSteps: setSteps,
          callModel: async (messages, signal) => { const t = await fetchAgentTurn(messages, selected ? 'selection' : 'page', signal); if (t.credits) setCredits(t.credits); return t },
        })
        convoRef.current = [...convoRef.current, ...compactRun(instruction, r)].slice(-12)
        const changes: Change[] = r.changes.map(c => ({ label: c.label, detail: c.detail, comps: c.comps, swatch: c.swatch }))
        const changed = changes.flatMap(c => c.comps).filter(Boolean)
        const notes: Record<string, string> = {
          iteration_limit: 'Cheguei ao limite de passos desta tarefa. Veja o que já foi feito e peça para eu continuar.',
          time_limit: 'A tarefa demorou mais que o limite de tempo. Veja o que já foi feito e peça para eu continuar.',
          tool_limit: 'Cheguei ao limite de ações desta tarefa. Veja o que já foi feito e peça para eu continuar.',
          aborted: 'Parei como você pediu. O que já foi feito está na lista abaixo, e dá para desfazer.',
        }
        let text = r.finalText
        if (r.ended !== 'done') text = [text, r.ended === 'error' ? (r.error || 'A IA não respondeu. Tente de novo.') : notes[r.ended]].filter(Boolean).join('\n\n')
        if (!text) text = changes.length ? 'Pronto.' : 'Não consegui fazer essa mudança. Pode explicar de outro jeito ou selecionar o elemento?'
        say({ text, error: r.ended === 'error' && !changes.length, changes: changes.length ? changes : undefined, undoSteps: r.undoSteps, applied: true, source: 'ai', verified: r.verified, openIssues: r.openIssues, resumable: r.ended !== 'done' })
        if (changed[0]) { reveal(editor, changed[0]); setTimeout(() => flash(editor, changed.slice(0, 60)), 450) }
        return
      } catch (e: any) {
        if (e instanceof AgentModelError && e.code === 'no_ai_key') local = true
        else {
          if (e instanceof AgentModelError && e.code === 'plan_limit') loadCredits()
          say({ text: e instanceof AgentModelError ? e.message : 'Não consegui aplicar isso agora. Tente de novo.', error: true })
          return
        }
      }

      // 2) no AI connected: the small built-in interpreter still handles the common requests
      if (local) {
        const { outline } = describePage(ctx, getSelected())
        const r = interpretLocally(instruction, { hasSelection: !!selected, sections: outline.sections.length })
        let reply = r.reply
        const ops: Operation[] = r.operations
        if (image && !r.understood) reply = 'Pra comparar com uma imagem de referência eu preciso da IA completa, que ainda não está conectada. ' + reply
        if (!ops.length) { say({ text: reply || 'Não encontrei o que mudar com esse pedido. Pode explicar de outro jeito?', source: 'local' }); return }
        const result = applyOperations(ctx, ops, selected)
        const changed = result.changes.flatMap(c => c.comps).filter(Boolean)
        if (!result.changes.length) { say({ text: 'Entendi o pedido, mas não achei onde aplicar nessa página. Tenta selecionar o elemento e pedir de novo?', source: 'local', error: true }); return }
        say({ text: reply || 'Pronto, apliquei as mudanças.', changes: result.changes, undoSteps: result.undoSteps, applied: true, source: 'local', missed: result.skipped + result.ineffective })
        if (changed[0]) { reveal(editor, changed[0]); setTimeout(() => flash(editor, changed.slice(0, 60)), 450) }
      }
    } catch (e: any) {
      console.error('[ai] failed', e)
      say({ text: 'Não consegui aplicar isso agora. Tente de novo.', error: true })
    } finally {
      abortRef.current = null
      setBusy(false)
      setSteps([])
    }
  }, [busy, ctx, draft, editor, getSelected, loadCredits, ref, useSel])

  const setApplied = (m: Msg, want: boolean) => {
    if (!m.undoSteps || !!m.applied === want) return
    if (m.applied) undoBatch(editor, m.undoSteps)
    else redoBatch(editor, m.undoSteps)
    setMsgs(list => list.map(x => (x.id === m.id ? { ...x, applied: want } : x)))
    if (want) setTimeout(() => flash(editor, (m.changes || []).flatMap(c => c.comps).filter(Boolean).slice(0, 60)), 200)
  }

  const pct = credits && credits.limit !== null ? Math.min(100, Math.round((credits.used / Math.max(1, credits.limit)) * 100)) : null

  return (
    <div className={`ed-ai-sheet${full ? ' full' : ''}`} role="dialog" aria-label="Assistente de IA">
      <div className="ed-ai-head">
        <div className="ed-ai-title">
          <span className="ed-ai-mark"><Sparkle size={17} /></span>
          <div style={{ minWidth: 0 }}>
            <b>Assistente</b>
            <small>Peça em português, eu altero a página</small>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <IconBtn small tip={full ? 'Recolher' : 'Expandir'} onClick={() => setFull(f => !f)}>{full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</IconBtn>
          <IconBtn small tip="Minimizar" onClick={onClose}><Minus size={15} /></IconBtn>
        </div>
      </div>

      {credits && credits.limit !== null && pct !== null && (
        <div className={`ed-ai-credits${pct >= 100 ? ' danger' : pct >= 80 ? ' warn' : ''}`} title={`Créditos de IA do plano ${credits.plan} neste mês. Mudar uma cor gasta cerca de 1; refazer a página inteira gasta vários.`}>
          <span>{Math.max(0, credits.limit - credits.used).toLocaleString('pt-BR')} créditos restantes</span>
          <div className="meter"><i style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      <div className="ed-ai-scope">
        {hasSel ? (
          <>
            <Seg value={scope} onChange={setScope} options={[{ value: 'selection', label: 'Só o selecionado' }, { value: 'page', label: 'Página toda' }]} />
            <span className="who" title={selectedLabel || ''}>{scope === 'selection' ? selectedLabel : 'Tudo'}</span>
          </>
        ) : (
          <><span>Vou mexer em:</span><b>a página inteira</b></>
        )}
      </div>

      <div className="ed-ai-feed" ref={feedRef}>
        {msgs.length === 0 && (
          <>
            <div className="ed-ai-hello">
              <span className="ed-ai-hello-orb"><Sparkle size={22} /></span>
              <h4>O que vamos mudar?</h4>
              <p>Descreva do seu jeito. Eu altero a página de verdade, mostro o que mudou e você desfaz com um clique.</p>
            </div>
            <div className="ed-ai-sugs">
              {suggestions.map(s => (
                <button key={s.title} className="ed-ai-sug" onClick={() => send(s.ask)}>
                  <span className="ic">{s.icon}</span>
                  <b>{s.title}</b>
                  <small>{s.hint}</small>
                </button>
              ))}
            </div>
          </>
        )}

        {msgs.map(m =>
          m.role === 'user' ? (
            <div key={m.id} className="ed-ai-you">
              {m.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.image} alt="" style={{ width: 120, borderRadius: 8, display: 'block', marginBottom: 6 }} />}
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="ed-ai-reply">
              <div className="ed-ai-reply-head">
                <span className="ed-ai-avatar"><Sparkle size={12} /></span>
                <p style={m.error ? { color: 'var(--ed-danger)' } : undefined}>{m.text}</p>
              </div>
              {m.changes && m.changes.length > 0 && (
                <div className="ed-ai-changes">
                  <div className="ed-ai-changes-head">
                    <span>{m.changes.length} {m.changes.length === 1 ? 'mudança' : 'mudanças'}</span>
                    {m.source === 'local' && <span className="ed-chip" title="Sem a IA completa conectada, entendo só pedidos comuns">modo básico</span>}
                    {m.undoSteps ? (
                      <Seg value={m.applied ? 'depois' : 'antes'} onChange={v => setApplied(m, v === 'depois')} options={[{ value: 'antes', label: 'Antes' }, { value: 'depois', label: 'Depois' }]} />
                    ) : null}
                  </div>
                  {m.changes.map((c, i) => (
                    <button key={i} className="ed-ai-change" style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }} onClick={() => c.comps[0] && m.applied && reveal(editor, c.comps[0])} title="Mostrar na página">
                      <i><Check size={11} /></i>
                      <span>
                        {c.swatch && <span className="ed-ai-swatch" style={{ background: c.swatch }} />}
                        {c.label}
                        {c.detail && <em>{c.detail}</em>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {m.resumable && (
                <div style={{ marginLeft: 33 }}>
                  <button className="ed-btn ed-btn-sm" disabled={busy} onClick={() => send('Continue de onde parou e confira o resultado no final.')}>Continuar de onde parou</button>
                </div>
              )}
              {m.verified && <span className="ed-hint ed-ai-verified" style={{ margin: 0 }}><Check size={12} /> Conferi a página depois das mudanças: sem problemas.</span>}
              {(m.openIssues || 0) > 0 && <span className="ed-hint" style={{ margin: 0, color: 'var(--ed-danger)' }}>{m.openIssues} {m.openIssues === 1 ? 'problema em aberto' : 'problemas em aberto'} na conferência final.</span>}
              {(m.missed || 0) > 0 && m.changes && <span className="ed-hint" style={{ margin: 0 }}>{m.missed} {m.missed === 1 ? 'ajuste não deu efeito' : 'ajustes não deram efeito'} nesta página</span>}
            </div>
          ),
        )}

        {busy && (
          <div className="ed-ai-think">
            {steps.length === 0 && <div className="step"><span className="ed-spin" style={{ width: 12, height: 12, border: '2px solid var(--ed-line-2)', borderTopColor: 'var(--ed-accent)', borderRadius: '50%', display: 'inline-block' }} /> Começando…</div>}
            {steps.slice(-9).map(st => (
              <div key={st.id} className={`step${st.status === 'ok' ? ' done' : ''}`}>
                {st.status === 'running' ? <span className="ed-spin" style={{ width: 12, height: 12, border: '2px solid var(--ed-line-2)', borderTopColor: 'var(--ed-accent)', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                  : st.status === 'ok' ? <Check size={13} /> : <X size={13} style={{ color: 'var(--ed-danger)' }} />}
                <span style={{ flex: 1, minWidth: 0 }}>{st.label}{st.detail ? <em style={{ fontStyle: 'normal', color: 'var(--ed-text-3)' }}> · {st.detail}</em> : null}</span>
              </div>
            ))}
            <div className="bar" style={{ width: '70%' }} />
            <button className="ed-btn ed-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => abortRef.current?.abort()}>Parar</button>
          </div>
        )}
      </div>

      <div className="ed-ai-composer">
        {ref && (
          <div className="ed-ai-ref">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ref} alt="" />
            <span style={{ flex: 1 }}>Referência anexada</span>
            <IconBtn small tip="Remover" onClick={() => setRef(null)}><X size={13} /></IconBtn>
          </div>
        )}
        <textarea
          ref={taRef}
          value={draft}
          rows={1}
          placeholder={useSel ? 'O que mudar nesse elemento?' : 'Ex: deixe essa página mais premium'}
          disabled={busy}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } if (e.key === 'Escape') onClose() }}
        />
        <div className="ed-ai-composer-bar">
          <label className="ed-ibtn ed-ibtn-sm" data-tip="Anexar imagem de referência" data-tip-side="top" style={{ cursor: 'pointer' }}>
            <ImageIcon size={15} />
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; if (f) setRef(await downscale(f).catch(() => null)); e.target.value = '' }} />
          </label>
          <span className="ed-ai-keys">Enter envia · Shift+Enter quebra a linha</span>
          <button className="ed-ai-send" disabled={busy || !draft.trim()} onClick={() => send()} aria-label="Enviar"><ArrowUp size={16} /></button>
        </div>
      </div>
    </div>
  )
}
