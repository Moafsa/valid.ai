'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from 'grapesjs'
import { ArrowUp, Check, Image as ImageIcon, Maximize2, Minimize2, Minus, RotateCcw, RotateCw, X } from 'lucide-react'
import { IconBtn, Seg, Sparkle } from './editor-ui'
import {
  applyOperations, describePage, flash, interpretLocally, redoBatch, reveal, undoBatch,
  type Change, type EngineCtx,
} from '@/lib/visual-editor/ai-engine'
import type { Operation } from '@/lib/visual-editor/ai-types'

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
  skipped?: number
}

const STEPS = ['Lendo a página', 'Entendendo o que você quer', 'Montando as mudanças', 'Aplicando na página']

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
  const [step, setStep] = useState(0)
  const [full, setFull] = useState(false)
  const [ref, setRef] = useState<string | null>(null)
  const [scope, setScope] = useState<'page' | 'selection'>('page')
  const idRef = useRef(1)
  const feedRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { onSeed?.(t => { setDraft(t); setTimeout(() => taRef.current?.focus(), 30) }) }, [onSeed])
  useEffect(() => { setTimeout(() => taRef.current?.focus(), 250) }, [])
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy, step])
  useEffect(() => {
    if (!taRef.current) return
    taRef.current.style.height = '0px'
    taRef.current.style.height = Math.min(120, taRef.current.scrollHeight) + 'px'
  }, [draft])

  const hasSel = !!selectedLabel
  // picking something on the page makes it the target; deselecting goes back to the whole page
  useEffect(() => { setScope(selectedLabel ? 'selection' : 'page') }, [selectedLabel])
  const useSel = hasSel && scope === 'selection'
  const suggestions = useSel
    ? [['✦', 'Deixe esse elemento mais moderno'], ['🎨', 'Troque a cor dele para azul'], ['🔠', 'Aumente o tamanho do texto'], ['🗑', 'Remova esse elemento']]
    : [['💎', 'Deixe a página mais premium'], ['🌑', 'Troque o fundo para preto'], ['💬', 'Adicione uma seção de depoimentos'], ['🔘', 'Deixe todos os botões maiores e arredondados'], ['🖼', 'Deixe a página mais parecida com a referência (anexe uma imagem)']]

  const send = useCallback(async (textIn?: string) => {
    const instruction = (textIn ?? draft).trim()
    if (!instruction || busy) return
    const image = ref
    setDraft(''); setRef(null); setBusy(true); setStep(0)
    const userMsg: Msg = { id: idRef.current++, role: 'user', text: instruction, image: image || undefined }
    setMsgs(m => [...m, userMsg])
    const tick = setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 2)), 1300)
    const selected = useSel ? getSelected() : null
    try {
      const { outline } = describePage(ctx, getSelected())
      const history = [...msgs, userMsg].slice(-9, -1).map(m => ({ role: m.role, text: m.text.slice(0, 600) }))
      let reply = ''
      let ops: Operation[] = []
      let source: 'ai' | 'local' = 'ai'
      let failed: string | null = null
      try {
        const res = await fetch('/api/editor/ai-assist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instruction, outline, history, image: image || undefined, scope: selected ? 'selection' : 'page',
            selectedHtml: selected ? String(selected.toHTML?.() || '').slice(0, 6500) : undefined,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) { reply = data.reply || ''; ops = data.operations || [] }
        else if (data?.code === 'no_ai_key') source = 'local'
        else failed = data?.error || 'A IA não respondeu. Tente de novo.'
      } catch {
        source = 'local'
      }
      if (failed) {
        setMsgs(m => [...m, { id: idRef.current++, role: 'assistant', text: failed!, error: true }])
        return
      }
      if (source === 'local') {
        const r = interpretLocally(instruction, { hasSelection: !!selected, sections: outline.sections.length })
        reply = r.reply; ops = r.operations
        if (image && !r.understood) reply = 'Pra comparar com uma imagem de referência eu preciso da IA completa, que ainda não está conectada. ' + reply
      }
      clearInterval(tick); setStep(STEPS.length - 1)
      if (!ops.length) {
        setMsgs(m => [...m, { id: idRef.current++, role: 'assistant', text: reply || 'Não encontrei o que mudar com esse pedido. Pode explicar de outro jeito?', source }])
        return
      }
      await new Promise(r => setTimeout(r, 250))
      const result = applyOperations(ctx, ops, selected)
      const changed = result.changes.flatMap(c => c.comps).filter(Boolean)
      if (!result.changes.length) {
        setMsgs(m => [...m, { id: idRef.current++, role: 'assistant', text: 'Entendi o pedido, mas não achei onde aplicar nessa página. Tenta selecionar o elemento e pedir de novo?', source, error: true }])
        return
      }
      setMsgs(m => [...m, { id: idRef.current++, role: 'assistant', text: reply || 'Pronto, apliquei as mudanças.', changes: result.changes, undoSteps: result.undoSteps, applied: true, source, skipped: result.skipped }])
      // show it: scroll to the first change and pulse everything that moved
      if (changed[0]) reveal(editor, changed[0])
      setTimeout(() => flash(editor, changed.slice(0, 60)), 450)
    } catch (e: any) {
      console.error('[ai] failed', e)
      setMsgs(m => [...m, { id: idRef.current++, role: 'assistant', text: 'Não consegui aplicar isso agora. Tente de novo.', error: true }])
    } finally {
      clearInterval(tick)
      setBusy(false)
    }
  }, [busy, ctx, draft, editor, getSelected, msgs, ref])

  const toggle = (m: Msg) => {
    if (!m.undoSteps) return
    if (m.applied) undoBatch(editor, m.undoSteps)
    else redoBatch(editor, m.undoSteps)
    setMsgs(list => list.map(x => (x.id === m.id ? { ...x, applied: !m.applied } : x)))
    if (!m.applied) setTimeout(() => flash(editor, (m.changes || []).flatMap(c => c.comps).filter(Boolean).slice(0, 60)), 200)
  }

  return (
    <div className={`ed-ai-sheet${full ? ' full' : ''}`} role="dialog" aria-label="Assistente de IA">
      <div className="ed-ai-head">
        <div className="ed-ai-title"><span className="ed-ai-mark"><Sparkle size={16} /></span> Assistente</div>
        <div style={{ display: 'flex', gap: 2 }}>
          <IconBtn small tip={full ? 'Recolher' : 'Expandir'} onClick={() => setFull(f => !f)}>{full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</IconBtn>
          <IconBtn small tip="Minimizar" onClick={onClose}><Minus size={15} /></IconBtn>
        </div>
      </div>

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
          <div className="ed-ai-hello">
            <h4>O que você quer mudar?</h4>
            <p>Escreva do seu jeito. Eu altero a página de verdade e mostro o que mudou. Dá pra desfazer tudo com um clique.</p>
            <div className="ed-ai-sugs" style={{ marginTop: 8 }}>
              {suggestions.map(([ic, t]) => (
                <button key={t} className="ed-ai-sug" onClick={() => send(t)}><span className="ic">{ic}</span>{t}</button>
              ))}
            </div>
          </div>
        )}

        {msgs.map(m =>
          m.role === 'user' ? (
            <div key={m.id} className="ed-ai-you">
              {m.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.image} alt="" style={{ width: 120, borderRadius: 8, display: 'block', marginBottom: 6 }} />}
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="ed-ai-reply">
              <p style={m.error ? { color: 'var(--ed-danger)' } : undefined}>{m.text}</p>
              {m.changes && m.changes.length > 0 && (
                <div className="ed-ai-changes">
                  <div className="ed-ai-changes-head">
                    <span>{m.changes.length} {m.changes.length === 1 ? 'mudança' : 'mudanças'}{!m.applied ? ' (desfeitas)' : ''}</span>
                    {m.source === 'local' && <span className="ed-chip" title="Sem a IA completa conectada, entendo só pedidos comuns">modo básico</span>}
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
              {m.changes && m.undoSteps ? (
                <div className="ed-ai-actions">
                  <button className="ed-btn ed-btn-sm" onClick={() => toggle(m)}>{m.applied ? <><RotateCcw size={13} /> Desfazer isso</> : <><RotateCw size={13} /> Aplicar de novo</>}</button>
                  {(m.skipped || 0) > 0 && <span className="ed-hint" style={{ margin: 0, alignSelf: 'center' }}>{m.skipped} não coube</span>}
                </div>
              ) : null}
            </div>
          ),
        )}

        {busy && (
          <div className="ed-ai-think">
            {STEPS.map((s, i) => (
              <div key={s} className={`step${i < step ? ' done' : ''}`} style={{ opacity: i > step ? 0.35 : 1 }}>
                {i < step ? <Check size={13} /> : i === step ? <span className="ed-spin" style={{ width: 12, height: 12, border: '2px solid var(--ed-line-2)', borderTopColor: 'var(--ed-accent)', borderRadius: '50%', display: 'inline-block' }} /> : <span style={{ width: 13 }} />}
                {s}
              </div>
            ))}
            <div className="bar" style={{ width: '82%' }} /><div className="bar" style={{ width: '58%' }} />
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
          <button className="ed-ai-send" disabled={busy || !draft.trim()} onClick={() => send()} aria-label="Enviar"><ArrowUp size={16} /></button>
        </div>
      </div>
    </div>
  )
}
