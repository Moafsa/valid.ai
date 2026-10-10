'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Editor } from 'grapesjs'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDown, ArrowUp, Copy, CornerLeftUp, Image as ImageIcon,
  Italic, LayoutGrid, Link2, Loader2, Monitor, MousePointerClick, Palette, Smartphone, Sparkles, Tablet, Trash2, Type,
  Underline, Upload, Box, Video,
} from 'lucide-react'
import { ColorField, CssField, Field, Group, IconBtn, Seg, Switch, toHex } from './editor-ui'

export interface Selected {
  text: string
  href: string | null
  isLink: boolean
  isTextLeaf: boolean
  isImage: boolean
  src: string | null
  id: string
  hiddenOn: { desktop: boolean; tablet: boolean; mobile: boolean }
  nextStep: string
  delay: string
  pitchAt: string
  player: { start?: string; bar?: string; seek?: boolean; resume?: boolean; pause?: boolean | string; fullscreen?: boolean; loop?: boolean; src?: string; embed?: string } | null
}

interface PageSummary { id: string; slug: string; name: string; order: number }

export interface InspectorProps {
  editor: Editor
  comp: any
  selected: Selected
  tick: number
  sortedPages: PageSummary[]
  device: string
  setDevice: (name: string) => void
  uploadingImage: boolean
  onText: (v: string) => void
  onHref: (v: string) => void
  onId: (v: string) => void
  onDataAttr: (name: 'data-vai-next' | 'data-vai-delay', value: string, key: 'nextStep' | 'delay') => void
  onPitchAt: (v: string) => void
  onPlayer: (patch: Record<string, unknown>) => void
  onVisibility: (device: 'desktop' | 'tablet' | 'mobile', hidden: boolean) => void
  onUploadImage: (file: File) => void
  onAskAi: () => void
  onBump: () => void
}

type Tab = 'conteudo' | 'estilo' | 'avancado'

const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'button', 'li', 'label', 'strong', 'em', 'small', 'blockquote', 'td', 'th', 'summary', 'figcaption', 'b', 'i', 'u'])

const FONT_STACKS: { label: string; value: string }[] = [
  { label: 'Padrão do site', value: '' },
  { label: 'Sans-serif moderna', value: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { label: 'Helvetica / Arial', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Serifada (Georgia)', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Serifada elegante', value: '"Playfair Display", Georgia, serif' },
  { label: 'Arredondada', value: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { label: 'Monoespaçada', value: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
]

const WEIGHTS = [
  ['300', 'Leve'], ['400', 'Normal'], ['500', 'Médio'], ['600', 'Semibold'], ['700', 'Negrito'], ['800', 'Extra'], ['900', 'Preto'],
]

const SHADOWS: { label: string; value: string }[] = [
  { label: 'Nenhuma', value: 'none' },
  { label: 'Suave', value: '0 1px 3px rgba(17,24,39,.12), 0 1px 2px rgba(17,24,39,.08)' },
  { label: 'Média', value: '0 8px 24px rgba(17,24,39,.12)' },
  { label: 'Forte', value: '0 20px 48px rgba(17,24,39,.22)' },
  { label: 'Brilho', value: '0 0 32px rgba(37,99,235,.45)' },
]

const BUTTON_PRESETS: { name: string; style: Record<string, string> }[] = [
  { name: 'Escuro', style: { 'background-color': '#111827', color: '#ffffff', border: '1px solid #111827', 'border-radius': '12px' } },
  { name: 'Azul', style: { 'background-color': '#2563eb', color: '#ffffff', border: '1px solid #2563eb', 'border-radius': '12px' } },
  { name: 'Contorno', style: { 'background-color': 'transparent', color: '#111827', border: '1.5px solid #111827', 'border-radius': '12px' } },
  { name: 'Pílula', style: { 'background-color': '#111827', color: '#ffffff', border: '1px solid #111827', 'border-radius': '999px' } },
  { name: 'Suave', style: { 'background-color': '#eff6ff', color: '#1d4ed8', border: '1px solid #dbeafe', 'border-radius': '12px' } },
]

function kindOf(tag: string, s: Selected): { label: string; icon: ReactNode } {
  if (s.player || tag === 'video' || tag === 'iframe') return { label: 'Vídeo', icon: <Video size={16} /> }
  if (s.isImage) return { label: 'Imagem', icon: <ImageIcon size={16} /> }
  if (s.isLink || tag === 'button') return { label: 'Botão / link', icon: <MousePointerClick size={16} /> }
  if (/^h[1-6]$/.test(tag)) return { label: 'Título', icon: <Type size={16} /> }
  if (s.isTextLeaf) return { label: 'Texto', icon: <Type size={16} /> }
  if (tag === 'section' || tag === 'header' || tag === 'footer') return { label: 'Seção', icon: <LayoutGrid size={16} /> }
  if (tag === 'form' || tag === 'input') return { label: 'Formulário', icon: <Box size={16} /> }
  return { label: 'Bloco', icon: <Box size={16} /> }
}

const short = (t: string, n = 22) => (t.length > n ? t.slice(0, n - 1) + '…' : t)

function describe(c: any): string {
  const el = c.getEl?.() as HTMLElement | undefined
  const tag = (el?.tagName || c.get?.('tagName') || 'div').toLowerCase()
  const text = (el?.innerText || '').replace(/\s+/g, ' ').trim()
  if (tag === 'img') return 'imagem'
  if (/^h[1-6]$/.test(tag)) return short(text || 'título')
  if (tag === 'a' || tag === 'button') return short(text || 'botão')
  if (tag === 'p' || tag === 'span') return short(text || 'texto')
  return tag
}

export function ElementInspector(p: InspectorProps) {
  const { editor, comp, selected, tick } = p
  const [tab, setTab] = useState<Tab>('conteudo')
  const [state, setState] = useState<'normal' | 'hover'>('normal')

  // a new selection always starts fresh
  useEffect(() => {
    setTab('conteudo')
    setState('normal')
    try { (editor as any).SelectorManager.setState('') } catch { /* ignore */ }
  }, [comp, editor])

  const el = comp?.getEl?.() as HTMLElement | undefined
  const tag = (el?.tagName || comp?.get?.('tagName') || 'div').toLowerCase()
  const kind = kindOf(tag, selected)
  const sm: any = editor.StyleManager
  const win = el?.ownerDocument?.defaultView
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cs = useMemo(() => (el && win ? win.getComputedStyle(el) : null), [el, win, tick, selected, state, p.device])
  const computed = (prop: string) => cs?.getPropertyValue(prop) ?? ''
  const explicit = (prop: string): string => {
    try { return String((sm.getSelected?.()?.getStyle?.() ?? {})[prop] ?? '') } catch { return '' }
  }
  const val = (prop: string) => explicit(prop) || computed(prop)
  const setStyle = (prop: string, value: string | null) => {
    sm.addStyleTargets({ [prop]: value ?? '' })
    p.onBump()
  }
  const setMany = (style: Record<string, string>) => {
    sm.addStyleTargets(style)
    p.onBump()
  }
  const isHoverable = selected.isLink || tag === 'button' || tag === 'a'

  const pageColors = useMemo(() => {
    const out = new Map<string, number>()
    const doc = el?.ownerDocument
    if (!doc || !win) return [] as string[]
    const nodes = doc.querySelectorAll('body *')
    for (let i = 0; i < nodes.length && i < 900; i += 3) {
      const st = win.getComputedStyle(nodes[i] as Element)
      for (const c of [st.backgroundColor, st.color]) {
        const h = toHex(c)
        if (h) out.set(h, (out.get(h) || 0) + 1)
      }
    }
    return [...out.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 12)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, win])

  const parent = comp.parent?.()
  const trail: any[] = []
  for (let c = parent, i = 0; c && i < 3; c = c.parent?.(), i++) {
    const t = ((c.getEl?.() as HTMLElement | undefined)?.tagName || c.get?.('tagName') || '').toLowerCase()
    if (!t || t === 'body' || c.get?.('type') === 'wrapper') break
    trail.unshift(c)
  }
  const siblings: any[] = parent?.components?.()?.models ?? []
  const index = siblings.indexOf(comp)
  const children: any[] = (comp.components?.()?.models ?? []).filter((c: any) => c.get?.('type') !== 'textnode' && c.getEl?.())

  const move = (delta: number) => {
    if (!parent || index < 0) return
    const to = Math.max(0, Math.min(siblings.length - 1, index + delta))
    if (to === index) return
    comp.move(parent, { at: delta > 0 ? to + 1 : to })
    editor.select(comp)
    p.onBump()
  }

  const showText = selected.isTextLeaf || TEXT_TAGS.has(tag)
  const display = computed('display')
  const isFlex = display.includes('flex')
  const isGrid = display.includes('grid')
  const radius = parseFloat(val('border-top-left-radius') || val('border-radius') || '0') || 0
  const opacity = Math.round((parseFloat(val('opacity') || '1') || 1) * 100)

  return (
    <div className="ed-enter" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div className="ed-insp-head">
        <div className="ed-insp-ico">{kind.icon}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="ed-insp-name">{kind.label}</div>
          <div className="ed-insp-tag">&lt;{tag}&gt;</div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <IconBtn small tip="Subir" onClick={() => move(-1)} disabled={index <= 0}><ArrowUp size={14} /></IconBtn>
          <IconBtn small tip="Descer" onClick={() => move(1)} disabled={index < 0 || index >= siblings.length - 1}><ArrowDown size={14} /></IconBtn>
          <IconBtn small tip="Duplicar" onClick={() => { editor.runCommand('tlb-clone'); p.onBump() }}><Copy size={14} /></IconBtn>
          <IconBtn small tip="Excluir" onClick={() => { editor.runCommand('tlb-delete') }}><Trash2 size={14} /></IconBtn>
        </div>
      </div>

      {(trail.length > 0 || children.length > 0) && (
        <div className="ed-trail">
          {trail.map((c, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <button onClick={() => editor.select(c)} title="Selecionar este elemento">{describe(c)}</button>
              <span>›</span>
            </span>
          ))}
          <span style={{ color: 'var(--ed-text)', fontWeight: 600, padding: '2px 5px' }}>{short(describe(comp), 24)}</span>
        </div>
      )}

      <div style={{ padding: '10px 14px 12px', display: 'flex', gap: 6 }}>
        <button className="ed-btn ed-btn-sm" style={{ flex: 1 }} onClick={p.onAskAi}>
          <Sparkles size={13} /> Pedir pra IA mudar isso
        </button>
        {parent && trail.length > 0 && (
          <IconBtn tip="Selecionar o bloco de fora" onClick={() => editor.select(parent)}><CornerLeftUp size={15} /></IconBtn>
        )}
      </div>

      <div className="ed-tabs">
        {([['conteudo', 'Conteúdo'], ['estilo', 'Estilo'], ['avancado', 'Avançado']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} className="ed-tab" data-on={tab === k ? 'true' : undefined} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div className="ed-panel-body">
        {/* ───────────────── CONTEÚDO ───────────────── */}
        <div style={{ display: tab === 'conteudo' ? 'block' : 'none' }}>
          <div style={{ display: 'grid', gap: 16, padding: 14 }}>
            {selected.isTextLeaf && !selected.isImage && (
              <Field label="Texto">
                <textarea className="ed-textarea" rows={4} value={selected.text} onChange={e => p.onText(e.target.value)} />
                <p className="ed-hint">Atualiza enquanto você digita.</p>
              </Field>
            )}
            {selected.isLink && (
              <Field label={<span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Link2 size={12} /> Para onde o link leva</span>}>
                <input className="ed-input" value={selected.href ?? ''} placeholder="https://..." onChange={e => p.onHref(e.target.value)} />
                <div className="ed-toggle-row" style={{ marginTop: 10 }}>
                  <span>Abrir em outra aba</span>
                  <Switch
                    on={comp.getAttributes()?.target === '_blank'}
                    onChange={v => {
                      if (v) comp.addAttributes({ target: '_blank', rel: 'noopener' })
                      else comp.removeAttributes(['target', 'rel'])
                      p.onBump()
                    }}
                  />
                </div>
              </Field>
            )}
            {p.sortedPages.length > 1 && (selected.isLink || tag === 'button' || selected.nextStep) && (
              <Field label="Ao clicar, ir para a etapa" hint="Só pra botões e respostas do funil. Vale na página publicada.">
                <select className="ed-select" value={selected.nextStep} onChange={e => p.onDataAttr('data-vai-next', e.target.value, 'nextStep')}>
                  <option value="">Nenhuma (usa o link acima)</option>
                  {p.sortedPages.map((pg, i) => <option key={pg.id} value={pg.slug}>{i + 1}. {pg.name}</option>)}
                </select>
              </Field>
            )}
            {selected.isImage && (
              <>
                <Field label="Imagem">
                  {selected.src && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.src} alt="" style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--ed-line)', marginBottom: 8 }} />
                  )}
                  <label className="ed-btn ed-btn-block" style={{ cursor: 'pointer' }}>
                    {p.uploadingImage ? <Loader2 size={14} className="ed-spin" /> : <Upload size={14} />}
                    {p.uploadingImage ? 'Enviando...' : 'Trocar imagem'}
                    <input type="file" accept="image/*" disabled={p.uploadingImage} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) p.onUploadImage(f); e.target.value = '' }} />
                  </label>
                </Field>
                <Field label="Texto alternativo (acessibilidade)">
                  <input className="ed-input" value={comp.getAttributes()?.alt ?? ''} placeholder="Descreva a imagem" onChange={e => { comp.addAttributes({ alt: e.target.value }); p.onBump() }} />
                </Field>
                <Field label="Encaixe">
                  <Seg full value={(val('object-fit') as any) || 'fill'} onChange={v => setStyle('object-fit', v)} options={[{ value: 'cover', label: 'Preencher' }, { value: 'contain', label: 'Conter' }, { value: 'fill', label: 'Esticar' }]} />
                </Field>
              </>
            )}
            {!selected.isTextLeaf && !selected.isImage && children.length > 0 && (
              <Field label="Dentro deste bloco" hint="Clique pra editar um deles. Ou dê dois cliques direto na página.">
                <div style={{ display: 'grid', gap: 4 }}>
                  {children.slice(0, 10).map((c, i) => (
                    <button key={i} className="ed-btn ed-btn-ghost" style={{ justifyContent: 'flex-start', height: 30, border: '1px solid var(--ed-line)' }} onClick={() => editor.select(c)}>
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, color: 'var(--ed-text-3)' }}>{((c.getEl?.() as HTMLElement)?.tagName || '').toLowerCase()}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{describe(c)}</span>
                    </button>
                  ))}
                  {children.length > 10 && <span className="ed-hint">+ {children.length - 10} elementos</span>}
                </div>
              </Field>
            )}
            {!selected.isTextLeaf && !selected.isImage && children.length === 0 && !selected.isLink && (
              <p className="ed-hint">Esse elemento não tem texto pra editar. Use a aba Estilo pra mudar cores e espaçamentos.</p>
            )}
          </div>
        </div>

        {/* ───────────────── ESTILO ───────────────── */}
        <div style={{ display: tab === 'estilo' ? 'block' : 'none' }}>
          <div className="ed-device-note">
            {p.device === 'Mobile' ? <Smartphone size={14} /> : p.device === 'Tablet' ? <Tablet size={14} /> : <Monitor size={14} />}
            <span>
              {p.device === 'Desktop' ? 'Mudanças valem em todas as telas' : p.device === 'Tablet' ? 'Mudanças valem em tablet e celular' : 'Mudanças valem só no celular'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '10px 14px 4px', alignItems: 'center', justifyContent: 'space-between' }}>
            <Seg value={p.device as any} onChange={v => p.setDevice(v)} options={[{ value: 'Desktop', label: <Monitor size={13} />, title: 'Desktop' }, { value: 'Tablet', label: <Tablet size={13} />, title: 'Tablet' }, { value: 'Mobile', label: <Smartphone size={13} />, title: 'Celular' }]} />
            {isHoverable && (
              <Seg
                value={state}
                onChange={v => {
                  setState(v)
                  try { (editor as any).SelectorManager.setState(v === 'hover' ? 'hover' : '') } catch { /* ignore */ }
                  p.onBump()
                }}
                options={[{ value: 'normal', label: 'Normal' }, { value: 'hover', label: 'Hover' }]}
              />
            )}
          </div>

          {(selected.isLink || tag === 'button') && (
            <Group title="Estilos rápidos" icon={<Sparkles size={13} />} defaultOpen>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {BUTTON_PRESETS.map(b => (
                  <button key={b.name} className="ed-btn ed-btn-sm" onClick={() => setMany(b.style)}>
                    <span style={{ width: 10, height: 10, borderRadius: b.style['border-radius'] === '999px' ? 10 : 3, background: b.style['background-color'] === 'transparent' ? 'transparent' : b.style['background-color'], border: `1.5px solid ${b.style.color === '#ffffff' ? b.style['background-color'] : b.style.color}` }} />
                    {b.name}
                  </button>
                ))}
              </div>
            </Group>
          )}

          {showText && (
            <Group title="Tipografia" icon={<Type size={13} />} defaultOpen>
              <Field label="Fonte">
                <select className="ed-select" value={FONT_STACKS.find(f => f.value && explicit('font-family') === f.value)?.value ?? (explicit('font-family') ? '__custom' : '')} onChange={e => setStyle('font-family', e.target.value === '__custom' ? null : e.target.value || null)}>
                  {FONT_STACKS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
                  {explicit('font-family') && !FONT_STACKS.some(f => f.value === explicit('font-family')) && <option value="__custom">{explicit('font-family').split(',')[0].replace(/["']/g, '')}</option>}
                </select>
              </Field>
              <div className="ed-row">
                <CssField label="Tamanho" value={val('font-size')} onChange={v => setStyle('font-size', v || null)} min={1} />
                <Field label="Peso">
                  <select className="ed-select" value={String(val('font-weight'))} onChange={e => setStyle('font-weight', e.target.value)}>
                    {WEIGHTS.map(([w, l]) => <option key={w} value={w}>{l}</option>)}
                    {!WEIGHTS.some(([w]) => w === String(val('font-weight'))) && <option value={String(val('font-weight'))}>{val('font-weight')}</option>}
                  </select>
                </Field>
              </div>
              <div className="ed-row">
                <CssField label="Altura da linha" unit="" value={explicit('line-height') || (computed('line-height') === 'normal' ? '' : computed('line-height'))} placeholder="1.5" step={0.1} onChange={v => setStyle('line-height', v || null)} />
                <CssField label="Espaço entre letras" value={val('letter-spacing') === 'normal' ? '' : val('letter-spacing')} placeholder="0px" step={0.5} onChange={v => setStyle('letter-spacing', v || null)} />
              </div>
              <ColorField label="Cor do texto" value={val('color')} swatches={pageColors} onChange={v => setStyle('color', v || null)} />
              <Field label="Alinhamento">
                <Seg
                  full
                  value={(['left', 'center', 'right', 'justify'].includes(val('text-align')) ? val('text-align') : val('text-align') === 'start' ? 'left' : 'left') as any}
                  onChange={v => setStyle('text-align', v)}
                  options={[{ value: 'left', label: <AlignLeft size={14} /> }, { value: 'center', label: <AlignCenter size={14} /> }, { value: 'right', label: <AlignRight size={14} /> }, { value: 'justify', label: <AlignJustify size={14} /> }]}
                />
              </Field>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="ed-btn ed-btn-sm" data-active={val('font-style') === 'italic'} style={val('font-style') === 'italic' ? { background: 'var(--ed-active)' } : undefined} onClick={() => setStyle('font-style', val('font-style') === 'italic' ? 'normal' : 'italic')}><Italic size={13} /></button>
                <button className="ed-btn ed-btn-sm" style={val('text-decoration-line').includes('underline') ? { background: 'var(--ed-active)' } : undefined} onClick={() => setStyle('text-decoration', val('text-decoration-line').includes('underline') ? 'none' : 'underline')}><Underline size={13} /></button>
                <button className="ed-btn ed-btn-sm" style={val('text-transform') === 'uppercase' ? { background: 'var(--ed-active)' } : undefined} onClick={() => setStyle('text-transform', val('text-transform') === 'uppercase' ? 'none' : 'uppercase')}>Aa</button>
              </div>
            </Group>
          )}

          <Group title="Tamanho e espaço" icon={<Box size={13} />} defaultOpen={!showText}>
            <div className="ed-row">
              <CssField label="Largura" value={explicit('width') || ''} placeholder={computed('width')} onChange={v => setStyle('width', v || null)} />
              <CssField label="Altura" value={explicit('height') || ''} placeholder={computed('height')} onChange={v => setStyle('height', v || null)} />
            </div>
            <div className="ed-row">
              <CssField label="Largura máx." value={explicit('max-width')} placeholder="nenhuma" onChange={v => setStyle('max-width', v || null)} />
              <CssField label="Altura mín." value={explicit('min-height')} placeholder="nenhuma" onChange={v => setStyle('min-height', v || null)} />
            </div>
            <Sides label="Espaço por dentro" prop="padding" val={val} explicit={explicit} setMany={setMany} />
            <Sides label="Espaço por fora" prop="margin" val={val} explicit={explicit} setMany={setMany} />
          </Group>

          {(children.length > 0 || isFlex || isGrid) && (
            <Group title="Organização" icon={<LayoutGrid size={13} />}>
              <Field label="Tipo">
                <Seg full value={(isFlex ? 'flex' : isGrid ? 'grid' : display === 'none' ? 'none' : 'block') as any} onChange={v => setStyle('display', v)} options={[{ value: 'block', label: 'Bloco' }, { value: 'flex', label: 'Flex' }, { value: 'grid', label: 'Grade' }, { value: 'none', label: 'Oculto' }]} />
              </Field>
              {isFlex && (
                <>
                  <Field label="Direção">
                    <Seg full value={(val('flex-direction').startsWith('column') ? 'column' : 'row') as any} onChange={v => setStyle('flex-direction', v)} options={[{ value: 'row', label: 'Em linha' }, { value: 'column', label: 'Em coluna' }]} />
                  </Field>
                  <div className="ed-row">
                    <Field label="Alinhar na horizontal">
                      <select className="ed-select" value={val('justify-content')} onChange={e => setStyle('justify-content', e.target.value)}>
                        {[['flex-start', 'Início'], ['center', 'Centro'], ['flex-end', 'Fim'], ['space-between', 'Espaçado'], ['space-around', 'Ao redor']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        {!['flex-start', 'center', 'flex-end', 'space-between', 'space-around'].includes(val('justify-content')) && <option value={val('justify-content')}>{val('justify-content')}</option>}
                      </select>
                    </Field>
                    <Field label="Alinhar na vertical">
                      <select className="ed-select" value={val('align-items')} onChange={e => setStyle('align-items', e.target.value)}>
                        {[['flex-start', 'Topo'], ['center', 'Centro'], ['flex-end', 'Base'], ['stretch', 'Esticar']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        {!['flex-start', 'center', 'flex-end', 'stretch'].includes(val('align-items')) && <option value={val('align-items')}>{val('align-items')}</option>}
                      </select>
                    </Field>
                  </div>
                </>
              )}
              {(isFlex || isGrid) && <CssField label="Espaço entre itens" value={val('gap') === 'normal' ? '' : val('gap')} placeholder="0px" onChange={v => setStyle('gap', v || null)} />}
            </Group>
          )}

          <Group title="Fundo e borda" icon={<Palette size={13} />} defaultOpen={!showText}>
            <ColorField label="Cor de fundo" value={val('background-color')} swatches={pageColors} onChange={v => setStyle('background-color', v || null)} />
            <Field label="Imagem de fundo (link)">
              <input
                className="ed-input"
                placeholder="https://..."
                defaultValue={(explicit('background-image').match(/url\(["']?([^"')]+)["']?\)/) || [])[1] || ''}
                key={comp.cid + tick * 0}
                onBlur={e => { const v = e.target.value.trim(); setMany(v ? { 'background-image': `url(${v})`, 'background-size': 'cover', 'background-position': 'center' } : { 'background-image': '' }) }}
              />
            </Field>
            <Field label={`Cantos arredondados · ${Math.round(radius)}px`}>
              <input type="range" className="ed-range" min={0} max={60} value={Math.min(60, Math.round(radius))} onChange={e => setStyle('border-radius', e.target.value + 'px')} />
            </Field>
            <div className="ed-row three">
              <CssField label="Borda" value={explicit('border-width') || (val('border-top-style') !== 'none' ? val('border-top-width') : '')} placeholder="0px" onChange={v => setMany(v ? { 'border-width': v, 'border-style': val('border-top-style') !== 'none' ? val('border-top-style') : 'solid' } : { 'border-width': '', 'border-style': '' })} />
              <Field label="Estilo">
                <select className="ed-select" value={val('border-top-style')} onChange={e => setStyle('border-style', e.target.value)}>
                  {['none', 'solid', 'dashed', 'dotted'].map(s => <option key={s} value={s}>{({ none: 'Nenhum', solid: 'Sólido', dashed: 'Tracejado', dotted: 'Pontilhado' } as any)[s]}</option>)}
                </select>
              </Field>
              <div />
            </div>
            <ColorField label="Cor da borda" value={val('border-top-color')} onChange={v => setStyle('border-color', v || null)} />
            <Field label="Sombra">
              <select className="ed-select" value={SHADOWS.find(s => s.value === explicit('box-shadow'))?.value ?? (explicit('box-shadow') ? '__c' : val('box-shadow') === 'none' ? 'none' : '__c')} onChange={e => e.target.value !== '__c' && setStyle('box-shadow', e.target.value)}>
                {SHADOWS.map(s => <option key={s.label} value={s.value}>{s.label}</option>)}
                <option value="__c">Personalizada</option>
              </select>
            </Field>
            <Field label={`Opacidade · ${opacity}%`}>
              <input type="range" className="ed-range" min={0} max={100} value={opacity} onChange={e => setStyle('opacity', String(Number(e.target.value) / 100))} />
            </Field>
          </Group>

        </div>

        {/* ───────────────── AVANÇADO ───────────────── */}
        <div style={{ display: tab === 'avancado' ? 'block' : 'none' }}>
          <div style={{ display: 'grid', gap: 16, padding: 14 }}>
            <Field label="ID do elemento" hint="Útil pra âncoras (#preco) e pra quem mexe com código.">
              <input className="ed-input" value={selected.id} placeholder="ex: secao-preco" onChange={e => p.onId(e.target.value)} />
            </Field>
            <ClassEditor comp={comp} tick={tick} onBump={p.onBump} />
            <Field label="Mostrar em">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {([['desktop', 'Desktop', Monitor], ['tablet', 'Tablet', Tablet], ['mobile', 'Celular', Smartphone]] as const).map(([d, l, Icon]) => {
                  const hidden = selected.hiddenOn[d]
                  return (
                    <button key={d} className="ed-btn" style={{ flexDirection: 'column', height: 56, gap: 4, ...(hidden ? { background: 'rgba(229,72,77,.08)', color: 'var(--ed-danger)', borderColor: 'rgba(229,72,77,.35)' } : {}) }} onClick={() => p.onVisibility(d, !hidden)}>
                      <Icon size={16} />
                      <span style={{ fontSize: 11 }}>{hidden ? 'Oculto' : l}</span>
                    </button>
                  )
                })}
              </div>
            </Field>
            <Field label="Aparecer depois de (segundos)" hint="Bom pra botão de oferta. No editor ele fica sempre visível; a espera só vale na página publicada.">
              <input className="ed-input" type="number" min={0} step={1} value={selected.delay} placeholder="0 = já aparece" onChange={e => p.onDataAttr('data-vai-delay', e.target.value, 'delay')} />
            </Field>
            <Field label="Aparecer depois de (segundos DO VÍDEO)" hint="O famoso pitch: o botão só aparece quando a pessoa chega nesse ponto do vídeo.">
              <input className="ed-input" type="number" min={0} step={1} value={selected.pitchAt} placeholder="ex: 540 (aos 9 minutos)" onChange={e => p.onPitchAt(e.target.value)} />
            </Field>
            {selected.player && <PlayerSettings pl={selected.player} onChange={p.onPlayer} />}
            <CustomCss comp={comp} tick={tick} onBump={p.onBump} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Sides({ label, prop, val, explicit, setMany }: { label: string; prop: 'padding' | 'margin'; val: (p: string) => string; explicit: (p: string) => string; setMany: (s: Record<string, string>) => void }) {
  const [linked, setLinked] = useState(false)
  const sides = ['top', 'right', 'bottom', 'left'] as const
  const names = { top: 'Cima', right: 'Dir.', bottom: 'Baixo', left: 'Esq.' }
  const set = (side: string, v: string) => {
    if (linked) setMany(Object.fromEntries(sides.map(s => [`${prop}-${s}`, v])))
    else setMany({ [`${prop}-${side}`]: v })
  }
  return (
    <Field
      label={
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {label}
          <button type="button" className="ed-btn ed-btn-ghost ed-btn-sm" style={{ height: 20, padding: '0 6px', fontSize: 10.5, ...(linked ? { color: 'var(--ed-accent)' } : {}) }} onClick={() => setLinked(l => !l)}>
            {linked ? 'Todos iguais' : 'Separados'}
          </button>
        </span>
      }
    >
      <div className="ed-row four">
        {sides.map(s => (
          <div key={s}>
            <CssFieldMini value={explicit(`${prop}-${s}`) || ''} placeholder={String(parseFloat(val(`${prop}-${s}`)) || 0)} onChange={v => set(s, v)} />
            <div style={{ textAlign: 'center', fontSize: 9.5, color: 'var(--ed-text-3)', marginTop: 3 }}>{names[s]}</div>
          </div>
        ))}
      </div>
    </Field>
  )
}

function CssFieldMini({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (raw: string) => { setDraft(null); const v = raw.trim(); if (v === value) return; onChange(/^-?\d*\.?\d+$/.test(v) ? v + 'px' : v) }
  return (
    <input
      className="ed-input"
      style={{ padding: '0 4px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
      value={draft ?? value.replace(/px$/, '')}
      placeholder={placeholder}
      onChange={e => setDraft(e.target.value)}
      onBlur={e => draft !== null && commit(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          const base = parseFloat(draft ?? value) || parseFloat(placeholder) || 0
          onChange(base + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1) + 'px')
          setDraft(null)
        }
      }}
    />
  )
}

function ClassEditor({ comp, tick, onBump }: { comp: any; tick: number; onBump: () => void }) {
  const [draft, setDraft] = useState('')
  const classes: string[] = (comp.getClasses?.() ?? []).filter((c: string) => !c.startsWith('vai-hide-'))
  return (
    <Field label="Classes CSS" hint="Pra reaproveitar um estilo que a página já tem.">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: classes.length ? 8 : 0 }} data-t={tick}>
        {classes.map(c => (
          <span key={c} className="ed-chip" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5 }}>
            {c.length > 26 ? c.slice(0, 25) + '…' : c}
            <button style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--ed-text-3)', padding: 0 }} onClick={() => { comp.removeClass(c); onBump() }} aria-label={`Remover ${c}`}>×</button>
          </span>
        ))}
      </div>
      <input
        className="ed-input"
        value={draft}
        placeholder="adicionar classe e Enter"
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && draft.trim()) {
            draft.trim().split(/\s+/).forEach(c => comp.addClass(c.replace(/^\./, '')))
            setDraft('')
            onBump()
          }
        }}
      />
    </Field>
  )
}

function CustomCss({ comp, tick, onBump }: { comp: any; tick: number; onBump: () => void }) {
  const style = comp.getStyle?.() ?? {}
  const text = Object.entries(style).map(([k, v]) => `${k}: ${v};`).join('\n')
  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => setDraft(null), [comp, tick])
  return (
    <Field label="CSS deste elemento" hint="Uma propriedade por linha. Vale só pra este elemento.">
      <textarea
        className="ed-textarea"
        rows={4}
        spellCheck={false}
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5 }}
        value={draft ?? text}
        placeholder={'color: #111;\nmargin-top: 12px;'}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === null) return
          const next: Record<string, string> = {}
          draft.split(/;|\n/).forEach(line => {
            const i = line.indexOf(':')
            if (i > 0) { const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim(); if (k && v) next[k] = v }
          })
          comp.setStyle(next)
          setDraft(null)
          onBump()
        }}
      />
    </Field>
  )
}

function PlayerSettings({ pl, onChange }: { pl: NonNullable<Selected['player']>; onChange: (p: Record<string, unknown>) => void }) {
  const pauseMode = pl.pause === 'never' || pl.pause === false ? 'never' : pl.pause === 'once' ? 'once' : 'free'
  return (
    <div className="ed-card" style={{ padding: 14, display: 'grid', gap: 12, background: 'var(--ed-panel-2)' }}>
      <div className="ed-section-title"><Video size={13} /> Player de vídeo</div>
      <Field label="Como o vídeo começa">
        <select className="ed-select" value={pl.start ?? 'preview'} onChange={e => onChange({ start: e.target.value })}>
          <option value="click">Só começa quando a pessoa clica</option>
          <option value="auto">Começa sozinho quando a página abre</option>
          <option value="preview">Prévia sem som; o toque começa do zero com som</option>
        </select>
      </Field>
      <Field label="Pausar">
        <select className="ed-select" value={pauseMode} onChange={e => onChange({ pause: e.target.value })}>
          <option value="free">Pode pausar e continuar</option>
          <option value="never">Não pode pausar</option>
          <option value="once">Pode pausar uma vez, depois trava</option>
        </select>
      </Field>
      <Field label="Controles">
        <select className="ed-select" value={pl.bar ?? 'smart'} onChange={e => onChange({ bar: e.target.value })}>
          <option value="smart">Barra esperta (enche rápido no começo)</option>
          <option value="plain">Barra simples, sem tempo</option>
          <option value="full">Controles completos</option>
          <option value="none">Sem barra nenhuma</option>
        </select>
      </Field>
      {([
        ['Botão de tela cheia', pl.fullscreen === true, (v: boolean) => onChange({ fullscreen: v })],
        ['Não deixar pular pra frente', pl.seek !== true, (v: boolean) => onChange({ seek: !v })],
        ['Lembrar onde a pessoa parou', pl.resume !== false, (v: boolean) => onChange({ resume: v })],
        ['Repetir quando acabar', pl.loop === true, (v: boolean) => onChange({ loop: v })],
      ] as [string, boolean, (v: boolean) => void][]).map(([l, on, fn]) => (
        <div key={l} className="ed-toggle-row"><span>{l}</span><Switch on={on} onChange={fn} /></div>
      ))}
    </div>
  )
}

