/**
 * The "flow" of a cloned funnel lives as plain attributes in each page's HTML
 * (data-vai-next / data-vai-href / data-vai-goto / data-vai-auto-to — see
 * public/vai-runtime.js). These helpers list the places where a visitor can
 * be sent somewhere and change that destination, so the dashboard can offer a
 * "where does this button go?" screen without touching the visual editor.
 */

export interface FlowLink {
  /** position among the page's links, in document order (stable between list and edit) */
  idx: number
  kind: 'next' | 'href' | 'goto' | 'auto'
  label: string
  /** a page slug, or a full URL (the funnel's exit) */
  target: string
}

interface BlockLike {
  order?: number
  generatedHtml?: string | null
  [key: string]: any
}

const TAG_RE = /<([a-zA-Z][\w-]*)\b([^>]*?\sdata-vai-(?:next|href|goto|auto-to)="[^"]*"[^>]*)>/g
const ATTR_RE = (name: string) => new RegExp(`\\sdata-vai-${name}="([^"]*)"`)

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const encode = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

const sorted = (blocks: BlockLike[]) => [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

function textAfter(html: string, from: number, tag: string): string {
  const close = html.toLowerCase().indexOf(`</${tag.toLowerCase()}`, from)
  const chunk = html.slice(from, close === -1 ? from + 400 : Math.min(close, from + 1500))
  return decode(chunk.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 70)
}

function classify(attrs: string): { kind: FlowLink['kind']; target: string } {
  for (const [name, kind] of [['goto', 'goto'], ['next', 'next'], ['href', 'href'], ['auto-to', 'auto']] as const) {
    const m = ATTR_RE(name).exec(attrs)
    if (m) return { kind, target: decode(m[1]) }
  }
  return { kind: 'next', target: '' }
}

export function listFlowLinks(blocks: BlockLike[]): FlowLink[] {
  const out: FlowLink[] = []
  for (const block of sorted(blocks)) {
    const html = block.generatedHtml || ''
    TAG_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = TAG_RE.exec(html))) {
      const { kind, target } = classify(m[2])
      const label = kind === 'auto' ? 'Passa sozinha para' : textAfter(html, m.index + m[0].length, m[1]) || 'Botão sem texto'
      out.push({ idx: out.length, kind, label, target })
    }
  }
  return out
}

/** Points the idx-th link of a page at `target` (a page slug, a URL, or '' for nowhere). Returns the new blocks. */
export function setFlowTarget<T extends BlockLike>(blocks: T[], idx: number, target: string): T[] {
  let counter = 0
  const isUrl = /^https?:\/\//i.test(target)
  return sorted(blocks).map(block => {
    const html = block.generatedHtml || ''
    TAG_RE.lastIndex = 0
    const next = html.replace(TAG_RE, (whole: string, tag: string, attrs: string) => {
      if (counter++ !== idx) return whole
      const { kind } = classify(attrs)
      let a = attrs
      const strip = (name: string) => { a = a.replace(ATTR_RE(name), '') }
      const put = (name: string, value: string) => { a = `${a} data-vai-${name}="${encode(value)}"` }
      if (kind === 'goto') { strip('goto'); if (target) put('goto', target) }
      else if (kind === 'auto') { strip('auto-to'); if (target) put('auto-to', target) }
      else {
        strip('next'); strip('href')
        if (target) put(isUrl ? 'href' : 'next', target)
      }
      return `<${tag}${a}>`
    })
    return { ...block, generatedHtml: next } as T
  })
}


export interface FlowRule {
  id: string
  trigger: 'exit-intent' | 'back' | 'time' | 'video-pause' | 'video-end' | 'video-time' | 'hidden' | 'scroll-up'
  once?: boolean
  after?: number
  /** a page slug or a URL */
  goto?: string
}

export const RULE_LABEL: Record<FlowRule['trigger'], string> = {
  'exit-intent': 'Quando o mouse sai da página (tentou fechar ou trocar de aba)',
  back: 'Quando aperta o botão voltar',
  time: 'Depois de um tempo na página',
  'video-pause': 'Quando a pessoa pausa o vídeo',
  'video-end': 'Quando o vídeo termina',
  'video-time': 'Quando o vídeo chega num ponto',
  hidden: 'Quando troca de aba ou minimiza a janela',
  'scroll-up': 'Quando sobe a página rápido no celular (sinal de que vai sair)',
}

/** Re-points (or, with an empty target, removes) one hidden "leaving" rule of a page's shell. */
export function setRuleTarget(shell: any, ruleId: string, target: string): any {
  const rules: FlowRule[] = Array.isArray(shell?.rules) ? shell.rules : []
  const next = rules
    .map(r => (r.id === ruleId ? { ...r, goto: target || undefined } : r))
    .filter(r => r.goto)
  return { ...(shell || {}), rules: next }
}
