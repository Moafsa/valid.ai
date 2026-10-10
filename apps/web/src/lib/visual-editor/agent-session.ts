/**
 * The editor's AI agent, browser side.
 *
 *  - AgentSession: the tools. Every tool runs on the REAL editor (GrapesJS components, the canvas' computed styles, its CSS rules),
 *    and says what really happened. A tool never answers "done" because it was asked to: it measures.
 *  - runAgent(): the loop. Ask the model for a turn, run the tools it called, hand the results back, repeat until it answers without
 *    a tool. It refuses to finish after changing the page without having checked it, and gives the problems it finds back to the model.
 *
 * The model itself runs on the server (/api/editor/agent): the API key never reaches the browser.
 */
import { STARTER_BLOCKS } from './starter-blocks'
import { ThemeSchema, type Kind } from './ai-types'
import {
  applyStyleToComps, clip, contentRoot, describePage, findLowContrast, findSections, fixContrast, freezeMotion, inside, isElement, kebab, kindOfEl,
  realChildren, runTheme, sanitizeHtml, stableId, txt, type EngineCtx, type Registry,
} from './ai-engine'
import { TOOL_NAMES, type AgentMsg, type Block } from './agent-tools'
import { pickSkills, skillText } from './design-skills'
import type { ResponsiveGuard, LayoutDrift } from './responsive-guard'
import { buildSiteProfile, checkMotion, detectWidgets, cssDrift, identityIssues, makeCarousel, profileText, themeDrift, widgetsText, type SiteProfile } from './site-context'

type Comp = any

export interface AgentChange { tool: string; label: string; detail?: string; comps: Comp[]; swatch?: string }

export class ToolError extends Error {}

interface ToolResult {
  data: unknown
  stepLabel: string
  stepDetail?: string
  modifies?: boolean
  label?: string
  detail?: string
  comps?: Comp[]
  swatch?: string
  /** a result that is a failure the model must react to */
  error?: boolean
  /** this tool reshaped the layout (so a phone check is due) */
  layout?: boolean
}

export interface ToolOutcome { content: string; isError: boolean; stepLabel: string; stepDetail?: string }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const MAX_RESULT = 12_000
/** Nothing a visitor can see (a transparent or 1px control kept only for the keyboard): it cannot "stick out". */
const isInvisible = (el: HTMLElement, cs: CSSStyleDeclaration, r: DOMRect) => cs.opacity === '0' || cs.visibility === 'hidden' || (r.width <= 2 && r.height <= 2)
const READ_ONLY = new Set(['get_page_outline', 'get_selection', 'inspect_element', 'find_elements', 'get_element_html', 'get_css_rules', 'find_widgets', 'get_site_style'])

const STYLE_PROPS = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'background-color', 'background-image', 'padding', 'margin', 'border-radius', 'box-shadow', 'display', 'position', 'width', 'max-width', 'text-align', 'opacity']

function cleanCss(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ToolError('"css" precisa ser um objeto como {"font-size":"48px"}.')
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 40)) {
    if (typeof v !== 'string' && typeof v !== 'number') continue
    out[k] = String(v)
  }
  if (!Object.keys(out).length) throw new ToolError('"css" está vazio.')
  return out
}

/** Raw CSS the agent wants to add: no remote imports, no script vectors, balanced braces, at least one rule that parses. */
function checkCss(css: string, win: Window): number {
  if (css.length > 20_000) throw new ToolError('CSS grande demais (máximo 20.000 caracteres). Divida em partes.')
  if (/@import|javascript:|expression\s*\(|<\s*\/?\s*(script|style)|behavior\s*:|-moz-binding/i.test(css)) throw new ToolError('Esse CSS usa algo não permitido (@import, javascript:, expression, tags).')
  for (const m of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) if (!/^(https:\/\/|data:image\/)/i.test(m[2].trim())) throw new ToolError(`url(${clip(m[2], 30)}) não permitido: só https:// ou data:image.`)
  let depth = 0
  for (const ch of css) { if (ch === '{') depth++; else if (ch === '}') depth--; if (depth < 0) break }
  if (depth !== 0) throw new ToolError(`CSS com chaves desbalanceadas (${depth > 0 ? 'falta fechar }' : 'sobra }'}). Corrija e envie de novo.`)
  const sheet = new (win as any).CSSStyleSheet()
  sheet.replaceSync(css)
  if (!sheet.cssRules.length) throw new ToolError('Nenhuma regra de CSS válida foi encontrada nesse texto.')
  return sheet.cssRules.length
}

function styleRules(list: CSSRuleList, acc: CSSStyleRule[] = []): CSSStyleRule[] {
  for (const r of Array.from(list)) {
    if ((r as CSSStyleRule).selectorText !== undefined) acc.push(r as CSSStyleRule)
    else if ((r as CSSGroupingRule).cssRules) styleRules((r as CSSGroupingRule).cssRules, acc)
  }
  return acc
}

export class AgentSession {
  changes: AgentChange[] = []
  /** a change was made after the last check_page */
  modifiedSinceCheck = false
  layoutTouched = false
  checkedAny = false
  lastIssueCount = 0
  toolCalls = 0
  private undoStack: { steps: number; change: number }[] = []
  private jsErrors: string[] = []
  private inserted: Comp[] = []
  /** carousels made in this task (container id -> comp, seconds per slide): check_page proves they move */
  private carousels = new Map<string, { comp: Comp; interval: number }>()
  /** the site's identity; measured when the task starts and again after the page is sent back to the original */
  profile: SiteProfile
  private reads = new Map<string, number>()
  /** elements that already stuck out past the screen before the agent touched anything: not its doing, never its job */
  private baseStick = new WeakSet<Element>()
  private newImages = new Set<Comp>()
  private baseContrast: Set<string>
  private um: any
  readonly startStack: number
  private off: () => void = () => {}

  constructor(public ctx: EngineCtx, public selected: Comp | null) {
    this.um = ctx.editor.UndoManager
    this.startStack = this.um.getStack().length
    const win = ctx.editor.Canvas.getDocument()?.defaultView as Window | undefined
    if (win) {
      const onErr = (e: ErrorEvent) => this.jsErrors.push(clip(`${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`, 200))
      const onRej = (e: PromiseRejectionEvent) => this.jsErrors.push(clip(`Promise rejeitada: ${String((e.reason && e.reason.message) || e.reason)}`, 200))
      win.addEventListener('error', onErr)
      win.addEventListener('unhandledrejection', onRej)
      this.off = () => { win.removeEventListener('error', onErr); win.removeEventListener('unhandledrejection', onRej) }
    }
    this.baseContrast = new Set(findLowContrast(ctx, selected).map(x => stableId(x.comp)))
    // the site's identity is measured NOW, before the first change: it is what every change is judged against
    let profile: SiteProfile
    try { profile = buildSiteProfile(ctx) } catch (e) { console.warn('[agent] site profile failed', e); profile = { mood: 'light', pageBg: '#ffffff', text: '#000000', surfaces: [], headingFont: 'sans-serif', bodyFont: 'sans-serif', palette: [] } }
    this.profile = profile
    try {
      const doc = this.doc, cw = doc.documentElement.clientWidth
      const root = contentRoot(ctx).getEl?.() as HTMLElement | undefined
      if (isElement(root)) for (const e of [root, ...Array.from(root.querySelectorAll('*') as NodeListOf<HTMLElement>)].slice(0, 6000)) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.right > cw + 2) this.baseStick.add(e) }
    } catch { /* optional */ }
  }

  /** What the model reads about the site's identity and its widgets, in its first message. */
  siteBrief(): string {
    let w = ''
    try { w = widgetsText(detectWidgets(this.ctx)) } catch (e) { console.warn('[agent] widget scan failed', e); w = 'Não foi possível analisar os widgets.' }
    let topic = ''
    try {
      const d = this.doc
      const h1 = clip((d.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim(), 110)
      const lang = (d.documentElement.getAttribute('lang') || '').trim() || 'pt-BR'
      topic = `CONTEÚDO DO SITE: ${h1 ? `a página principal diz "${h1}". ` : ''}Idioma: ${lang}. Todo texto novo deve falar do MESMO assunto, no mesmo idioma e no mesmo tom (formal, direto, informal) dos textos que já existem; nunca invente depoimentos de pessoas reais, preços ou números.\n\n`
    } catch { /* optional */ }
    return topic + `IDENTIDADE VISUAL DESTE SITE (medida na página; tudo que você criar ou mudar deve parecer feito pela mesma marca):\n${profileText(this.profile)}\n\nCARROSSÉIS E SLIDERS DETECTADOS (o site perdeu os scripts originais ao ser clonado):\n${w}`
  }

  dispose() { this.off() }

  get undoSteps(): number { return Math.max(0, this.um.getStack().length - this.startStack) }

  private get doc(): Document { return this.ctx.editor.Canvas.getDocument()! }
  private get win(): Window { return this.doc.defaultView! }

  /* ───────── helpers ───────── */

  private comp(id: unknown): Comp {
    if (typeof id !== 'string' || !id) throw new ToolError('Faltou o id do elemento.')
    const c = (this.ctx.editor.Components as any).allById?.()[id]
    if (!c) throw new ToolError(`Não existe elemento com id "${id}". Os ids deixam de valer quando o elemento é refeito ou removido: use find_elements ou get_page_outline.`)
    return c
  }

  /** With "only the selected", nothing outside it may be touched. */
  private scoped(list: Comp[], what = 'o elemento'): Comp[] {
    if (!this.selected) return list
    const ok = list.filter(c => inside(this.selected, c))
    if (list.length && !ok.length) throw new ToolError(`${what} está fora do elemento selecionado. O pedido é só para o que está selecionado (id ${stableId(this.selected)}).`)
    return ok
  }

  private protectedComp(c: Comp) {
    if (c === this.ctx.editor.getWrapper() || c === contentRoot(this.ctx)) throw new ToolError('Esse é o contêiner da página inteira e não pode ser removido ou refeito.')
  }

  private read(c: Comp, props: string[]): Record<string, string> {
    const el = c.getEl?.()
    const out: Record<string, string> = {}
    if (isElement(el)) { const cs = this.win.getComputedStyle(el); for (const p of props) out[p] = cs.getPropertyValue(p) }
    return out
  }

  private resolve(input: Record<string, any>, reg: Registry): Comp[] {
    if (Array.isArray(input.ids) && input.ids.length) return input.ids.slice(0, 300).map((id: string) => this.comp(id))
    if (input.kind) {
      const within = input.within ? this.comp(input.within) : null
      const q = typeof input.text_contains === 'string' ? input.text_contains.toLowerCase() : ''
      const out: Comp[] = []
      for (const [id, c] of reg.byId) {
        if (reg.kinds.get(id) !== input.kind) continue
        if (within && !inside(within, c)) continue
        if (q && !txt(c.getEl?.()).toLowerCase().includes(q)) continue
        out.push(c)
      }
      return out
    }
    throw new ToolError('Informe ids, kind ou page:true para dizer onde aplicar.')
  }

  private emptyRegistry(): Registry {
    return { byId: new Map(), kinds: new Map(), sectionOf: new Map(), sections: [], container: findSections(contentRoot(this.ctx)).container }
  }

  private place(html: string, where: string, targetId?: string): Comp {
    const first = (r: any) => (Array.isArray(r) ? r[0] : r)
    if (where === 'page-start' || where === 'page-end') {
      if (this.selected) throw new ToolError('O pedido é só para o elemento selecionado: use before, after, start ou end com target_id dentro dele.')
      const { container } = findSections(contentRoot(this.ctx))
      return first(container.components().add(html, { at: where === 'page-start' ? 0 : container.components().length }))
    }
    if (!targetId) throw new ToolError(`target_id é obrigatório para "${where}".`)
    const t = this.scoped([this.comp(targetId)], 'O alvo')[0]
    if (where === 'start' || where === 'end') return first(t.components().add(html, { at: where === 'start' ? 0 : t.components().length }))
    const parent = t.parent?.()
    if (!parent) throw new ToolError('Esse elemento não tem pai: não dá para inserir antes ou depois dele.')
    const idx = parent.components().models.indexOf(t)
    return first(parent.components().add(html, { at: where === 'before' ? idx : idx + 1 }))
  }

  /**
   * New page sections go into containers that often center and shrink their children (a flex column with align-items:center).
   * A section that did not ask for a width of its own gets the container's width (a max-width of its own is kept).
   */
  private fitWidth(c: Comp, askedWidth: boolean): { from: number; to: number } | null {
    const el = c?.getEl?.()
    if (askedWidth || !isElement(el) || !el.parentElement) return null
    const pw = el.parentElement.getBoundingClientRect().width
    const w = el.getBoundingClientRect().width
    if (pw < 320 || w >= pw * 0.9) return null
    applyStyleToComps(this.ctx, this.emptyRegistry(), [c], { width: '100%', 'box-sizing': 'border-box', 'align-self': 'stretch' })
    return { from: Math.round(w), to: Math.round(c.getEl().getBoundingClientRect().width) }
  }

  private stampTop(c: Comp) {
    try { if (c?.parent?.() === contentRoot(this.ctx) && !c.getAttributes?.()['data-vai-block-id']) c.addAttributes({ 'data-vai-block-id': crypto.randomUUID() }) } catch { /* ignore */ }
  }

  private describeNew(c: Comp) {
    const el = c?.getEl?.()
    if (!isElement(el)) return { id: c ? stableId(c) : null, size: null }
    const r = el.getBoundingClientRect()
    const counts: Record<string, number> = {}
    const walk = (cc: Comp, d: number) => {
      if (d > 12) return
      const e = cc.getEl?.()
      if (isElement(e)) { const k = kindOfEl(e, this.win.getComputedStyle(e)); if (k) counts[k] = (counts[k] || 0) + 1 }
      cc.components?.().forEach((x: Comp) => walk(x, d + 1))
    }
    walk(c, 0)
    return { id: stableId(c), size: { width: Math.round(r.width), height: Math.round(r.height) }, contains: counts, ...(r.height < 8 || r.width < 8 ? { warning: 'O elemento novo ficou sem tamanho visível. Confira o HTML (display, altura).' } : {}) }
  }

  /* ───────── the outline the model reads ───────── */

  outline(sectionId?: string, budget = 11_000): string {
    const { outline } = describePage(this.ctx, this.selected, { stable: true })
    const secs = sectionId ? outline.sections.filter(s => s.id === sectionId) : outline.sections
    if (sectionId && !secs.length) throw new ToolError(`Não há seção com id "${sectionId}". Veja os ids em get_page_outline.`)
    const node = (n: any) => Object.fromEntries(Object.entries({ id: n.id, kind: n.kind, text: n.text, color: n.color, size: n.size, weight: n.weight, bg: n.bg, radius: n.radius }).filter(([, v]) => v !== undefined && v !== ''))
    const build = (per: number) => JSON.stringify({
      page: outline.page, palette: outline.palette, counts: outline.counts, selected: outline.selected,
      sections: secs.map(s => ({ id: s.id, tag: s.tag, title: s.title, height: s.height, bg: s.bg, kinds: s.kinds, listed: Math.min(s.nodes.length, per), total_elements: s.nodes.length + (s.more || 0), nodes: s.nodes.slice(0, per).map(node) })),
    })
    for (const per of [22, 14, 9, 6, 4, 2]) { const j = build(per); if (j.length <= budget || per === 2) return j }
    return build(2)
  }

  /* ───────── dispatcher ───────── */

  async exec(name: string, input: Record<string, any>): Promise<ToolOutcome> {
    this.toolCalls++
    if (!TOOL_NAMES.has(name)) return { content: `Ferramenta desconhecida "${name}". Use só estas: ${[...TOOL_NAMES].join(', ')}.`, isError: true, stepLabel: 'Ferramenta inválida' }
    if (input && input.__invalid_json) return { content: 'Os argumentos da chamada não eram um JSON válido. Envie de novo com JSON correto.', isError: true, stepLabel: 'Pedido mal formado' }
    if (READ_ONLY.has(name)) {
      const key = `${name}|${JSON.stringify(input || {})}|${this.changes.length}`
      const n = (this.reads.get(key) || 0) + 1
      this.reads.set(key, n)
      if (n >= 2) return { content: JSON.stringify({ aviso: 'Você já fez exatamente esta leitura e nada mudou na página desde então: o resultado seria o mesmo. Não repita. Decida: faça a mudança (set_styles, replace_element, make_carousel...) ou explique ao usuário o que não dá para fazer.' }), isError: false, stepLabel: 'Leitura repetida, pulei' }
    }
    const before = this.um.getStack().length
    freezeMotion(this.doc, true)
    try {
      const r = await this.dispatch(name, input || {})
      if (r.modifies) {
        const steps = Math.max(0, this.um.getStack().length - before)
        this.changes.push({ tool: name, label: r.label || r.stepLabel, detail: r.detail, comps: (r.comps || []).slice(0, 80), swatch: r.swatch })
        this.undoStack.push({ steps, change: this.changes.length - 1 })
        this.modifiedSinceCheck = true
        if (r.layout) this.layoutTouched = true
      }
      let content = typeof r.data === 'string' ? r.data : JSON.stringify(r.data)
      if (content.length > MAX_RESULT + 3000) content = content.slice(0, MAX_RESULT + 3000) + '…(cortado)'
      return { content, isError: !!r.error, stepLabel: r.stepLabel, stepDetail: r.stepDetail }
    } catch (e: any) {
      if (e instanceof ToolError) return { content: e.message, isError: true, stepLabel: 'Não deu certo' }
      console.warn('[agent] tool failed', name, e)
      return { content: `Falha inesperada em ${name}: ${clip(String(e?.message || e), 200)}. Tente de outra forma.`, isError: true, stepLabel: 'Não deu certo' }
    } finally {
      freezeMotion(this.doc, false)
    }
  }

  private async dispatch(name: string, i: Record<string, any>): Promise<ToolResult> {
    const ed = this.ctx.editor
    switch (name) {
      case 'get_page_outline':
        return { data: this.outline(i.section_id), stepLabel: 'Lendo a estrutura da página' }

      case 'get_selection': {
        if (!this.selected) return { data: { selected: null }, stepLabel: 'Olhando a seleção' }
        return { data: this.inspect(this.selected), stepLabel: 'Olhando o que está selecionado' }
      }

      case 'inspect_element':
        return { data: this.inspect(this.comp(i.id)), stepLabel: 'Examinando um elemento' }

      case 'find_elements': {
        const limit = Math.min(80, Math.max(1, Number(i.limit) || 30))
        const within = i.within ? this.comp(i.within) : null
        const q = typeof i.text_contains === 'string' ? i.text_contains.toLowerCase() : ''
        const rows: any[] = []
        if (i.tag) {
          const tag = String(i.tag).toLowerCase()
          const all: Comp[] = Object.values((ed.Components as any).allById())
          for (const c of all) {
            if (rows.length >= limit) break
            const el = c.getEl?.()
            if (!isElement(el) || el.tagName.toLowerCase() !== tag || (within && !inside(within, c))) continue
            const cs = this.win.getComputedStyle(el)
            if (cs.display === 'none') continue
            const kind = kindOfEl(el, cs)
            if (i.kind && kind !== i.kind) continue
            if (q && !txt(el).toLowerCase().includes(q)) continue
            rows.push({ id: stableId(c), kind, tag, text: clip(txt(el), 80) })
          }
        } else {
          const { registry } = describePage(this.ctx, this.selected, { stable: true })
          for (const [id, c] of registry.byId) {
            if (rows.length >= limit) break
            const kind = registry.kinds.get(id)
            if (i.kind && kind !== i.kind) continue
            if (within && !inside(within, c)) continue
            const el = c.getEl?.()
            if (q && !txt(el).toLowerCase().includes(q)) continue
            rows.push({ id, kind, tag: isElement(el) ? el.tagName.toLowerCase() : '', text: clip(txt(el), 80), section: registry.sectionOf.get(id) })
          }
        }
        return { data: { count: rows.length, results: rows }, stepLabel: 'Procurando elementos', stepDetail: `${rows.length} encontrados` }
      }

      case 'set_styles': {
        const css = cleanCss(i.css)
        const page = i.page === true
        let comps: Comp[]
        let reg: Registry
        if (page) {
          if (this.selected) throw new ToolError('O pedido é só para o elemento selecionado: use ids dentro dele em vez de page.')
          reg = describePage(this.ctx, null, { stable: true }).registry
          comps = [ed.getWrapper()!]
        } else if (i.kind) {
          reg = describePage(this.ctx, this.selected, { stable: true }).registry
          comps = this.resolve(i, reg)
        } else { reg = this.emptyRegistry(); comps = this.resolve(i, reg) }
        comps = this.scoped(comps)
        if (!comps.length) throw new ToolError('Nenhum elemento encontrado com esse filtro. Use find_elements para conferir.')
        const props = Object.keys(css).map(kebab)
        const probe = comps.slice(0, 3).map(c => ({ c, before: this.read(c, props) }))
        // text-like elements carry typography that their inner spans override: let the engine follow it down
        const textual = (['heading', 'text', 'button', 'link'] as Kind[]).find(k => k === i.kind) || (comps.some(c => { const e = c.getEl?.(); const k = isElement(e) ? kindOfEl(e, this.win.getComputedStyle(e)) : null; return k === 'heading' || k === 'text' || k === 'button' || k === 'link' }) ? 'text' as Kind : undefined)
        const r = applyStyleToComps(this.ctx, reg, comps, css, { page, kind: textual })
        const sample = probe.map(({ c, before }) => {
          const after = this.read(c, props)
          return { id: stableId(c), changed: Object.fromEntries(props.filter(p => before[p] !== after[p]).map(p => [p, `${clip(before[p], 40)} -> ${clip(after[p], 40)}`])) }
        })
        if (!r.changed) return { data: `Nada mudou na tela para ${comps.length} elemento(s). O CSS original da página provavelmente tem prioridade ou o valor não faz efeito nesse elemento. Use inspect_element ou get_css_rules para entender e tente add_css com um seletor mais específico.`, error: true, stepLabel: i.label || 'Ajustando estilos', stepDetail: 'sem efeito' }
        const drift = cssDrift(this.profile, JSON.stringify(css))
        return { data: this.withQuick({ changed_elements: r.changed, requested_elements: comps.length, sample, ...(drift ? { identity_note: drift } : {}) }), modifies: true, label: i.label, detail: `${r.changed} ${r.changed === 1 ? 'elemento' : 'elementos'}`, comps: r.touched, stepLabel: i.label || 'Ajustando estilos', stepDetail: `${r.changed} elementos` }
      }

      case 'apply_theme': {
        const parsed = ThemeSchema.safeParse(i.theme)
        if (!parsed.success) throw new ToolError(`Tema inválido: ${parsed.error.issues.map(x => `${x.path.join('.')}: ${x.message}`).join('; ')}`)
        const reg = describePage(this.ctx, this.selected, { stable: true }).registry
        const res = runTheme(this.ctx, reg, parsed.data, this.selected)
        if (!res.changed) return { data: 'O tema não mudou nada na tela. A página já está assim ou o CSS original impede. Tente set_styles em elementos específicos.', error: true, stepLabel: i.label || 'Repaginando a página', stepDetail: 'sem efeito' }
        const drift = themeDrift(this.profile, parsed.data)
        return { data: this.withQuick({ changed_elements: res.changed, parts: res.parts, ...(drift ? { identity_note: drift } : {}) }), modifies: true, label: i.label || 'Repaginei o visual', detail: res.parts.slice(0, 5).join(', '), comps: res.touched, stepLabel: i.label || 'Repaginando a página', stepDetail: res.parts.slice(0, 3).join(', '), layout: !!parsed.data.density }
      }

      case 'set_text': {
        const c = this.scoped([this.comp(i.id)], 'O elemento')[0]
        if (typeof i.text !== 'string') throw new ToolError('Faltou o texto.')
        const el = c.getEl?.()
        const before = clip(txt(el), 120)
        const kids = realChildren(c).length
        c.components(i.text.replace(/</g, '&lt;'))
        const after = clip(txt(c.getEl?.()), 120)
        return { data: { id: stableId(c), before, after, ...(kids ? { note: `O elemento tinha ${kids} elementos dentro; foram trocados pelo texto.` } : {}) }, modifies: true, label: i.label, detail: clip(i.text, 60), comps: [c], stepLabel: i.label || 'Trocando o texto' }
      }

      case 'set_attributes': {
        const c = this.scoped([this.comp(i.id)], 'O elemento')[0]
        if (!i.attrs || typeof i.attrs !== 'object') throw new ToolError('Faltou "attrs".')
        const done: string[] = []
        for (const [k, v] of Object.entries(i.attrs as Record<string, string | null>)) {
          if (!/^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(k) || /^on/i.test(k)) continue
          if (v === null) { c.removeAttributes(k); done.push(k); continue }
          if (/^(href|src)$/i.test(k) && /^\s*javascript:/i.test(String(v))) continue
          c.addAttributes({ [k]: String(v) })
          if (k === 'src' && c.get('type') === 'image') {
            c.set('src', String(v))
            try { c.removeAttributes(['srcset', 'sizes']) } catch { /* nothing to remove */ }
            this.newImages.add(c)
          }
          done.push(k)
        }
        if (!done.length) throw new ToolError('Nenhum atributo permitido foi aplicado (on* e javascript: são recusados).')
        return { data: { id: stableId(c), applied: done }, modifies: true, label: i.label, detail: done.join(', '), comps: [c], stepLabel: i.label || 'Ajustando atributos' }
      }

      case 'insert_html': {
        const el = typeof i.html === 'string' ? sanitizeHtml(i.html) : null
        if (!el) throw new ToolError('O HTML precisa ter exatamente UM elemento no topo (por exemplo uma <section>), sem script.')
        const nc = this.place(el.outerHTML, i.where || 'page-end', i.target_id)
        if (!nc) throw new ToolError('O editor não conseguiu inserir esse HTML.')
        this.stampTop(nc)
        this.inserted.push(nc)
        const fit = ['before', 'after', 'page-start', 'page-end'].includes(i.where || 'page-end') ? this.fitWidth(nc, /(^|;)\s*width\s*:/i.test(el.getAttribute('style') || '')) : null
        const fixedContrast = this.autoContrast(nc)
        const info = this.withQuick({ ...this.describeNew(nc), ...(fit ? { adjusted: `a seção ocupava ${fit.from}px e foi esticada para a largura das outras (${fit.to}px)` } : {}), ...(fixedContrast ? { auto_fixed_contrast: `${fixedContrast} textos difíceis de ler foram ajustados sozinhos` } : {}) }, [nc])
        nc.getEl?.()?.scrollIntoView?.({ block: 'center' })
        return { data: info, modifies: true, label: i.label, comps: [nc], stepLabel: i.label || 'Criando uma seção nova', layout: true }
      }

      case 'add_block': {
        const b = STARTER_BLOCKS.find(x => x.id === i.block)
        if (!b) throw new ToolError(`Seção "${i.block}" não existe. Disponíveis: ${STARTER_BLOCKS.map(x => x.id).join(', ')}.`)
        const el = sanitizeHtml(b.content)
        if (!el) throw new ToolError('Essa seção pronta não pôde ser carregada.')
        const nc = this.place(el.outerHTML, i.where || 'page-end', i.target_id)
        this.stampTop(nc)
        this.inserted.push(nc)
        this.fitWidth(nc, false)
        this.autoContrast(nc)
        return { data: this.withQuick(this.describeNew(nc), [nc]), modifies: true, label: i.label || `Adicionei a seção "${b.label}"`, comps: [nc], stepLabel: i.label || `Adicionando "${b.label}"`, layout: true }
      }

      case 'replace_element': {
        const c = this.scoped([this.comp(i.id)], 'O elemento')[0]
        this.protectedComp(c)
        const el = typeof i.html === 'string' ? sanitizeHtml(i.html) : null
        if (!el) throw new ToolError('O HTML precisa ter exatamente UM elemento no topo, sem script.')
        const bid = c.getAttributes?.()['data-vai-block-id']
        if (bid) el.setAttribute('data-vai-block-id', bid)
        const oldId = stableId(c)
        const res = c.replaceWith(el.outerHTML)
        const nc = Array.isArray(res) ? res[0] : res
        if (!nc) throw new ToolError('O editor não conseguiu trocar o elemento.')
        this.inserted.push(nc)
        this.fitWidth(nc, /(^|;)\s*width\s*:/i.test(el.getAttribute('style') || ''))
        const fixedContrast = this.autoContrast(nc)
        return { data: this.withQuick({ replaced: oldId, ...this.describeNew(nc), ...(fixedContrast ? { auto_fixed_contrast: `${fixedContrast} textos difíceis de ler foram ajustados sozinhos` } : {}) }, [nc]), modifies: true, label: i.label, comps: [nc], stepLabel: i.label || 'Refazendo um elemento', layout: true }
      }

      case 'remove_elements': {
        if (!Array.isArray(i.ids) || !i.ids.length) throw new ToolError('Faltou "ids".')
        const comps = this.scoped(i.ids.slice(0, 20).map((id: string) => this.comp(id)), 'O elemento')
        comps.forEach(c => this.protectedComp(c))
        comps.forEach(c => c.remove())
        return { data: { removed: comps.length }, modifies: true, label: i.label || `Removi ${comps.length} ${comps.length === 1 ? 'elemento' : 'elementos'}`, comps: [], stepLabel: i.label || 'Removendo elementos', layout: true }
      }

      case 'move_element': {
        const c = this.scoped([this.comp(i.id)], 'O elemento')[0]
        const t = this.scoped([this.comp(i.target_id)], 'O destino')[0]
        this.protectedComp(c)
        if (inside(c, t)) throw new ToolError('Não dá para mover um elemento para dentro dele mesmo.')
        const where = i.where
        if (where === 'start' || where === 'end') c.move(t, { at: where === 'start' ? 0 : t.components().length })
        else {
          const parent = t.parent?.()
          if (!parent) throw new ToolError('O destino não tem pai.')
          const idx = parent.components().models.indexOf(t)
          c.move(parent, { at: where === 'before' ? idx : idx + 1 })
        }
        return { data: { moved: stableId(c), next_to: stableId(t), where }, modifies: true, label: i.label, comps: [c], stepLabel: i.label || 'Reorganizando a página', layout: true }
      }

      case 'get_element_html': {
        const c = this.comp(i.id)
        const max = Math.min(20_000, Math.max(500, Number(i.max_chars) || 6000))
        const html = String(c.toHTML?.() || '')
        const css = ed.Css as any
        const rules: Record<string, unknown> = {}
        const own = css.getRule?.(`#${stableId(c)}`)
        if (own) rules[`#${stableId(c)}`] = own.getStyle()
        for (const cls of (c.getClasses?.() || []).slice(0, 8)) { const r = css.getRule?.(`.${cls}`); if (r) rules[`.${cls}`] = r.getStyle() }
        return { data: { id: stableId(c), html: clip(html, max), truncated: html.length > max, css_rules: rules }, stepLabel: 'Lendo o código do elemento' }
      }

      case 'get_css_rules': {
        const q = typeof i.contains === 'string' ? i.contains.toLowerCase() : ''
        const limit = Math.min(40, Math.max(1, Number(i.limit) || 15))
        const all: any[] = (ed.Css as any).getAll().models
        const rows: any[] = []
        let total = 0
        for (const r of all) {
          const sel = String(r.selectorsToString?.() || '')
          const st = r.getStyle?.() || {}
          const js = JSON.stringify(st)
          if (q && !sel.toLowerCase().includes(q) && !js.toLowerCase().includes(q)) continue
          total++
          if (rows.length < limit) rows.push({ selector: clip(sel, 120), media: r.getAtRule?.() || undefined, style: clip(js, 260) })
        }
        return { data: { total_matches: total, rules: rows }, stepLabel: 'Consultando o CSS da página', stepDetail: `${total} regras` }
      }

      case 'add_css': {
        if (typeof i.css !== 'string' || !i.css.trim()) throw new ToolError('Faltou o CSS.')
        const parsedRules = checkCss(i.css, this.win)
        const css = ed.Css as any
        const before = css.getAll().length
        css.addRules(i.css)
        const added = css.getAll().length - before
        const sheet = new (this.win as any).CSSStyleSheet()
        sheet.replaceSync(i.css)
        // the editor saves the page block by block: a rule is stored only when it reaches elements inside those blocks
        const blocksRoot = contentRoot(this.ctx).getEl?.() as HTMLElement | undefined
        const selectors = styleRules(sheet.cssRules).slice(0, 6).map(r => {
          let n = 0
          try { n = Array.from(this.doc.querySelectorAll(r.selectorText.replace(/:(hover|focus|active|focus-visible|visited|before|after)\b/g, ''))).filter(e => !blocksRoot || blocksRoot.contains(e)).length } catch { n = -1 }
          return { selector: clip(r.selectorText, 80), matches: n }
        })
        let verified: unknown
        if (i.verify?.selector && i.verify?.property) {
          try {
            const el = this.doc.querySelector(i.verify.selector)
            verified = el ? { selector: i.verify.selector, property: i.verify.property, value: this.win.getComputedStyle(el).getPropertyValue(i.verify.property) } : { selector: i.verify.selector, error: 'nenhum elemento encontrado' }
          } catch { verified = { selector: i.verify.selector, error: 'seletor inválido' } }
        }
        if (added <= 0) return { data: 'O editor não registrou nenhuma regra nova. Confira a sintaxe do CSS.', error: true, stepLabel: i.label || 'Escrevendo CSS', stepDetail: 'sem efeito' }
        const silent = selectors.length > 0 && selectors.every(s => s.matches === 0)
        const cdrift = cssDrift(this.profile, i.css)
        return { data: { rules_in_text: parsedRules, rules_added: added, selectors, ...(cdrift ? { identity_note: cdrift } : {}), ...(verified ? { verified } : {}), ...(silent ? { warning: 'Nenhum seletor encontrou elementos da página agora. A regra só é salva junto com a página se algum elemento usar a classe (por exemplo uma seção nova com class="..."); regras em body, html ou contêineres externos não são salvas.' } : {}) }, modifies: true, label: i.label || 'Acrescentei CSS à página', detail: `${added} regras`, comps: [], stepLabel: i.label || 'Escrevendo CSS', stepDetail: `${added} regras`, layout: true }
      }

      case 'get_site_style':
        return { data: { identidade: this.profile, resumo: profileText(this.profile) }, stepLabel: 'Lendo a identidade visual do site' }

      case 'find_widgets': {
        const list = detectWidgets(this.ctx)
        return { data: { carrosseis: list, resumo: widgetsText(list) }, stepLabel: 'Procurando carrosséis', stepDetail: list.length ? `${list.length} encontrado${list.length > 1 ? 's' : ''}` : 'nenhum' }
      }

      case 'make_carousel': {
        const c = this.scoped([this.comp(i.container_id)], 'O contêiner')[0]
        this.protectedComp(c)
        const hexRgb = (h: string) => { const m = /^#([0-9a-f]{6})$/i.exec(h); return m ? [0, 2, 4].map(k => parseInt(m[1].slice(k, k + 2), 16)) : null }
        const t = hexRgb(this.profile.text)
        let made: ReturnType<typeof makeCarousel>
        try {
          made = makeCarousel(this.ctx, c, {
            interval: typeof i.interval_s === 'number' ? i.interval_s : 5, dots: i.dots !== false, pauseOnHover: i.pause_on_hover !== false,
            accent: this.profile.accent || this.profile.text, muted: t ? `rgba(${t[0]},${t[1]},${t[2]},.35)` : undefined,
          })
        } catch (e: any) { throw new ToolError(String(e?.message || e)) }
        this.carousels.set(i.container_id, { comp: c, interval: made.interval })
        if (made.dotsMode === 'originais') { try { const cw = this.doc.documentElement.clientWidth; for (const e of Array.from(this.doc.querySelectorAll('.vaic-dot')) as HTMLElement[]) if (e.getBoundingClientRect().right > cw + 2) this.baseStick.add(e) } catch { /* optional */ } }
        const mot = await checkMotion(this.ctx, c, Math.min(10, made.interval + 1.5))
        return {
          data: { carrossel: { slides: made.slides, segundos_por_slide: made.interval, bolinhas: made.dotsMode === 'originais' ? 'as bolinhas originais do site foram religadas' : made.dotsMode === 'novas' ? 'bolinhas novas criadas' : 'sem bolinhas', setas_mortas_escondidas: made.hiddenControls, id: i.container_id }, verificacao: mot, ...(mot.verdict === 'gira' ? {} : { hint: 'O carrossel não girou na observação. Veja find_widgets e check_motion e corrija antes de terminar.' }) },
          modifies: true, label: i.label || `Carrossel de ${made.slides} slides funcionando`, comps: [c], stepLabel: i.label || 'Montando o carrossel', stepDetail: `${made.slides} slides, ${made.interval}s cada`, layout: true, error: mot.verdict !== 'gira',
        }
      }

      case 'check_motion': {
        const c = this.comp(i.container_id)
        const known = this.carousels.get(i.container_id)
        const secs = typeof i.seconds === 'number' ? i.seconds : (known ? known.interval + 1.5 : 6)
        const mot = await checkMotion(this.ctx, c, secs)
        return { data: mot, stepLabel: 'Observando o carrossel', stepDetail: mot.verdict === 'gira' ? 'está girando' : mot.verdict, error: mot.verdict !== 'gira' }
      }

      case 'restore_original_page': {
        if (this.selected) throw new ToolError('O pedido é só para o elemento selecionado: restaurar a página inteira mexeria fora dele.')
        const pageId = this.ctx.pageId
        if (!pageId) throw new ToolError('Não há como ler o original desta página aqui.')
        const root = contentRoot(this.ctx)
        const blocks = (root.components().models as Comp[]).filter(m => m.get?.('type') !== 'textnode')
        // First every edit the editor holds as a CSS rule goes (what is left is the page's own CSS, i.e. the original look); only THEN
        // the original sections go in: their inline styles (the dark section backgrounds) become rules of the editor as they are added
        const css = this.ctx.editor.Css as any
        const before = css.getAll().length
        try { css.clear() } catch { for (const r of [...css.getAll().models]) css.remove(r) }
        try { (this.ctx.editor.getWrapper?.() as any)?.setStyle?.({}) } catch { /* optional */ }
        let restored = 0
        const skipped: string[] = []
        for (let k = 0; k < blocks.length; k++) {
          const blk = blocks[k]
          try {
            const o = await this.originalOf(blk)
            const el = sanitizeHtml(o.html.replace(/^\s*(<link[^>]*>\s*)+/i, ''))
            if (!el) { skipped.push(String(o.blockId || k)); continue }
            const bid = blk.getAttributes?.()['data-vai-block-id'] || o.blockId
            if (bid) el.setAttribute('data-vai-block-id', String(bid))
            if (this.ctx.legacy) blk.components(el.outerHTML); else blk.replaceWith(el.outerHTML)
            restored++
          } catch (e: any) { skipped.push(`${k}`) }
        }
        if (!restored) throw new ToolError('Não consegui restaurar nenhuma seção a partir do original.')
        this.carousels.clear()
        try { this.profile = buildSiteProfile(this.ctx) } catch { /* keep the earlier one */ }
        try { const cw = this.doc.documentElement.clientWidth; const r = root.getEl?.() as HTMLElement | undefined; if (isElement(r)) for (const e of [r, ...Array.from(r.querySelectorAll('*') as NodeListOf<HTMLElement>)].slice(0, 6000)) if (e.getBoundingClientRect().right > cw + 2) this.baseStick.add(e) } catch { /* optional */ }
        return { data: this.withQuick({ secoes_restauradas: restored, de: blocks.length, ...(skipped.length ? { nao_restauradas: skipped } : {}), regras_de_css_descartadas: before, proximo_passo: 'A página voltou ao original. Leia get_site_style de novo (a identidade agora é a do original) e aplique o pedido do usuário por cima.' }), modifies: true, label: i.label || 'Devolvi a página inteira ao visual do original', comps: [], stepLabel: i.label || 'Restaurando a página original', stepDetail: `${restored} seções`, layout: true }
      }

      case 'get_design_skill':
        return { data: skillText(i.names), stepLabel: 'Lendo uma skill de frontend', stepDetail: Array.isArray(i.names) ? i.names.join(', ') : 'lista' }

      case 'get_original_html': {
        const blk = this.topBlock(this.comp(i.id))
        const o = await this.originalOf(blk)
        const max = Math.min(12_000, Math.max(500, Number(i.max_chars) || 6000))
        const needle = typeof i.around === 'string' ? i.around.trim() : ''
        const at = needle ? o.html.toLowerCase().indexOf(needle.toLowerCase()) : -1
        if (needle && at < 0) throw new ToolError(`"${clip(needle, 40)}" não aparece no original desta seção (${o.html.length} caracteres). Leia sem "around" ou use outro trecho.`)
        const from = at < 0 ? 0 : Math.max(0, at - Math.min(900, Math.floor(max / 4)))
        return { data: { secao: o.blockId, tamanho_total: o.html.length, ...(at >= 0 ? { a_partir_do_caractere: from, ao_redor_de: needle } : {}), html: o.html.slice(from, from + max), ...(o.html.length > from + max ? { cortado: true } : {}) }, stepLabel: 'Lendo como a seção era no original', stepDetail: needle || undefined }
      }

      case 'restore_original_block': {
        const c = this.comp(i.id)
        const blk = this.topBlock(c)
        if (this.selected && blk !== this.selected && !inside(this.selected, blk)) throw new ToolError('O pedido é só para o elemento selecionado: restaurar a seção inteira mexeria fora dele.')
        this.protectedComp(blk)
        const o = await this.originalOf(blk)
        const el = sanitizeHtml(o.html.replace(/^\s*(<link[^>]*>\s*)+/i, ''))
        if (!el) throw new ToolError('O original dessa seção não pôde ser carregado (precisa ter um único elemento no topo).')
        const bid = blk.getAttributes?.()['data-vai-block-id'] || o.blockId
        if (bid) el.setAttribute('data-vai-block-id', String(bid))
        const oldId = stableId(blk)
        // legacy pages: the block is the editor's own <section> wrapper and the cloned section lives inside it (saving keeps only the inside),
        // so the wrapper stays and its content is swapped; with a shell the block IS the cloned section and is replaced whole
        let nc: Comp
        if (this.ctx.legacy) { blk.components(el.outerHTML); nc = blk } else { const res = blk.replaceWith(el.outerHTML); nc = Array.isArray(res) ? res[0] : res }
        if (!nc) throw new ToolError('O editor não conseguiu restaurar a seção.')
        const droppedRules = (() => { try { const r = nc.getEl?.(); return isElement(r) ? this.dropEditsOnlyFor(r) : 0 } catch { return 0 } })()
        // whatever the ORIGINAL already had sticking out is not a problem of this restore
        try { const cw = this.doc.documentElement.clientWidth; const r = nc.getEl?.() as HTMLElement | undefined; if (isElement(r)) for (const e of [r, ...Array.from(r.querySelectorAll('*') as NodeListOf<HTMLElement>)]) if (e.getBoundingClientRect().right > cw + 2) this.baseStick.add(e) } catch { /* optional */ }
        return { data: this.withQuick({ restaurada: oldId, novo_id: stableId(nc), edicoes_de_css_descartadas: droppedRules, ...this.describeNew(nc), proximo_passo: 'A seção voltou ao visual do original. Agora aplique o pedido por cima (por exemplo find_widgets e make_carousel), mantendo esse visual.' }), modifies: true, label: i.label || 'Restaurei a seção como era no site original', comps: [nc], stepLabel: i.label || 'Restaurando a seção original', layout: true }
      }

      case 'check_page':
        return await this.check(i.viewport)

      case 'undo_last_change': {
        const last = this.undoStack.pop()
        if (!last) throw new ToolError('Não há nenhuma mudança feita nesta tarefa para desfazer.')
        for (let k = 0; k < last.steps; k++) this.um.undo()
        const ch = this.changes.splice(last.change, 1)[0]
        if (ch?.tool === 'make_carousel') for (const [id, c] of [...this.carousels]) if (ch.comps.includes(c.comp)) this.carousels.delete(id)
        this.modifiedSinceCheck = true
        return { data: { undone: ch?.label || 'último passo', steps: last.steps }, stepLabel: 'Desfazendo o último passo', stepDetail: ch?.label }
      }
    }
    throw new ToolError(`Ferramenta "${name}" sem implementação.`)
  }

  /* ───────── the page as it was cloned ───────── */

  /**
   * The editor keeps every edit as a rule in its CSS composer, on top of the page's own CSS. When a block goes back to the original,
   * the edits aimed at classes that only that block uses must go too, or they dress the restored block in the old (wrong) colors.
   * Classes shared with the rest of the page stay: restoring one section must not undo edits made elsewhere.
   */
  private dropEditsOnlyFor(root: HTMLElement) {
    const css = this.ctx.editor.Css as any
    const used = new Set<string>(), outside = new Set<string>()
    const add = (e: Element, into: Set<string>) => e.classList.forEach(c => into.add(c))
    add(root, used); root.querySelectorAll('*').forEach(e => add(e, used))
    this.doc.body.querySelectorAll('*').forEach(e => { if (e !== root && !root.contains(e)) add(e, outside) })
    const mine = new Set([...used].filter(c => !outside.has(c) && !/^vaic/.test(c)))
    let n = 0
    for (const r of [...css.getAll().models] as any[]) {
      let text = ''
      try { text = String(r.selectorsToString?.() || '') } catch { /* ignore */ }
      const classes = [...text.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(m => m[1])
      if (classes.length && classes.every(c => mine.has(c))) { css.remove(r); n++ }
    }
    return n
  }


  /** The top-level block (a saved section) an element lives in. */
  private topBlock(c: Comp): Comp {
    const root = contentRoot(this.ctx)
    let b = c
    while (b?.parent?.() && b.parent() !== root) b = b.parent()
    if (!b || b.parent?.() !== root) throw new ToolError('Esse elemento não está dentro de uma seção da página.')
    return b
  }

  private async originalOf(block: Comp): Promise<{ html: string; blockId: string }> {
    const pageId = this.ctx.pageId
    if (!pageId) throw new ToolError('Não há como ler o original desta página aqui.')
    const root = contentRoot(this.ctx)
    const index = (root.components().models as Comp[]).filter(m => m.get?.('type') !== 'textnode').indexOf(block)
    const attr = block.getAttributes?.()['data-vai-block-id']
    const q = new URLSearchParams({ pageId, ...(attr ? { blockId: String(attr) } : { index: String(index) }) })
    let res = await fetch(`/api/editor/original?${q}`, { cache: 'no-store' })
    // a block added or renamed after the clone has no id in the original: the same position is the best guess
    if (res.status === 404 && attr && index >= 0) res = await fetch(`/api/editor/original?${new URLSearchParams({ pageId, index: String(index) })}`, { cache: 'no-store' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new ToolError(j.error || 'Não consegui ler o original desta seção.') }
    const j = await res.json()
    if (typeof j.html !== 'string' || !j.html.trim()) throw new ToolError('O original desta seção está vazio.')
    return { html: j.html, blockId: String(j.id || attr || '') }
  }

  private guard(): ResponsiveGuard | undefined { return (this.ctx.editor as any).__guard }

  private driftLines(d: LayoutDrift): string[] {
    const out: string[] = []
    if (d.overflow) out.push(`- A página rola para o lado: ${d.overflow.now}px de conteúdo numa tela de ${d.width}px (o original tem ${d.overflow.original}px).`)
    for (const e of d.elements) out.push(`- ${e.label}${e.id ? ` (id ${e.id})` : ''}: ${e.prop === 'display' ? 'no original fica' : 'no original está'} ${e.original}, agora ${e.prop === 'display' ? 'fica' : 'está'} ${e.now}.`)
    return out
  }

  /**
   * Which sections of the page no longer look like the ORIGINAL: measured by how many of the original section's CSS classes still exist
   * in it. A section rebuilt by an earlier edit keeps almost none of them, and has lost the site's look with them. The model is told up
   * front, so it restores instead of patching a section that is already off.
   */
  async originalDiff(): Promise<string> {
    const pageId = this.ctx.pageId
    if (!pageId) return ''
    const res = await fetch(`/api/editor/original?${new URLSearchParams({ pageId, digest: '1' })}`, { cache: 'no-store' })
    if (!res.ok) return ''
    const sections: { id: string; index: number; classes: string[] }[] = (await res.json()).sections || []
    const root = contentRoot(this.ctx)
    const blocks = (root.components().models as Comp[]).filter(m => m.get?.('type') !== 'textnode')
    const lines: string[] = []
    blocks.forEach((blk, i) => {
      const el = blk.getEl?.() as HTMLElement | undefined
      if (!isElement(el)) return
      const attr = blk.getAttributes?.()['data-vai-block-id']
      const orig = sections.find(s => s.id === attr) || sections[i]
      if (!orig || orig.classes.length < 5) return
      const now = new Set<string>()
      for (const e of [el, ...Array.from(el.querySelectorAll('*') as NodeListOf<HTMLElement>)]) e.classList.forEach(c => { if (!/^(vaic|gjs-)/.test(c)) now.add(c) })
      const gone = orig.classes.filter(c => !now.has(c))
      const kept = 1 - gone.length / orig.classes.length
      // a whole part rebuilt (its classes gone) shows as a few missing names even when the rest of the section is untouched
      if (kept < 0.5 || gone.length >= 4) {
        const title = clip(txt(el.querySelector('h1,h2,h3') as HTMLElement | null) || txt(el), 50)
        lines.push(`- seção ${attr || `#${i + 1}`} ("${title}", id ${stableId(blk)}): sumiram ${gone.length} classes do original (${gone.slice(0, 6).join(', ')}${gone.length > 6 ? '…' : ''}). Parte dela foi reconstruída e perdeu o visual do site. Use restore_original_block(${stableId(blk)}) antes de aplicar o pedido.`)
      }
    })
    return lines.join('\n')
  }

  /* ───────── reading ───────── */

  private inspect(c: Comp) {
    const el = c.getEl?.()
    if (!isElement(el)) throw new ToolError('Esse elemento não aparece na tela.')
    const cs = this.win.getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const styles: Record<string, string> = {}
    for (const p of STYLE_PROPS) styles[p] = clip(cs.getPropertyValue(p), 80)
    const attrs: Record<string, string> = {}
    for (const a of ['href', 'src', 'alt', 'target', 'title', 'type', 'name']) { const v = el.getAttribute(a); if (v) attrs[a] = clip(v, 160) }
    const parent = c.parent?.()
    return {
      id: stableId(c), kind: kindOfEl(el, cs), tag: el.tagName.toLowerCase(), classes: clip(String(el.className || ''), 120), text: clip(txt(el), 240), attrs,
      rect: { x: Math.round(r.left), y: Math.round(r.top + this.win.scrollY), width: Math.round(r.width), height: Math.round(r.height) },
      styles,
      parent: parent ? { id: stableId(parent), tag: String(parent.getEl?.()?.tagName || parent.get?.('tagName') || 'div').toLowerCase() } : null,
      children: realChildren(c).slice(0, 14).map((ch: Comp) => { const e = ch.getEl(); return { id: stableId(ch), tag: e.tagName.toLowerCase(), kind: kindOfEl(e, this.win.getComputedStyle(e)), text: clip(txt(e), 60) } }),
    }
  }

  /* ───────── verification ───────── */

  private collectIssues(consume = true): any[] {
    const doc = this.doc, win = this.win
    const issues: any[] = []
    for (const m of (consume ? this.jsErrors.splice(0) : this.jsErrors.slice()).slice(0, 5)) issues.push({ type: 'js_error', message: m })

    const de = doc.documentElement
    const cw = de.clientWidth
    if (de.scrollWidth > cw + 2) {
      const bad: HTMLElement[] = []
      for (const el of Array.from(doc.body.querySelectorAll('*')).slice(0, 6000) as HTMLElement[]) {
        const cs = win.getComputedStyle(el)
        if (cs.display === 'none' || cs.position === 'fixed') continue
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.right > cw + 2 && !isInvisible(el, cs, r)) bad.push(el)
      }
      const outer = bad.filter(el => !bad.some(o => o !== el && o.contains(el))).slice(0, 5)
      for (const el of outer) {
        const comp = (this.ctx.editor.Components as any).allById?.()[el.id]
        const ours = !this.baseStick.has(el) && !!comp && [...this.inserted, ...this.changes.flatMap(c => c.comps)].some(x => inside(x, comp))
        issues.push({ type: 'horizontal_overflow', id: el.id || undefined, ours, ...(ours ? {} : { preexisting: true }), ...this.culprit(el, cw), message: `<${el.tagName.toLowerCase()}> passa ${Math.round(el.getBoundingClientRect().right - cw)}px da largura da tela (${cw}px)${ours ? '' : ' (pode já existir na página original)'}` })
      }
      if (!outer.length) issues.push({ type: 'horizontal_overflow', preexisting: !this.inserted.length && !this.changes.length, message: `A página rola para o lado (${de.scrollWidth}px de conteúdo para ${cw}px de tela).` })
    }

    // pages often clip the overflow of their containers (overflow: hidden/clip): the document does not scroll, but the content is cut off
    const mine = new Set<Comp>([...this.inserted, ...this.changes.flatMap(c => c.comps)])
    const reported = new Set<string>(issues.filter(x => x.type === 'horizontal_overflow').flatMap(x => [x.id, x.culprit?.id]).filter(Boolean))
    let extra = 0
    for (const c of mine) {
      const el = c?.getEl?.()
      if (!isElement(el) || !el.isConnected || extra >= 4) continue
      if (!this.sticksOut(el, cw).length) continue
      const cul = this.culprit(el, cw).culprit
      const id = cul?.id || el.id
      if (!id || reported.has(id)) continue
      reported.add(id)
      extra++
      const bad = doc.getElementById(id)
      issues.push({ type: 'horizontal_overflow', id, ours: true, ...(cul ? { culprit: cul } : {}), message: `<${(bad || el).tagName.toLowerCase()}> passa da largura da tela (${cw}px): fica cortado, mesmo que a página não role para o lado` })
    }

    // a new section narrower than its container looks broken, unless it capped its own width on purpose
    for (const c of this.inserted) {
      const el = c?.getEl?.()
      if (!isElement(el) || !el.isConnected || !el.parentElement) continue
      const pw = el.parentElement.getBoundingClientRect().width
      const w = el.getBoundingClientRect().width
      const mw = parseFloat(win.getComputedStyle(el).maxWidth)
      const capped = Number.isFinite(mw) && mw < pw * 0.9
      if (pw >= 320 && w < pw * 0.88 && !capped) issues.push({ type: 'narrow_section', id: stableId(c), ours: true, message: `a seção nova tem ${Math.round(w)}px e o contêiner ${Math.round(pw)}px: adicione width:100% e box-sizing:border-box` })
    }

    for (const x of findLowContrast(this.ctx, this.selected)) {
      const id = stableId(x.comp)
      if (this.baseContrast.has(id)) continue
      issues.push({ type: 'low_contrast', id, message: `texto "${x.text}" difícil de ler (contraste ${x.ratio.toFixed(1)}:1)` })
      if (issues.filter(v => v.type === 'low_contrast').length >= 6) break
    }

    for (const c of [...this.inserted, ...this.newImages]) {
      const el = c?.getEl?.()
      if (!isElement(el) || !el.isConnected) continue
      const imgs = el.tagName === 'IMG' ? [el as HTMLImageElement] : Array.from(el.querySelectorAll('img'))
      for (const im of imgs) if (im.getAttribute('src') && im.complete && im.naturalWidth === 0) issues.push({ type: 'broken_image', id: im.id || undefined, message: `imagem não carrega: ${clip(im.getAttribute('src') || '', 80)}` })
    }
    for (const c of this.inserted) {
      const el = c?.getEl?.()
      if (!isElement(el) || !el.isConnected) continue
      const r = el.getBoundingClientRect()
      if (r.height < 8 || r.width < 8) issues.push({ type: 'empty_element', id: stableId(c), message: 'um elemento novo ficou sem tamanho visível' })
    }
    return issues
  }

  /** Problems in what the agent just made, attached to the tool's own answer so the model does not need an extra call to find out. */
  private withQuick<T extends object>(data: T, made?: Comp[]): T | (T & { issues_after: any[]; hint: string }) {
    const q = this.collectIssues(false).filter(x => x.type !== 'horizontal_overflow' || x.ours).slice(0, 4)
    let out: any = q.length ? { ...data, issues_after: q, hint: 'Corrija esses problemas (se vieram das suas mudanças) antes de terminar.' } : data
    // what was just made must still look like THIS site (colors and fonts outside its palette are reported right away)
    const off = made?.length ? identityIssues(this.ctx, this.profile, made) : []
    if (off.length) out = { ...out, identity_warnings: off, identity_hint: `Isso foge da identidade visual do site. Corrija com set_styles usando as cores e fontes da identidade (get_site_style) antes de terminar.` }
    return out
  }

  /** Text the agent put on a background it cannot read is fixed on the spot: it is mechanical, not a decision. */
  private autoContrast(c: Comp): number {
    const ch = fixContrast(this.ctx, c)
    return ch ? ch.comps.length : 0
  }

  /** Elements inside `root` (itself included) that stick out past the screen, leaving out what sits in a scroll container made to scroll. */
  private sticksOut(root: HTMLElement, cw: number): HTMLElement[] {
    const out: HTMLElement[] = []
    for (const e of [root, ...Array.from(root.querySelectorAll('*') as NodeListOf<HTMLElement>)].slice(0, 500)) {
      const r = e.getBoundingClientRect()
      if (r.width <= 0 || r.right <= cw + 2 || isInvisible(e, this.win.getComputedStyle(e), r)) continue
      let scrolls = false
      for (let n: HTMLElement | null = e.parentElement; n && n !== this.doc.body; n = n.parentElement) {
        const ox = this.win.getComputedStyle(n).overflowX
        if (ox === 'auto' || ox === 'scroll') { scrolls = true; break }
      }
      if (!scrolls && !this.baseStick.has(e) && this.win.getComputedStyle(e).position !== 'fixed') out.push(e)
    }
    return out
  }

  /** Of the elements that stick out, the innermost ones (none of their descendants sticks out too) are where the fixed width was set. */
  private culprit(root: HTMLElement, cw: number): { culprit?: { id: string; width: number } } {
    const wide = this.sticksOut(root, cw)
    const inner = wide.filter(e => !wide.some(o => o !== e && e.contains(o)) && e.id)
    inner.sort((x, y) => y.getBoundingClientRect().width - x.getBoundingClientRect().width)
    return inner[0] ? { culprit: { id: inner[0].id, width: Math.round(inner[0].getBoundingClientRect().width) } } : {}
  }

  private async check(viewport?: string): Promise<ToolResult> {
    const ed = this.ctx.editor
    const target = viewport === 'mobile' ? 'Mobile' : viewport === 'tablet' ? 'Tablet' : null
    const prev = (ed.getDevice?.() as string) || 'Desktop'
    const switched = !!target && prev !== target
    if (switched) { ed.setDevice(target!); await sleep(500) }
    let issues: any[]
    let width = 0
    try { issues = this.collectIssues(); width = this.doc.documentElement.clientWidth } finally { if (switched) { ed.setDevice(prev); await sleep(200) } }
    // the phone screen compared with the page as it was when the task started: whatever differs is the agent's doing
    if (this.guard() && this.changes.length) {
      try {
        const d = await this.guard()!.layoutDrift('mobile')
        const lines = d ? this.driftLines(d) : []
        if (lines.length) issues.push({ type: 'mobile_drift', ours: true, message: `Depois das suas mudanças o celular (${d!.width}px) ficou diferente de como a página estava antes:\n${lines.join('\n')}\nDesfaça o que causou isso (undo_last_change) ou escreva a regra só para a tela grande. Uma regra de layout sem @media vale também no celular e sobrepõe o responsivo da página.` })
      } catch { /* optional */ }
    }
    for (const [id, c] of this.carousels) {
      if (!c.comp?.getEl?.()?.isConnected) continue
      const mot = await checkMotion(this.ctx, c.comp, Math.min(10, c.interval + 1.5))
      if (mot.verdict !== 'gira') issues.push({ type: 'carousel_not_moving', id, message: `carrossel ${id}: ${mot.message}` })
    }
    // what the page already had before the agent touched it (the original site's own overflow, a nav that only fits a phone...) is
    // not the agent's to fix: it is mentioned once and never counted, so the task does not end as "problems left" or spend steps on it
    const inherited = issues.filter(x => x.preexisting).length
    issues = issues.filter(x => !x.preexisting)
    this.modifiedSinceCheck = false
    this.checkedAny = true
    this.lastIssueCount = issues.length
    return { data: { ok: issues.length === 0, viewport: viewport || 'desktop', page_width: width, issues, ...(inherited ? { ignorados_ja_existiam: inherited, nota: `${inherited} problema(s) de largura já existiam na página original e não vieram das suas mudanças: ignore-os, não tente consertar.` } : {}) }, stepLabel: viewport === 'mobile' ? 'Verificando no celular' : viewport === 'tablet' ? 'Verificando no tablet' : 'Verificando a página', stepDetail: issues.length ? `${issues.length} ${issues.length === 1 ? 'problema' : 'problemas'}` : 'tudo certo', error: false }
  }
}

/* ═════════════════════════════ the loop ═════════════════════════════ */

export interface StepView { id: string; label: string; detail?: string; status: 'running' | 'ok' | 'error' }
export interface AgentTurn { message: AgentMsg; stop: 'tool_use' | 'end' | 'length'; credits?: any; provider?: string }

export class AgentModelError extends Error {
  constructor(public code: string, message: string, public retryAfterMs?: number) { super(message) }
}

export interface AgentRunOptions {
  ctx: EngineCtx
  selected: Comp | null
  instruction: string
  /** reference picture as a data URL */
  image?: string | null
  /** earlier turns of this conversation, already compacted */
  history: AgentMsg[]
  signal: AbortSignal
  callModel: (messages: AgentMsg[], signal: AbortSignal) => Promise<AgentTurn>
  onSteps: (steps: StepView[]) => void
  limits?: Partial<{ iterations: number; toolCalls: number; ms: number; verifyRounds: number }>
}

export interface AgentRunResult {
  finalText: string
  changes: AgentChange[]
  undoSteps: number
  iterations: number
  ended: 'done' | 'iteration_limit' | 'time_limit' | 'tool_limit' | 'aborted' | 'error'
  error?: string
  /** the page was checked after the last change and had no problems */
  verified: boolean
  openIssues: number
  messages: AgentMsg[]
  toolCalls: number
}

const sleepAbortable = (ms: number, signal: AbortSignal) => new Promise<void>(res => {
  if (signal.aborted || ms <= 0) return res()
  const t = setTimeout(done, ms)
  function done() { clearTimeout(t); signal.removeEventListener('abort', done); res() }
  signal.addEventListener('abort', done)
})

const textOf = (blocks: Block[]) => blocks.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text').map(b => b.text).join('\n').trim()

/** Old tool results are the bulk of a long task's tokens: keep the recent ones whole and shrink the rest. */
function pruneOld(messages: AgentMsg[]): AgentMsg[] {
  const keepFrom = messages.length - 8
  return messages.map((m, idx) => idx >= keepFrom ? m : { ...m, content: m.content.map(b => (b.type === 'tool_result' && b.content.length > 400 ? { ...b, content: b.content.slice(0, 400) + '…(resultado antigo resumido)' } : b)) })
}

export function parseDataUrl(url: string): { media_type: string; data: string } | null {
  const m = url.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i)
  return m ? { media_type: m[1], data: m[2] } : null
}

export async function runAgent(o: AgentRunOptions): Promise<AgentRunResult> {
  const lim = { iterations: 26, toolCalls: 130, ms: 7 * 60_000, verifyRounds: 2, ...o.limits }
  const session = new AgentSession(o.ctx, o.selected)
  const t0 = Date.now()
  const steps: StepView[] = []
  const push = (s: StepView) => { steps.push(s); o.onSteps([...steps]) }
  const patch = (id: string, p: Partial<StepView>) => { const s = steps.find(x => x.id === id); if (s) Object.assign(s, p); o.onSteps([...steps]) }

  try {
    // first message: the request, the scope and a summary of the page (stable ids)
    push({ id: 'read', label: 'Lendo a página', status: 'running' })
    const scopeLine = o.selected
      ? `SÓ o elemento selecionado (id ${stableId(o.selected)}) e o que está dentro dele. Não mexa no resto da página.`
      : 'a página inteira.'
    const summary = session.outline(undefined, 9000)
    patch('read', { status: 'ok' })
    let drift = ''
    try { drift = await session.originalDiff() } catch { /* the original may not be stored */ }
    const legacyNote = o.ctx.legacy
      ? 'FORMATO ANTIGO DA CLONAGEM: esta página foi clonada num formato anterior, que fixou em cada elemento os estilos do desktop (menu aberto, hambúrguer escondido, larguras). O original clonado NÃO é responsivo aqui: no celular o menu aparece como no desktop e a página pode ficar larga demais, mesmo sem nenhuma edição. Edições não recuperam o responsivo do original. Se o pedido for "responsivo", "celular" ou "mobile como o original", NÃO tente consertar com CSS nem com restore_original_page (restaurar não traz o responsivo de volta). Explique ao usuário, em poucas palavras, que o jeito de ter o responsivo igual ao do site original é clonar a página de novo (o clone atual preserva o responsivo e as versões de celular), e só faça ajustes pequenos e seguros se ele pedir mesmo assim.'
      : ''
    const first: Block[] = []
    const img = o.image ? parseDataUrl(o.image) : null
    if (img) first.push({ type: 'image', media_type: img.media_type, data: img.data })
    first.push({ type: 'text', text: `PEDIDO: ${o.instruction}\n\nESCOPO: ${scopeLine}\n\n${session.siteBrief()}${drift ? `\n\nSEÇÕES QUE JÁ NÃO PARECEM COM O ORIGINAL (edições anteriores as reconstruíram):\n${drift}` : ''}${legacyNote ? `\n\n${legacyNote}` : ''}\n\nSKILLS DE FRONTEND PARA ESTE PEDIDO (boas práticas; o visual do SITE e do original sempre vale mais que estas regras gerais):\n${pickSkills(o.instruction).map(k => `## ${k.title}\n${k.body}`).join('\n\n')}\n\nRESUMO DA PÁGINA (ids estáveis, valem em todas as ferramentas):\n${summary}` })
    const messages: AgentMsg[] = [...o.history, { role: 'user', content: first }]

    // Free plans of AI providers accept only a few requests per minute and every step of the agent is one request. So: when the
    // provider says "wait", wait and ask again; after a limit was hit, go slower; and never hold the user without saying why.
    const FREE_GAP: Record<string, number> = { gemini: 6000, openrouter: 3500, groq: 2500, cerebras: 2500, nvidia: 3000, huggingface: 3000, mistral: 3000 }
    const pacer = { gap: 0, last: 0 }
    let waitedMs = 0
    const holdOn = async (ms: number, label: string, id: string) => {
      const end = Date.now() + ms
      if (ms >= 2000) push({ id, label, detail: `${Math.ceil(ms / 1000)}s`, status: 'running' })
      while (Date.now() < end && !o.signal.aborted) {
        await sleepAbortable(Math.min(1000, end - Date.now()), o.signal)
        if (ms >= 2000) patch(id, { detail: `${Math.max(0, Math.ceil((end - Date.now()) / 1000))}s` })
      }
      const k = steps.findIndex(s => s.id === id)
      if (k >= 0) { steps.splice(k, 1); o.onSteps([...steps]) }
    }
    const askModel = async (): Promise<AgentTurn> => {
      for (let attempt = 0; ; attempt++) {
        const since = Date.now() - pacer.last
        if (pacer.gap && pacer.last && since < pacer.gap) await holdOn(pacer.gap - since, 'Respeitando o limite do provedor', `pace${session.toolCalls}_${attempt}`)
        try {
          const t = await o.callModel(pruneOld(messages), o.signal)
          pacer.last = Date.now()
          if (t.provider && FREE_GAP[t.provider]) pacer.gap = Math.max(pacer.gap, FREE_GAP[t.provider])
          return t
        } catch (e: any) {
          pacer.last = Date.now()
          if (o.signal.aborted || e?.name === 'AbortError') throw e
          const limited = e instanceof AgentModelError && (e.code === 'rate_limited' || e.code === 'rate')
          if (!limited || attempt >= 4 || waitedMs > 150_000) throw e
          const ms = Math.min(70_000, Math.max(4000, (e.retryAfterMs ?? 15_000) + 1500))
          waitedMs += ms
          pacer.gap = Math.min(15_000, Math.max(pacer.gap * 2, 8000))
          await holdOn(ms, 'Aguardando o limite do provedor de IA', `limit${attempt}_${session.toolCalls}`)
        }
      }
    }

    let finalText = ''
    let ended: AgentRunResult['ended'] = 'done'
    let error: string | undefined
    let verifyRounds = 0
    let iterations = 0

    for (; ; iterations++) {
      if (o.signal.aborted) { ended = 'aborted'; break }
      if (iterations >= lim.iterations) { ended = 'iteration_limit'; break }
      if (Date.now() - t0 > lim.ms) { ended = 'time_limit'; break }

      const thinking = `think${iterations}`
      push({ id: thinking, label: iterations === 0 ? 'Entendendo o pedido' : 'Decidindo o próximo passo', status: 'running' })
      let turn: AgentTurn
      try { turn = await askModel() } catch (e: any) {
        patch(thinking, { status: 'error' })
        if (o.signal.aborted || e?.name === 'AbortError') { ended = 'aborted'; break }
        if (e instanceof AgentModelError && e.code === 'no_ai_key') throw e
        ended = 'error'
        error = e instanceof AgentModelError && (e.code === 'rate_limited' || e.code === 'rate')
          ? 'O limite de pedidos por minuto do provedor de IA acabou e não liberou a tempo. O que já foi feito está listado e dá para desfazer. Clique em Continuar daqui a um minuto, ou conecte um segundo provedor em Admin > IA para dividir a carga.'
          : e?.message || 'A IA não respondeu.'
        break
      }
      steps.splice(steps.findIndex(s => s.id === thinking), 1)   // the thinking line is only a spinner
      o.onSteps([...steps])
      messages.push(turn.message)
      const uses = turn.message.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use')

      if (!uses.length) {
        if (turn.stop === 'length') {
          messages.push({ role: 'user', content: [{ type: 'text', text: 'Sua resposta foi cortada antes de terminar. Continue com passos menores (uma ferramenta por vez).' }] })
          continue
        }
        // the model says it is done: it may not finish after changing the page without having checked it
        if (session.modifiedSinceCheck && verifyRounds < lim.verifyRounds) {
          verifyRounds++
          const sid = `verify${verifyRounds}`
          push({ id: sid, label: session.layoutTouched ? 'Verificando no celular' : 'Verificando a página', status: 'running' })
          const out = await session.exec('check_page', { viewport: session.layoutTouched ? 'mobile' : undefined })
          patch(sid, { status: session.lastIssueCount ? 'error' : 'ok', detail: out.stepDetail })
          if (session.lastIssueCount > 0) {
            messages.push({ role: 'user', content: [{ type: 'text', text: `VERIFICAÇÃO AUTOMÁTICA depois das suas mudanças encontrou problemas:\n${out.content}\n\nCorrija os que vieram das suas mudanças (se um problema já existia na página original, deixe como está) e confirme com check_page antes de terminar.` }] })
            continue
          }
        }
        finalText = textOf(turn.message.content)
        break
      }

      const results: Block[] = []
      for (const u of uses) {
        if (o.signal.aborted) { ended = 'aborted'; break }
        if (session.toolCalls >= lim.toolCalls) { ended = 'tool_limit'; break }
        const sid = `t${session.toolCalls}`
        push({ id: sid, label: u.name === 'check_page' ? 'Verificando a página' : 'Trabalhando', status: 'running' })
        const out = await session.exec(u.name, u.input)
        patch(sid, { label: out.stepLabel, detail: out.stepDetail, status: out.isError ? 'error' : 'ok' })
        results.push({ type: 'tool_result', tool_use_id: u.id, content: out.content, ...(out.isError ? { is_error: true } : {}) })
      }
      // every tool_use needs its tool_result, even when the run is being cut short
      for (const u of uses) if (!results.some(r => r.type === 'tool_result' && r.tool_use_id === u.id)) results.push({ type: 'tool_result', tool_use_id: u.id, content: 'Não executado: a tarefa foi interrompida.', is_error: true })
      if (iterations + 1 === Math.floor(lim.iterations * 0.7)) results.push({ type: 'text', text: `AVISO DE ORÇAMENTO: você já usou ${iterations + 1} dos ${lim.iterations} passos desta tarefa. Pare de explorar: faça agora as mudanças que faltam (várias ferramentas na mesma resposta), confira uma vez e termine. Se algo não for possível, diga o que e por quê.` })
      messages.push({ role: 'user', content: results })
      if (ended !== 'done') break
    }

    if (!finalText) {
      const last = [...messages].reverse().find(m => m.role === 'assistant')
      finalText = last ? textOf(last.content) : ''
    }
    const verified = session.checkedAny && !session.modifiedSinceCheck && session.lastIssueCount === 0
    return { finalText, changes: session.changes, undoSteps: session.undoSteps, iterations: iterations + 1, ended, error, verified, openIssues: session.lastIssueCount, messages, toolCalls: session.toolCalls }
  } finally {
    session.dispose()
  }
}

/** What the next request of this conversation remembers about a finished task (not the heavy tool traffic). */
export function compactRun(instruction: string, r: AgentRunResult): AgentMsg[] {
  const done = r.changes.slice(0, 12).map(c => c.label).join('; ')
  return [
    { role: 'user', content: [{ type: 'text', text: instruction }] },
    { role: 'assistant', content: [{ type: 'text', text: `${r.finalText || 'Concluído.'}${done ? `\n(Mudanças feitas: ${done}.)` : ''}` }] },
  ]
}

/** The browser's side of one model turn. */
export async function fetchAgentTurn(messages: AgentMsg[], scope: 'page' | 'selection', signal: AbortSignal): Promise<AgentTurn & { credits?: any }> {
  let res: Response
  try {
    res = await fetch('/api/editor/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, scope }), signal })
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e
    throw new AgentModelError('network', 'Sem conexão com o servidor. Tente de novo.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new AgentModelError(data?.code || 'error', data?.error || 'A IA não respondeu. Tente de novo.', typeof data?.retryAfterMs === 'number' ? data.retryAfterMs : undefined)
  if (!data?.message || !Array.isArray(data.message.content)) throw new AgentModelError('bad_response', 'A IA devolveu uma resposta que não consegui entender. Tente de novo.')
  return { message: data.message, stop: data.stop === 'tool_use' || data.stop === 'length' ? data.stop : 'end', credits: data.credits, provider: typeof data.provider === 'string' ? data.provider : undefined }
}
