/**
 * Browser side of the editor's AI assistant.
 *
 *  - describePage(): turns the live GrapesJS page into a compact outline the model can aim at.
 *  - applyOperations(): runs the model's operations on the real editor (one undo step), and says what changed.
 *  - interpretLocally(): a small Portuguese command parser used when no AI key is configured, so the common
 *    asks ("fundo preto", "botões maiores", "adicione depoimentos") still work.
 */
import type { Editor } from 'grapesjs'
import { STARTER_BLOCKS } from './starter-blocks'
import type { Kind, Operation, Outline, OutlineNode, OutlineSection, Target } from './ai-types'

type Comp = any

export interface EngineCtx {
  editor: Editor
  /** how many original wrapper elements sit between <body> and the page's blocks */
  wrapperDepth: number
}

export interface Change {
  label: string
  detail?: string
  /** components to highlight / jump to */
  comps: Comp[]
  swatch?: string
}

export interface ApplyResult {
  changes: Change[]
  /** number of undo steps this batch used (so it can be reverted as one) */
  undoSteps: number
  skipped: number
}

export function contentRoot({ editor, wrapperDepth }: EngineCtx): Comp {
  let c: Comp = editor.getWrapper()!
  for (let d = 0; d < wrapperDepth; d++) {
    const first = c.components().at(0)
    if (!first) break
    c = first
  }
  return c
}

const isElement = (n: unknown): n is HTMLElement => !!n && (n as Node).nodeType === 1
const realChildren = (c: Comp): Comp[] => (c.components?.()?.models ?? []).filter((m: Comp) => m.get?.('type') !== 'textnode' && isElement(m.getEl?.()))

const txt = (el: HTMLElement | null | undefined) => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim()
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function hex(c: string | undefined): string | undefined {
  if (!c) return undefined
  const m = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/)
  if (!m) return c === 'transparent' ? undefined : c
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return undefined
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n, 10).toString(16).padStart(2, '0')).join('')
}

function luminance(color: string | undefined): number | null {
  const h = hex(color)
  if (!h || !/^#[0-9a-f]{6}$/i.test(h)) return null
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function kindOfEl(el: HTMLElement, cs: CSSStyleDeclaration): Kind | null {
  const tag = el.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) return 'heading'
  if (tag === 'img') return 'image'
  if (tag === 'video' || tag === 'iframe' || el.hasAttribute('data-vai-player')) return 'video'
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const t = (el.getAttribute('type') || '').toLowerCase()
    return t === 'submit' || t === 'button' ? 'button' : 'input'
  }
  if (tag === 'button' || el.getAttribute('role') === 'button') return 'button'
  if (tag === 'a') {
    const bg = hex(cs.backgroundColor)
    const border = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none'
    const cls = (el.getAttribute('class') || '') + ' ' + (el.id || '')
    const looksBtn = !!bg || border || /btn|button|botao|cta/i.test(cls)
    return looksBtn && txt(el).length > 0 ? 'button' : txt(el) ? 'link' : null
  }
  if (tag === 'p' || tag === 'li' || tag === 'blockquote' || tag === 'figcaption' || tag === 'label' || tag === 'small') return txt(el).length >= 2 ? 'text' : null
  return null
}

export interface Registry {
  byId: Map<string, Comp>
  kinds: Map<string, Kind>
  sectionOf: Map<string, string>
  sections: Comp[]
}

export function describePage(ctx: EngineCtx, selected?: Comp | null): { outline: Outline; registry: Registry } {
  const { editor } = ctx
  const root = contentRoot(ctx)
  const doc = editor.Canvas.getDocument()
  const win = doc?.defaultView
  const registry: Registry = { byId: new Map(), kinds: new Map(), sectionOf: new Map(), sections: [] }
  const sections: OutlineSection[] = []
  const palette = new Map<string, number>()
  const counts: Record<string, number> = {}
  let nodeSeq = 0
  const MAX_TOTAL = 360

  const bump = (c?: string) => { const h = hex(c); if (h) palette.set(h, (palette.get(h) || 0) + 1) }

  const walk = (comp: Comp, sec: OutlineSection, depth: number) => {
    if (nodeSeq >= MAX_TOTAL || depth > 14) return
    const el = comp.getEl?.()
    if (!isElement(el) || !win) return
    const cs = win.getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    const kind = kindOfEl(el, cs)
    if (kind) {
      if (sec.nodes.length < 14) {
        const id = `e${++nodeSeq}`
        const node: OutlineNode = { id, kind, tag: el.tagName.toLowerCase() }
        if (kind !== 'image' && kind !== 'video') node.text = clip(txt(el), 70)
        else if (kind === 'image') node.text = clip(el.getAttribute('alt') || '', 40) || undefined
        if (kind === 'heading' || kind === 'text' || kind === 'button' || kind === 'link') {
          node.color = hex(cs.color); node.size = cs.fontSize; node.weight = cs.fontWeight
        }
        if (kind === 'button' || kind === 'input' || kind === 'image') { node.bg = hex(cs.backgroundColor); node.radius = cs.borderTopLeftRadius }
        registry.byId.set(id, comp); registry.kinds.set(id, kind); registry.sectionOf.set(id, sec.id)
        sec.nodes.push(node)
      } else sec.more = (sec.more || 0) + 1
      counts[kind] = (counts[kind] || 0) + 1
      bump(cs.color); bump(cs.backgroundColor)
      if (kind === 'button' || kind === 'heading' || kind === 'text') return // leaf-ish: no need to look inside
    }
    for (const ch of realChildren(comp)) walk(ch, sec, depth + 1)
  }

  realChildren(root).forEach((comp, i) => {
    const el = comp.getEl() as HTMLElement
    const cs = win!.getComputedStyle(el)
    const id = `s${i + 1}`
    const h = el.querySelector('h1,h2,h3')
    const sec: OutlineSection = {
      id, tag: el.tagName.toLowerCase(), title: h ? clip(txt(h as HTMLElement), 60) : clip(txt(el), 50) || undefined,
      bg: hex(cs.backgroundColor) || 'transparent', color: hex(cs.color) || '', height: Math.round(el.getBoundingClientRect().height), nodes: [],
    }
    registry.byId.set(id, comp); registry.kinds.set(id, 'section'); registry.sections.push(comp)
    counts.section = (counts.section || 0) + 1
    walk(comp, sec, 0)
    sections.push(sec)
  })

  const body = doc?.body
  const bcs = body && win ? win.getComputedStyle(body) : null
  const sel: Outline['selected'] = selected && isElement(selected.getEl?.()) ? (() => {
    const el = selected.getEl() as HTMLElement
    let id = [...registry.byId.entries()].find(([, c]) => c === selected)?.[0]
    if (!id) { id = 'sel'; registry.byId.set('sel', selected); registry.kinds.set('sel', (kindOfEl(el, win!.getComputedStyle(el)) || 'section') as Kind) }
    const secEl = el.closest('body > * , body > * > *') as HTMLElement | null
    return { id, kind: registry.kinds.get(id) || 'section', tag: el.tagName.toLowerCase(), text: clip(txt(el), 80) || undefined, sectionId: registry.sectionOf.get(id) || (id.startsWith('s') ? id : undefined) || (secEl ? undefined : undefined) }
  })() : undefined

  const outline: Outline = {
    page: { bg: hex(bcs?.backgroundColor) || '#ffffff', color: hex(bcs?.color) || '#000000', font: (bcs?.fontFamily || '').split(',')[0].replace(/["']/g, '').trim(), width: doc?.documentElement.clientWidth || 0 },
    sections,
    palette: [...palette.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c),
    selected: sel,
    counts,
  }
  return { outline, registry }
}

// ───────────────────────────── targets ─────────────────────────────

function resolveTarget(ctx: EngineCtx, reg: Registry, t: Target | undefined, selected: Comp | null): Comp[] {
  const { editor } = ctx
  if (!t) return selected ? [selected] : []
  if (t.by === 'page') return [editor.getWrapper()!]
  if (t.by === 'selected') return selected ? [selected] : []
  if (t.by === 'ids') return (t.ids || []).map(id => reg.byId.get(id)).filter(Boolean)
  // by kind
  let sectionId = t.section
  if (sectionId === 'selected') {
    const sel = [...reg.byId.entries()].find(([, c]) => c === selected)?.[0]
    sectionId = sel ? (reg.kinds.get(sel) === 'section' ? sel : reg.sectionOf.get(sel)) : undefined
  }
  let list = [...reg.byId.entries()].filter(([id]) => id !== 'sel' && reg.kinds.get(id) === t.kind && (!sectionId || (t.kind === 'section' ? id === sectionId : reg.sectionOf.get(id) === sectionId)))
  if (t.contains) {
    const q = t.contains.toLowerCase()
    list = list.filter(([, c]) => txt(c.getEl?.()).toLowerCase().includes(q))
  }
  let comps = list.map(([, c]) => c)
  if (t.nth?.length) comps = t.nth.map(n => comps[n - 1]).filter(Boolean)
  return comps
}

const camel = (p: string) => p.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
const kebab = (p: string) => p.replace(/[A-Z]/g, c => '-' + c.toLowerCase())
const SAFE_PROP = /^[a-z-]+$/

function sanitizeHtml(html: string): Element | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (doc.body.children.length !== 1) return null
  const root = doc.body.children[0]
  root.querySelectorAll('script, noscript').forEach(n => n.remove())
  if (root.tagName === 'SCRIPT') return null
  ;[root, ...Array.from(root.querySelectorAll('*'))].forEach(node => {
    Array.from(node.attributes).forEach(a => {
      if (/^on/i.test(a.name)) node.removeAttribute(a.name)
      if (/^(href|src|action|formaction)$/i.test(a.name) && /^\s*javascript:/i.test(a.value)) node.removeAttribute(a.name)
    })
  })
  return root
}

function probeComputed(doc: Document, prop: string, value: string): string {
  const win = doc.defaultView!
  const probe = doc.createElement('span')
  probe.style.setProperty(prop, value.replace(/\s*!important\s*$/i, ''))
  probe.style.position = 'absolute'; probe.style.visibility = 'hidden'
  doc.body.appendChild(probe)
  const have = win.getComputedStyle(probe).getPropertyValue(prop)
  probe.remove()
  return have
}

/** Applies CSS to a component and, if the page's own rules still win, repeats it with !important. */
function applyCss(ctx: EngineCtx, comp: Comp, css: Record<string, string>) {
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(css)) {
    const prop = kebab(k.trim())
    if (!SAFE_PROP.test(prop) || typeof v !== 'string' || /[{};]|url\s*\(\s*['"]?\s*javascript:/i.test(v)) continue
    clean[prop] = v.trim()
  }
  if (!Object.keys(clean).length) return
  comp.addStyle(clean)
  const el = comp.getEl?.()
  const doc = ctx.editor.Canvas.getDocument()
  if (!isElement(el) || !doc) return
  const cs = doc.defaultView!.getComputedStyle(el)
  const force: Record<string, string> = {}
  for (const [prop, value] of Object.entries(clean)) {
    if (/!important/i.test(value)) continue
    const want = probeComputed(doc, prop, value)
    const have = cs.getPropertyValue(prop)
    if (want && have && want !== have) force[prop] = value + ' !important'
  }
  if (Object.keys(force).length) comp.addStyle(force)
}

export function flash(editor: Editor, comps: Comp[]) {
  const doc = editor.Canvas.getDocument()
  if (!doc) return
  if (!doc.getElementById('vai-ai-flash-css')) {
    const st = doc.createElement('style')
    st.id = 'vai-ai-flash-css'
    st.textContent = '@keyframes vai-ai-flash{0%{box-shadow:0 0 0 0 rgba(122,167,255,0)}18%{box-shadow:0 0 0 4px rgba(122,167,255,.6),0 0 36px 6px rgba(197,139,255,.35)}100%{box-shadow:0 0 0 0 rgba(122,167,255,0)}}.vai-ai-flash{animation:vai-ai-flash 1.5s ease-out 1;}'
    doc.head.appendChild(st)
  }
  comps.forEach(c => {
    const el = c?.getEl?.() as HTMLElement | undefined
    if (!el) return
    el.classList.remove('vai-ai-flash')
    void el.offsetWidth
    el.classList.add('vai-ai-flash')
    setTimeout(() => el.classList.remove('vai-ai-flash'), 1600)
  })
}

export function reveal(editor: Editor, comp: Comp) {
  try {
    const el = comp.getEl?.() as HTMLElement | undefined
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  } catch { /* ignore */ }
  flash(editor, [comp])
}

const KIND_LABEL: Record<string, [string, string]> = {
  section: ['seção', 'seções'], heading: ['título', 'títulos'], text: ['texto', 'textos'], button: ['botão', 'botões'],
  link: ['link', 'links'], image: ['imagem', 'imagens'], input: ['campo', 'campos'], video: ['vídeo', 'vídeos'],
}

function targetName(t: Target | undefined, n: number, reg: Registry): string {
  if (!t) return n === 1 ? 'o elemento' : `${n} elementos`
  if (t.by === 'page') return 'a página'
  if (t.by === 'selected') return 'o elemento selecionado'
  if (t.by === 'kind' && t.kind) { const [s, p] = KIND_LABEL[t.kind] || ['elemento', 'elementos']; return n === 1 ? `o ${s}` : `${n} ${p}` }
  if (t.by === 'ids') {
    const kinds = new Set((t.ids || []).map(id => reg.kinds.get(id)))
    if (kinds.size === 1) { const k = [...kinds][0] as string; const [s, p] = KIND_LABEL[k] || ['elemento', 'elementos']; return n === 1 ? `o ${s}` : `${n} ${p}` }
  }
  return n === 1 ? 'o elemento' : `${n} elementos`
}

const PROP_LABEL: Record<string, string> = {
  'background-color': 'fundo', background: 'fundo', color: 'cor do texto', 'font-size': 'tamanho do texto', 'font-weight': 'peso do texto', 'font-family': 'fonte',
  'border-radius': 'cantos', padding: 'espaço interno', 'padding-top': 'espaço interno', 'padding-bottom': 'espaço interno', margin: 'espaço externo', 'text-align': 'alinhamento',
  'box-shadow': 'sombra', border: 'borda', 'letter-spacing': 'espaço entre letras', 'line-height': 'altura da linha', 'text-transform': 'caixa do texto', opacity: 'transparência',
  'border-color': 'cor da borda', width: 'largura', height: 'altura', 'max-width': 'largura máxima', 'background-image': 'imagem de fundo', gap: 'espaçamento',
}

function describeCss(css: Record<string, string>): { text: string; swatch?: string } {
  const entries = Object.entries(css).map(([k, v]) => [kebab(k), v] as const)
  const names = [...new Set(entries.map(([k]) => PROP_LABEL[k] || k))]
  const sw = entries.find(([k, v]) => /(^|-)color$|^background(-color)?$/.test(k) && /^(#|rgb|hsl)/i.test(v.trim()))
  return { text: names.slice(0, 3).join(', ') + (names.length > 3 ? ` e mais ${names.length - 3}` : ''), swatch: sw?.[1] }
}


// ───────────────────────────── design safety nets ─────────────────────────────

function parseColor(c: string): [number, number, number, number] | null {
  const m = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/)
  if (!m) return null
  return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : parseFloat(m[4])]
}
const relLum = ([r, g, b]: number[]) => {
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrastRatio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** The color behind an element: first opaque background going up. null when a picture/gradient is in the way. */
function backdrop(el: HTMLElement, win: Window): number[] | null {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const cs = win.getComputedStyle(n)
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null
    const c = parseColor(cs.backgroundColor)
    if (c && c[3] >= 0.9) return c
  }
  return [255, 255, 255]
}

/**
 * After a design change, find text that became unreadable (dark on dark, light on light) and fix only
 * those. Catches what a model or a rule forgets, like a span with its own color inside a heading.
 */
export function fixContrast(ctx: EngineCtx): Change | null {
  const doc = ctx.editor.Canvas.getDocument()
  const win = doc?.defaultView
  if (!doc || !win) return null
  const fixed: Comp[] = []
  let seen = 0
  const visit = (comp: Comp, depth: number) => {
    if (seen > 3500 || depth > 30) return
    const el = comp.getEl?.()
    if (!isElement(el)) return
    seen++
    const cs = win.getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.textContent || '').trim().length > 0)
    if (hasText) {
      const bg = backdrop(el, win)
      const fg = parseColor(cs.color)
      if (bg && fg && fg[3] > 0.5) {
        const ratio = contrastRatio(relLum(fg), relLum(bg))
        if (ratio < 2.4) {
          const light = relLum(bg) < 0.4
          comp.addStyle({ color: light ? '#f4f4f5' : '#18181b' })
          if (win.getComputedStyle(el).color !== (light ? 'rgb(244, 244, 245)' : 'rgb(24, 24, 27)')) comp.addStyle({ color: (light ? '#f4f4f5' : '#18181b') + ' !important' })
          fixed.push(comp)
        }
      }
    }
    comp.components?.().forEach((c: Comp) => visit(c, depth + 1))
  }
  visit(ctx.editor.getWrapper(), 0)
  if (!fixed.length) return null
  return { label: `Ajustei ${fixed.length} ${fixed.length === 1 ? 'texto' : 'textos'} que ficariam difíceis de ler`, comps: fixed.slice(0, 60) }
}


const INHERITED_TEXT_PROPS = ['font-family', 'letter-spacing', 'text-transform', 'font-style']

/** Words inside a heading are often spans with their own font; the heading's typography has to reach them. */
function propagateText(ctx: EngineCtx, comp: Comp, css: Record<string, string>) {
  const doc = ctx.editor.Canvas.getDocument()
  const win = doc?.defaultView
  if (!win) return
  const props = Object.keys(css).map(kebab).filter(p => INHERITED_TEXT_PROPS.includes(p))
  if (!props.length) return
  const visit = (c: Comp, depth: number) => {
    if (depth > 4) return
    c.components?.().forEach((ch: Comp) => {
      const el = ch.getEl?.()
      if (!isElement(el)) return
      const sub: Record<string, string> = {}
      const parentEl = el.parentElement
      for (const p of props) {
        const mine = win.getComputedStyle(el).getPropertyValue(p)
        const theirs = parentEl ? win.getComputedStyle(parentEl).getPropertyValue(p) : ''
        if (mine && theirs && mine !== theirs) sub[p] = (css[p] ?? css[camel(p)]) as string
      }
      if (Object.keys(sub).length) applyCss(ctx, ch, sub)
      visit(ch, depth + 1)
    })
  }
  visit(comp, 0)
}

/** A section's full-width inner wrappers often paint the same old background; move them to the new color too. */
function propagateBackground(ctx: EngineCtx, comp: Comp, oldBg: number[] | null, newBg: string) {
  const doc = ctx.editor.Canvas.getDocument()
  const win = doc?.defaultView
  const root = comp.getEl?.()
  if (!win || !isElement(root) || !oldBg) return
  const width = root.getBoundingClientRect().width
  const visit = (c: Comp, depth: number) => {
    if (depth > 4) return
    c.components?.().forEach((ch: Comp) => {
      const el = ch.getEl?.()
      if (!isElement(el)) return
      const cs = win.getComputedStyle(el)
      const col = parseColor(cs.backgroundColor)
      const wide = el.getBoundingClientRect().width >= width * 0.9
      if (col && col[3] >= 0.95 && wide && col[0] === oldBg[0] && col[1] === oldBg[1] && col[2] === oldBg[2] && cs.backgroundImage === 'none') {
        applyCss(ctx, ch, { 'background-color': newBg })
      }
      visit(ch, depth + 1)
    })
  }
  visit(comp, 0)
}

// ───────────────────────────── apply ─────────────────────────────

export function applyOperations(ctx: EngineCtx, ops: Operation[], selected: Comp | null): ApplyResult {
  const { editor } = ctx
  const um: any = editor.UndoManager
  const before = um.getStack?.().length ?? 0
  const { registry: reg } = describePage(ctx, selected)
  const changes: Change[] = []
  let skipped = 0
  const root = contentRoot(ctx)
  let touchedColors = false
  const stamp = (c: Comp) => { try { if (!c.getAttributes?.()['data-vai-block-id']) c.addAttributes({ 'data-vai-block-id': crypto.randomUUID() }) } catch { /* ignore */ } }

  for (const op of ops) {
    try {
      let targets = resolveTarget(ctx, reg, op.target, selected)
      if (op.op === 'style' && op.target?.by === 'page' && op.css && Object.keys(op.css).some(k => /^background/.test(kebab(k)))) {
        // the page's own wrappers (the original #root / main containers) often paint the page color themselves
        const chain: Comp[] = []
        for (let c: Comp = root; c && c.get?.('type') !== 'wrapper'; c = c.parent?.()) chain.push(c)
        targets = [...targets, ...chain]
      }
      if (op.op === 'style') {
        if (!targets.length || !op.css) { skipped++; continue }
        const newBg = op.css['background-color'] || op.css['background']
        targets.forEach(c => {
          const el = c.getEl?.()
          const old = newBg && isElement(el) && ctx.editor.Canvas.getDocument()?.defaultView ? parseColor(ctx.editor.Canvas.getDocument()!.defaultView!.getComputedStyle(el).backgroundColor) : null
          applyCss(ctx, c, op.css!)
          if (op.target?.by === 'kind' && (op.target.kind === 'heading' || op.target.kind === 'text' || op.target.kind === 'button' || op.target.kind === 'link')) propagateText(ctx, c, op.css!)
          if (newBg && old && old[3] >= 0.95 && /^(#|rgb)/i.test(newBg.trim()) && c !== ctx.editor.getWrapper()) propagateBackground(ctx, c, old, newBg)
        })
        touchedColors = touchedColors || Object.keys(op.css).some(k => /^(background|color)/.test(kebab(k)))
        const d = describeCss(op.css)
        changes.push({ label: op.label || `Mudei ${d.text} de ${targetName(op.target, targets.length, reg)}`, detail: op.label ? undefined : undefined, comps: targets, swatch: d.swatch })
      } else if (op.op === 'text') {
        const c = targets[0]
        if (!c || typeof op.text !== 'string') { skipped++; continue }
        c.components(op.text.replace(/</g, '&lt;'))
        changes.push({ label: op.label || `Troquei o texto de ${targetName(op.target, 1, reg)}`, detail: clip(op.text, 60), comps: [c] })
      } else if (op.op === 'attr') {
        if (!targets.length || !op.attrs) { skipped++; continue }
        for (const c of targets) {
          for (const [k, v] of Object.entries(op.attrs)) {
            if (!/^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(k) || /^on/i.test(k)) continue
            if (v === null) c.removeAttributes(k)
            else if (/^(href|src)$/i.test(k) && /^\s*javascript:/i.test(v)) continue
            else {
              c.addAttributes({ [k]: v })
              if (k === 'src' && c.get('type') === 'image') {
                c.set('src', v)
                // the old file would keep showing on other screen sizes through srcset / <picture><source>
                try { c.removeAttributes(['srcset', 'sizes']) } catch { /* nothing to remove */ }
                const pic = c.parent?.()
                if (pic && String(pic.get('tagName') || '').toLowerCase() === 'picture') pic.components().models.filter((x: any) => String(x.get('tagName') || '').toLowerCase() === 'source').forEach((x: any) => x.remove())
              }
            }
          }
        }
        changes.push({ label: op.label || `Atualizei ${Object.keys(op.attrs).join(', ')} de ${targetName(op.target, targets.length, reg)}`, comps: targets })
      } else if (op.op === 'replace') {
        const c = targets[0]
        const el = op.html ? sanitizeHtml(op.html) : null
        if (!c || !el) { skipped++; continue }
        const bid = c.getAttributes?.()['data-vai-block-id']
        if (bid) el.setAttribute('data-vai-block-id', bid)
        const res = c.replaceWith(el.outerHTML)
        const nc = Array.isArray(res) ? res[0] : res
        changes.push({ label: op.label || `Refiz ${targetName(op.target, 1, reg)}`, comps: nc ? [nc] : [] })
      } else if (op.op === 'insert' || op.op === 'add_block') {
        let html = op.html || ''
        let blockLabel = ''
        if (op.op === 'add_block') {
          const b = STARTER_BLOCKS.find(x => x.id === op.block)
          if (!b) { skipped++; continue }
          html = b.content; blockLabel = b.label
        }
        const el = html ? sanitizeHtml(html) : null
        if (!el) { skipped++; continue }
        const where = op.where || 'after'
        let added: any
        const atPage = where === 'page-start' || where === 'page-end' || !targets.length
        if (atPage) {
          const at = where === 'page-start' || where === 'start' ? 0 : root.components().length
          added = root.components().add(el.outerHTML, { at })
        } else {
          const t = targets[0]
          if (where === 'start' || where === 'end') {
            added = t.components().add(el.outerHTML, { at: where === 'start' ? 0 : t.components().length })
          } else {
            const parent = t.parent?.() || root
            const idx = parent.components().models.indexOf(t)
            added = parent.components().add(el.outerHTML, { at: where === 'before' ? idx : idx + 1 })
          }
        }
        const nc = Array.isArray(added) ? added[0] : added
        if (nc && (nc.parent?.() === root)) stamp(nc)
        changes.push({ label: op.label || (blockLabel ? `Adicionei a seção "${blockLabel}"` : 'Adicionei um bloco novo'), comps: nc ? [nc] : [] })
      } else if (op.op === 'remove') {
        if (!targets.length) { skipped++; continue }
        const names = targetName(op.target, targets.length, reg)
        targets.forEach(c => c.remove())
        changes.push({ label: op.label || `Removi ${names}`, comps: [] })
      }
    } catch (e) {
      console.warn('[ai] operation failed', op, e)
      skipped++
    }
  }
  if (touchedColors) {
    const fix = fixContrast(ctx)
    if (fix) changes.push(fix)
  }
  const after = um.getStack?.().length ?? before
  return { changes, undoSteps: Math.max(0, after - before), skipped }
}

export function undoBatch(editor: Editor, steps: number) { const um: any = editor.UndoManager; for (let i = 0; i < steps; i++) um.undo() }
export function redoBatch(editor: Editor, steps: number) { const um: any = editor.UndoManager; for (let i = 0; i < steps; i++) um.redo() }

// ───────────────────────────── local interpreter ─────────────────────────────

const COLORS: [RegExp, string][] = [
  [/\bpret[oa]s?\b|\bblack\b/, '#0a0a0a'], [/\bbranc[oa]s?\b|\bwhite\b/, '#ffffff'], [/\bcinza[- ]?escuro\b/, '#27272a'], [/\bcinza[- ]?claro\b/, '#f4f4f5'], [/\bcinza\b|\bgr[ae]y\b/, '#71717a'],
  [/\bazul[- ]?escuro\b|\bnavy\b/, '#0f2a5c'], [/\bazul[- ]?claro\b/, '#60a5fa'], [/\bazul\b|\bblue\b/, '#2563eb'], [/\bverde[- ]?escuro\b/, '#166534'], [/\bverde\b|\bgreen\b/, '#16a34a'],
  [/\bvermelh[oa]s?\b|\bred\b/, '#dc2626'], [/\bamarel[oa]s?\b|\byellow\b/, '#eab308'], [/\blaranja\b|\borange\b/, '#f97316'], [/\broxo\b|\bpurple\b|\bviolet[ao]\b/, '#7c3aed'],
  [/\brosa\b|\bpink\b/, '#ec4899'], [/\bbege\b|\bcreme\b/, '#f5efe6'], [/\bmarrom\b/, '#7c4a24'], [/\bdourad[oa]\b|\bgold\b/, '#c9a24b'], [/\bprata\b/, '#a1a1aa'],
]

function pickColor(s: string): string | null {
  const h = s.match(/#[0-9a-f]{3,8}\b/i)
  if (h) return h[0]
  for (const [re, c] of COLORS) if (re.test(s)) return c
  return null
}

// most specific first: the first one that matches wins
const BLOCK_WORDS: [RegExp, string][] = [
  [/whats|zap/, 'whatsapp'], [/contagem|cron[oô]metro|timer|urg[eê]ncia/, 'contagem'], [/faixa|aviso|alerta/, 'alerta'], [/garantia|reembolso/, 'garantia'],
  [/depoiment|avalia[cç]|testemunh|prova social|review/, 'depoimentos'], [/perguntas|faq|d[uú]vidas/, 'faq'], [/formul[aá]rio|captura|cadastro|\blead/, 'formulario'],
  [/\bv[ií]deo/, 'video'], [/planos|assinatura/, 'planos'], [/pre[cç]o|oferta/, 'preco'], [/rodap[eé]|footer/, 'rodape'], [/cabe[cç]alho|header|menu/, 'cabecalho'],
  [/passo a passo|passos|como funciona|etapas/, 'passos'], [/n[uú]meros|estat[ií]stic|m[eé]tricas/, 'numeros'], [/logos?\b|marcas|clientes/, 'logos'],
  [/quem somos|autor|equipe|sobre n[oó]s|sobre mim|\bsobre\b/, 'sobre'], [/b[oô]nus|brinde/, 'bonus'], [/galeria|fotos/, 'galeria'], [/\bmapa|localiza|endere[cç]o/, 'mapa'],
  [/chamada final|\bcta\b|fechamento/, 'cta'], [/recursos|funcionalidades/, 'recursos'], [/benef[ií]cio|vantagem/, 'beneficios'], [/cita[cç][aã]o/, 'citacao'],
  [/divisor|linha divis/, 'divisor'], [/\blista\b/, 'lista'], [/\bhero\b|capa\b|banner principal|se[cç][aã]o (do )?topo|primeira se[cç][aã]o/, 'hero'],
]

export interface LocalResult { understood: boolean; reply: string; operations: Operation[] }

function scopeFor(q: string, hasSel: boolean): Target {
  // with something selected the target is that thing's section, unless the wording says "everything"
  if (hasSel && !/(p[aá]gina (toda|inteira)|site (todo|inteiro)|todas? as se[cç][oõ]es|tudo)/.test(q)) {
    return /(esse|este|nesse|neste|desse|deste)\s+(elemento|bloco|item|bot[aã]o|t[ií]tulo|texto|imagem)|\bisso\b|\bisto\b/.test(q) ? { by: 'selected' } : { by: 'kind', kind: 'section', section: 'selected' }
  }
  return { by: 'page' }
}

function darkTextOps(bg: string, scope: Target): Operation[] {
  const lum = luminance(bg)
  if (lum === null) return []
  const dark = lum < 0.35
  const text = dark ? '#f4f4f5' : '#18181b'
  const muted = dark ? '#c4c4cc' : '#52525b'
  const sec: Target | undefined = scope.by === 'page' ? undefined : scope
  const within = (kind: Kind): Target => ({ by: 'kind', kind, section: sec?.section })
  return [
    { op: 'style', target: within('heading'), css: { color: text }, label: dark ? 'Títulos em tom claro pra ler no fundo escuro' : 'Títulos em tom escuro pra ler no fundo claro' },
    { op: 'style', target: within('text'), css: { color: muted }, label: 'Textos com contraste bom no novo fundo' },
  ]
}

export function interpretLocally(raw: string, ctx: { hasSelection: boolean; sections: number }): LocalResult {
  const q = raw.toLowerCase().normalize('NFC')
  const ops: Operation[] = []
  const said: string[] = []
  const scope = scopeFor(q, ctx.hasSelection)
  const color = pickColor(q)
  const quoted = raw.match(/["“”']([^"“”']{2,200})["“”']/)?.[1]

  const kindWord: [RegExp, Kind][] = [[/bot[õo]es|bot[aã]o|cta/, 'button'], [/t[ií]tulos?|cabe[cç]alhos?|headings?/, 'heading'], [/imagens?|fotos?/, 'image'], [/links?/, 'link'], [/par[aá]grafos?|textos?|letras?/, 'text']]
  const target = kindWord.find(([re]) => re.test(q))?.[1]
  const kindTarget = (k: Kind, sec?: Target): Target => ({ by: 'kind', kind: k, section: sec?.by === 'kind' ? sec.section : undefined })

  // add a section
  const strongAdd = /\b(adicion|inclu|insir|inser|acrescent|cri[ae]r?\b|quero (um|uma)|preciso de (um|uma))/.test(q)
  const weakAdd = /\b(colo[cq]|p[oô]e\b|p[oô]nha|b[oô]ta)/.test(q) && /(se[cç][aã]o|bloco|parte|banner|faixa|componente|\b(um|uma)\b)/.test(q)
  if (strongAdd || weakAdd) {
    const word = BLOCK_WORDS.find(([re]) => re.test(q))
    if (word) {
      const where = /(no )?(topo|come[cç]o|in[ií]cio)/.test(q) ? 'page-start' : /(depois|abaixo|embaixo|ap[oó]s) (dessa|desta|disso)/.test(q) && ctx.hasSelection ? 'after' : 'page-end'
      ops.push({ op: 'add_block', block: word[1], where, target: where === 'after' ? { by: 'selected' } : undefined, label: `Adicionei a seção "${STARTER_BLOCKS.find(b => b.id === word[1])?.label}"` })
      return { understood: true, operations: ops, reply: where === 'page-start' ? 'Pronto, coloquei no topo da página.' : where === 'after' ? 'Pronto, coloquei logo depois do que estava selecionado.' : 'Pronto, coloquei no final da página. Dá pra arrastar pra outro lugar.' }
    }
  }

  // remove
  if (/\b(remov|apag|exclu|tir[ae]|delet)/.test(q) && (target || /se[cç][aã]o/.test(q))) {
    const t: Target = /se[cç][aã]o|bloco/.test(q) && ctx.hasSelection ? { by: 'kind', kind: 'section', section: 'selected' } : target ? { by: 'kind', kind: target } : { by: 'selected' }
    if (t.by === 'selected' && !ctx.hasSelection) return { understood: false, operations: [], reply: 'Clique no elemento que você quer tirar e me peça de novo.' }
    ops.push({ op: 'remove', target: t })
    return { understood: true, operations: ops, reply: 'Feito. Se foi sem querer, o botão Desfazer traz de volta.' }
  }

  // change text
  if (/\b(troqu|mud|alter|escrev|coloc|substitu|renome)/.test(q) && quoted && /(texto|t[ií]tulo|bot[aã]o|chamada|frase)/.test(q)) {
    const t: Target = ctx.hasSelection && /(esse|este|isso|selecionad)/.test(q) ? { by: 'selected' } : { by: 'kind', kind: /bot[aã]o/.test(q) ? 'button' : 'heading', nth: [1] }
    ops.push({ op: 'text', target: t, text: quoted })
    return { understood: true, operations: ops, reply: 'Troquei o texto.' }
  }

  // looks: presets
  const preset = /(premium|luxuos|sofisticad|elegante|requintad)/.test(q) ? 'premium' : /(dark|modo escuro|tema escuro|escur[ao]\b)/.test(q) && !color && !/fundo/.test(q) ? 'dark' : /(moderno|clean|minimalista|limpo|atual)/.test(q) ? 'modern' : /(vibrante|chamativ|impactante|ousado|energ)/.test(q) ? 'bold' : null
  if (preset) {
    const sec = scope.by === 'kind' ? scope : undefined
    const k = (kind: Kind): Target => ({ by: 'kind', kind, section: sec?.section })
    if (preset === 'premium') {
      ops.push({ op: 'style', target: sec ? k('section') : { by: 'kind', kind: 'section' }, css: { 'background-color': '#0c0c0d', 'padding-top': '72px', 'padding-bottom': '72px' }, label: 'Fundo grafite escuro e mais respiro entre as seções' })
      if (!sec) ops.push({ op: 'style', target: { by: 'page' }, css: { 'background-color': '#0c0c0d' }, label: 'Fundo da página em grafite' })
      ops.push({ op: 'style', target: k('heading'), css: { color: '#f5f1e8', 'font-family': 'Georgia, "Times New Roman", serif', 'font-weight': '600', 'letter-spacing': '0.01em' }, label: 'Títulos em serifa elegante, tom marfim' })
      ops.push({ op: 'style', target: k('text'), css: { color: '#b9b4a8', 'line-height': '1.75' }, label: 'Textos mais leves e com linha folgada' })
      ops.push({ op: 'style', target: k('button'), css: { 'background-color': '#c9a24b', color: '#111111', 'border-radius': '4px', 'text-transform': 'uppercase', 'letter-spacing': '0.08em', 'font-weight': '600', border: '1px solid #c9a24b' }, label: 'Botões dourados, cantos retos e letras espaçadas' })
      ops.push({ op: 'style', target: k('image'), css: { 'border-radius': '4px' }, label: 'Imagens com cantos mais retos' })
      return { understood: true, operations: ops, reply: 'Deixei com cara de marca premium: fundo grafite, títulos serifados, botão dourado e mais espaço pra respirar.' }
    }
    if (preset === 'dark') {
      ops.push({ op: 'style', target: sec ? k('section') : { by: 'kind', kind: 'section' }, css: { 'background-color': '#0f0f12' }, label: 'Fundo escuro nas seções' })
      if (!sec) ops.push({ op: 'style', target: { by: 'page' }, css: { 'background-color': '#0f0f12' }, label: 'Fundo escuro na página' })
      ops.push(...darkTextOps('#0f0f12', scope))
      return { understood: true, operations: ops, reply: 'Pronto, modo escuro aplicado e os textos ajustados pra continuar legíveis.' }
    }
    if (preset === 'modern') {
      ops.push({ op: 'style', target: { by: 'page' }, css: { 'background-color': '#ffffff' }, label: 'Fundo branco limpo' })
      ops.push({ op: 'style', target: k('heading'), css: { 'font-weight': '800', 'letter-spacing': '-0.02em', color: '#111827' }, label: 'Títulos firmes e com letras mais juntas' })
      ops.push({ op: 'style', target: k('text'), css: { 'line-height': '1.7', color: '#4b5563' }, label: 'Textos com linha mais folgada' })
      ops.push({ op: 'style', target: k('button'), css: { 'border-radius': '12px', 'font-weight': '600', 'box-shadow': '0 6px 18px rgba(17,24,39,.14)' }, label: 'Botões arredondados com sombra suave' })
      ops.push({ op: 'style', target: k('image'), css: { 'border-radius': '16px' }, label: 'Imagens com cantos arredondados' })
      return { understood: true, operations: ops, reply: 'Deixei mais moderna e limpa: respiro nos textos, títulos firmes, botões e imagens arredondados.' }
    }
    ops.push({ op: 'style', target: k('heading'), css: { 'font-weight': '900', 'letter-spacing': '-0.03em' }, label: 'Títulos bem mais fortes' })
    ops.push({ op: 'style', target: k('button'), css: { 'background-color': '#2563eb', color: '#ffffff', 'border-radius': '999px', 'font-weight': '700', 'box-shadow': '0 10px 26px rgba(37,99,235,.45)', 'font-size': '18px', 'padding-left': '34px', 'padding-right': '34px' }, label: 'Botões azuis grandes, em pílula, com brilho' })
    return { understood: true, operations: ops, reply: 'Deixei mais chamativa: títulos fortes e botões grandes com brilho.' }
  }

  // background
  if (/(fundo|background|cor de fundo)/.test(q) && color) {
    const sec = scope
    ops.push({ op: 'style', target: sec.by === 'page' ? { by: 'kind', kind: 'section' } : sec, css: { 'background-color': color }, label: 'Troquei a cor de fundo' })
    if (sec.by === 'page') ops.push({ op: 'style', target: { by: 'page' }, css: { 'background-color': color }, label: 'Fundo geral da página' })
    ops.push(...darkTextOps(color, sec))
    said.push(sec.by === 'page' ? 'Troquei o fundo da página inteira' : 'Troquei o fundo dessa parte')
    return { understood: true, operations: ops, reply: said.join('. ') + ' e ajustei a cor dos textos pra ficarem legíveis.' }
  }

  // button changes
  if (target === 'button' || /bot[õo]es|bot[aã]o/.test(q)) {
    const t = ctx.hasSelection && /(esse|este)\s+bot[aã]o/.test(q) ? ({ by: 'selected' } as Target) : kindTarget('button', scope)
    const css: Record<string, string> = {}
    if (color && /(cor|fundo|para|pra|em|de)\b/.test(q) && !/texto d[oe]s? bot/.test(q)) { css['background-color'] = color; const l = luminance(color); css.color = l !== null && l > 0.55 ? '#111111' : '#ffffff'; css['border-color'] = color }
    if (/(maior|maiores|grande|grandes|aument)/.test(q)) { css['font-size'] = '18px'; css['padding-top'] = '16px'; css['padding-bottom'] = '16px'; css['padding-left'] = '36px'; css['padding-right'] = '36px' }
    if (/(menor|menores|pequen|diminu)/.test(q)) { css['font-size'] = '14px'; css['padding-top'] = '9px'; css['padding-bottom'] = '9px'; css['padding-left'] = '20px'; css['padding-right'] = '20px' }
    if (/(arredond|redond|p[ií]lula|pilula)/.test(q)) css['border-radius'] = /p[ií]lula|pilula|bem arredond|redondo/.test(q) ? '999px' : '14px'
    if (/(quadrad|reto|retos)/.test(q)) css['border-radius'] = '0px'
    if (/(sombra|destaque|brilho)/.test(q)) css['box-shadow'] = '0 10px 26px rgba(17,24,39,.28)'
    if (/(contorno|vazad|outline)/.test(q)) { css['background-color'] = 'transparent'; css['border'] = `2px solid ${color || '#111827'}`; css.color = color || '#111827' }
    if (/(negrito|bold|forte)/.test(q)) css['font-weight'] = '800'
    if (/(largo|largura toda|largura total|100%)/.test(q)) { css.display = 'block'; css.width = '100%'; css['text-align'] = 'center' }
    if (Object.keys(css).length) {
      ops.push({ op: 'style', target: t, css, label: 'Mudei o visual dos botões' })
      return { understood: true, operations: ops, reply: 'Pronto, atualizei os botões.' }
    }
  }

  // text color
  if (/(cor d[oe]s? (texto|letra|t[ií]tulo|bot|link)|letras?|textos?|t[ií]tulos?|links?)/.test(q) && color && /(para|pra|em|de|fique|deixe|mude|troque)/.test(q)) {
    const k = target || 'text'
    ops.push({ op: 'style', target: kindTarget(k, scope), css: { color }, label: 'Troquei a cor do texto' })
    return { understood: true, operations: ops, reply: 'Troquei a cor.' }
  }

  // size
  if (/(aument|maior|cresc|diminu|menor|reduz)/.test(q) && (target === 'heading' || target === 'text' || /(fonte|letra|texto)/.test(q))) {
    const k: Kind = target || 'text'
    const up = /(aument|maior|cresc)/.test(q)
    ops.push({ op: 'style', target: kindTarget(k, scope), css: k === 'heading' ? { 'font-size': up ? 'clamp(36px, 5vw, 56px)' : '28px' } : { 'font-size': up ? '19px' : '15px' }, label: up ? 'Aumentei o tamanho' : 'Diminuí o tamanho' })
    return { understood: true, operations: ops, reply: up ? 'Aumentei o tamanho do texto.' : 'Diminuí o tamanho do texto.' }
  }

  // alignment
  if (/(centraliz|centro|alinh)/.test(q)) {
    const align = /(esquerda)/.test(q) ? 'left' : /(direita)/.test(q) ? 'right' : 'center'
    const kinds: Kind[] = target ? [target] : ['heading', 'text']
    kinds.forEach(k => ops.push({ op: 'style', target: kindTarget(k, scope), css: { 'text-align': align }, label: `Alinhei ${align === 'center' ? 'ao centro' : align === 'left' ? 'à esquerda' : 'à direita'}` }))
    return { understood: true, operations: ops, reply: 'Alinhamento ajustado.' }
  }

  // images
  if (target === 'image' && /(arredond|redond|borda|sombra|cantos)/.test(q)) {
    const css: Record<string, string> = {}
    if (/(arredond|redond|cantos)/.test(q)) css['border-radius'] = '18px'
    if (/sombra/.test(q)) css['box-shadow'] = '0 14px 36px rgba(17,24,39,.22)'
    if (/borda/.test(q)) css.border = '1px solid #e5e7eb'
    ops.push({ op: 'style', target: kindTarget('image', scope), css, label: 'Mudei o visual das imagens' })
    return { understood: true, operations: ops, reply: 'Imagens atualizadas.' }
  }

  // spacing
  if (/(espa[cç]o|respiro|folga|padding|margem)/.test(q) && /(mais|aument|maior|menos|reduz|menor|diminu)/.test(q)) {
    const more = /(mais|aument|maior)/.test(q)
    ops.push({ op: 'style', target: scope.by === 'page' ? { by: 'kind', kind: 'section' } : scope, css: { 'padding-top': more ? '80px' : '32px', 'padding-bottom': more ? '80px' : '32px' }, label: more ? 'Mais espaço dentro das seções' : 'Menos espaço dentro das seções' })
    return { understood: true, operations: ops, reply: more ? 'Dei mais respiro pras seções.' : 'Compactei as seções.' }
  }

  return {
    understood: false,
    operations: [],
    reply: 'Esse pedido precisa da IA completa, que ainda não está conectada neste projeto. Sem ela eu faço coisas como: trocar o fundo ("fundo preto"), mexer nos botões ("botões maiores e arredondados"), deixar a página "mais premium", "mais moderna" ou no "modo escuro", e adicionar seções ("adicione depoimentos").',
  }
}
