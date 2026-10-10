import type { Editor } from 'grapesjs'
import type { Breakpoints } from './breakpoints'

/**
 * Editing on the desktop screen must not break the tablet and phone layouts.
 *
 * The clone keeps the original site's own responsive CSS. When someone changes, say, the size of a heading on the
 * Desktop screen the editor writes `#heading { font-size: 56px }`: a rule with no media query and an id selector,
 * which beats the original's `@media (max-width: 767px) { .title { font-size: 28px } }` on EVERY screen, so the phone
 * suddenly gets the desktop size.
 *
 * So, the first time a layout property of an element is changed on Desktop, the values the ORIGINAL design had on the
 * tablet and on the phone are written as ordinary Tablet / Mobile rules of that element (the same rules the editor's own
 * Tablet / Mobile modes write, so they show up there and can be edited). Properties the original did not change between
 * screens are left alone: for those, a Desktop edit rightly carries over to the smaller screens.
 *
 * "The original design" is read from the untouched page loaded in hidden frames of those widths, by looking at which
 * rules of its stylesheet really apply there (media queries answered by the browser itself).
 */

/** What changes the shape of a page between screen sizes (colours and the like are the owner's call, not pinned). */
const LAYOUT_PROPS = new Set([
  'font-size', 'line-height', 'letter-spacing', 'text-align', 'white-space',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'display', 'flex-direction', 'flex-wrap', 'flex-basis', 'flex-grow', 'flex-shrink', 'justify-content', 'align-items', 'align-self', 'order',
  'grid-template-columns', 'grid-template-rows', 'gap', 'row-gap', 'column-gap',
  'position', 'top', 'right', 'bottom', 'left', 'float',
  'object-fit', 'object-position', 'background-size', 'background-position', 'aspect-ratio', 'border-radius',
])
const SHORTHANDS: Record<string, string[]> = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
}

export interface GuardOptions {
  /** the document exactly as it was loaded into the editor: wrapper chain + blocks with their ids */
  documentHtml: string
  pageCss: string
  htmlAttrs: string
  bodyAttrs: string
  bp: Breakpoints
}

interface Frame { win: Window; doc: Document }

function splitSelectors(text: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** (ids, classes/attributes/pseudo-classes, types) packed into one comparable number */
function specificity(sel: string): number {
  const s = sel.replace(/::?[\w-]+\(([^)]*)\)/g, ' $1 ')           // :not(.a) counts its argument; the pseudo-class itself ~ ignored
  const ids = (s.match(/#[\w-]+/g) || []).length
  const classes = (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length
  const types = (s.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length
  return ids * 10000 + classes * 100 + types
}

/** the value the original stylesheet (or inline style) declares for `prop` on `el`, in the window it lives in; null when nothing does */
function declaredValue(win: Window, el: Element, prop: string): string | null {
  type Cand = { value: string; important: boolean; spec: number; order: number }
  let best: Cand | null = null
  let order = 0
  const consider = (c: Cand) => {
    if (!best || (c.important && !best.important) || (c.important === best.important && (c.spec > best.spec || (c.spec === best.spec && c.order >= best.order)))) best = c
  }
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      const t = (rule as any).constructor?.name
      if ((rule as CSSStyleRule).selectorText !== undefined && (rule as CSSStyleRule).style) {
        const r = rule as CSSStyleRule
        const value = r.style.getPropertyValue(prop)
        order++
        if (!value) continue
        let spec = -1
        for (const part of splitSelectors(r.selectorText)) {
          try { if (el.matches(part)) spec = Math.max(spec, specificity(part)) } catch { /* pseudo-elements and the like never match */ }
        }
        if (spec >= 0) consider({ value, important: r.style.getPropertyPriority(prop) === 'important', spec, order })
      } else if (t === 'CSSMediaRule' || (rule as CSSMediaRule).media) {
        const m = rule as CSSMediaRule
        try { if (win.matchMedia(m.media.mediaText).matches && m.cssRules) walk(m.cssRules) } catch { /* unparsable query */ }
      } else if ((rule as CSSSupportsRule).conditionText !== undefined && (rule as CSSSupportsRule).cssRules) {
        const sr = rule as CSSSupportsRule
        try { if ((win as any).CSS.supports(sr.conditionText)) walk(sr.cssRules) } catch { /* ignore */ }
      } else if ((rule as any).cssRules && t !== 'CSSKeyframesRule' && t !== 'CSSFontFaceRule') {
        walk((rule as any).cssRules)                                  // @layer blocks and other grouping rules
      }
    }
  }
  for (const sheet of Array.from(el.ownerDocument.styleSheets)) {
    try { walk(sheet.cssRules) } catch { /* cross-origin sheet */ }
  }
  const inline = (el as HTMLElement).style?.getPropertyValue(prop)
  if (inline) consider({ value: inline, important: (el as HTMLElement).style.getPropertyPriority(prop) === 'important', spec: 1e9, order: ++order })
  return best ? (best as Cand).value : null
}

export class ResponsiveGuard {
  private frames = new Map<number, Promise<Frame | null>>()
  private done = new Set<string>()
  private disposed = false

  constructor(private editor: Editor, private opts: GuardOptions) {}

  install() {
    this.editor.on('component:styleUpdate', this.onStyle)
  }

  dispose() {
    this.disposed = true
    this.editor.off('component:styleUpdate', this.onStyle)
    for (const p of this.frames.values()) p.then(f => f?.win.frameElement?.remove()).catch(() => {})
    this.frames.clear()
  }

  /** the untouched page, loaded in a hidden frame of the given width */
  private frame(width: number): Promise<Frame | null> {
    let p = this.frames.get(width)
    if (!p) {
      p = new Promise<Frame | null>(resolve => {
        const iframe = document.createElement('iframe')
        iframe.setAttribute('aria-hidden', 'true')
        iframe.tabIndex = -1
        iframe.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;height:900px;border:0;visibility:hidden;pointer-events:none`
        // no scripts: the markup was already stripped of them, and nothing here may run
        iframe.setAttribute('sandbox', 'allow-same-origin')
        const { documentHtml, pageCss, htmlAttrs, bodyAttrs } = this.opts
        iframe.srcdoc = `<!doctype html><html${htmlAttrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${pageCss.replace(/<\/style/gi, '<\\/style')}</style></head><body${bodyAttrs}>${documentHtml}</body></html>`
        const timer = setTimeout(() => resolve(null), 20000)
        iframe.onload = () => {
          clearTimeout(timer)
          const win = iframe.contentWindow
          resolve(win && win.document ? { win, doc: win.document } : null)
        }
        document.body.appendChild(iframe)
      })
      this.frames.set(width, p)
    }
    return p
  }

  /** where an editor component sits inside its block, so the same element can be found in the untouched page */
  private locate(comp: any): { blockId: string; path: number[]; tag: string } | null {
    const path: number[] = []
    let c = comp
    for (let depth = 0; c && depth < 60; depth++) {
      const attrs = c.getAttributes?.() || {}
      if (attrs['data-vai-block-id']) return { blockId: attrs['data-vai-block-id'], path: path.reverse(), tag: String(comp.get('tagName') || '').toLowerCase() }
      const parent = c.parent?.()
      if (!parent) return null
      const siblings = parent.components().models.filter((m: any) => m.get('type') !== 'textnode' && m.get('tagName'))
      const at = siblings.indexOf(c)
      if (at < 0) return null
      path.push(at)
      c = parent
    }
    return null
  }

  private find(doc: Document, where: { blockId: string; path: number[]; tag: string }): Element | null {
    let el: Element | null = doc.querySelector(`[data-vai-block-id="${CSS.escape(where.blockId)}"]`)
    for (const i of where.path) {
      el = el?.children[i] ?? null
      if (!el) return null
    }
    return el && el.tagName.toLowerCase() === where.tag ? el : null
  }

  private widths() {
    const { bp } = this.opts
    return {
      desktop: Math.max(1440, bp.tabletMax + 200),
      tablet: Math.min(bp.tabletMax, Math.max(768, bp.mobileMax + 40)),
      mobile: Math.min(375, bp.mobileMax),
    }
  }

  private onStyle = (comp: any, pros: any) => {
    if (this.disposed) return
    const device = this.editor.getDevice?.() || 'Desktop'
    if (device !== 'Desktop') return
        const changed: string[] = Object.keys(pros?.style || {})
    const props = changed.flatMap(k => SHORTHANDS[k] || [k]).filter(k => LAYOUT_PROPS.has(k))
    if (!props.length) return
    void this.pin(comp, props)
  }

  private async pin(comp: any, props: string[]) {
    const where = this.locate(comp)
    if (!where) return
    const id = comp.getId?.()
    if (!id) return
    const fresh = props.filter(p => !this.done.has(`${id}|${p}`))
    if (!fresh.length) return
    fresh.forEach(p => this.done.add(`${id}|${p}`))

    const w = this.widths()
    const [fd, ft, fm] = await Promise.all([this.frame(w.desktop), this.frame(w.tablet), this.frame(w.mobile)])
    if (this.disposed || !fd || !ft || !fm) return
    const ed = this.find(fd.doc, where), et = this.find(ft.doc, where), em = this.find(fm.doc, where)
    if (!ed || !et || !em) return

    const css = (this.editor as any).Css
    const { bp } = this.opts
    const targets: { el: Element; frame: Frame; media: string; own: string }[] = [
      { el: et, frame: ft, media: `(max-width: ${bp.tabletMax}px)`, own: 'tablet' },
      { el: em, frame: fm, media: `(max-width: ${bp.mobileMax}px)`, own: 'mobile' },
    ]
    for (const prop of fresh) {
      const desk = declaredValue(fd.win, ed, prop) ?? fd.win.getComputedStyle(ed).getPropertyValue(prop)
      for (const t of targets) {
        const existing = css.getIdRule?.(id, { mediaText: t.media })
        if (existing?.getStyle?.()?.[prop]) continue                    // the owner already set it for that screen
        const there = declaredValue(t.frame.win, t.el, prop) ?? t.frame.win.getComputedStyle(t.el).getPropertyValue(prop)
        if (!there || there === desk) continue                         // the original did not change it: the Desktop edit carries over
        css.setIdRule(id, { [prop]: there }, { mediaText: t.media })
      }
    }
  }
}
