/**
 * The videos of a cloned project, read from the pages' own markup: every
 * smart-player mount (data-vai-player, see public/vai-player.js) carries its
 * settings as JSON, and the page rules about video (pause, end, a moment of the
 * video) live next to the other rules in the page shell.
 */

export interface PageVideo {
  pageSlug: string
  pageName: string
  /** 0-based position of this player inside the page */
  idx: number
  src: string
  poster?: string
  ratio?: number
  start: 'click' | 'auto' | 'preview'
  bar: 'smart' | 'plain' | 'full' | 'none'
  pause: 'free' | 'never' | 'once'
  seek: boolean
  fullscreen: boolean
  resume: boolean
  /** seconds into the video at which something on the page appears (data-vai-pitch-at) */
  pitchAt: number[]
  /** what the video does to the page: pause / end rules */
  rules: { trigger: string; goto?: string }[]
}

interface BlockLike {
  order?: number
  generatedHtml?: string | null
  [key: string]: any
}

const PLAYER_RE = /<div\b[^>]*\sdata-vai-player="([^"]*)"[^>]*>/g
const PITCH_RE = /\sdata-vai-pitch-at="([^"]*)"/g

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

export function listPageVideos(
  page: { slug: string; name: string; blocks: unknown; shell?: unknown },
): PageVideo[] {
  const blocks = (Array.isArray(page.blocks) ? page.blocks : []) as BlockLike[]
  const html = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(b => b.generatedHtml || '').join('\n')
  const rules = Array.isArray((page.shell as any)?.rules) ? ((page.shell as any).rules as any[]) : []
  const pitch: number[] = []
  PITCH_RE.lastIndex = 0
  let pm: RegExpExecArray | null
  while ((pm = PITCH_RE.exec(html))) {
    const n = parseFloat(pm[1])
    if (isFinite(n)) pitch.push(n)
  }
  const out: PageVideo[] = []
  PLAYER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PLAYER_RE.exec(html))) {
    let cfg: any
    try {
      cfg = JSON.parse(decode(m[1]))
    } catch {
      continue
    }
    if (!cfg?.src) continue
    out.push({
      pageSlug: page.slug,
      pageName: page.name,
      idx: out.length,
      src: String(cfg.src),
      poster: cfg.poster && !String(cfg.poster).startsWith('__VAI_SHOT') ? String(cfg.poster) : undefined,
      ratio: typeof cfg.ratio === 'number' ? cfg.ratio : undefined,
      start: cfg.start === 'auto' || cfg.start === 'click' ? cfg.start : 'preview',
      bar: ['plain', 'full', 'none'].includes(cfg.bar) ? cfg.bar : 'smart',
      pause: cfg.pause === 'never' || cfg.pause === false ? 'never' : cfg.pause === 'once' ? 'once' : 'free',
      seek: cfg.seek === true,
      fullscreen: cfg.fullscreen === true,
      resume: cfg.resume !== false,
      pitchAt: pitch,
      rules: rules.filter(r => typeof r.trigger === 'string' && r.trigger.startsWith('video')).map(r => ({ trigger: r.trigger, goto: r.goto })),
    })
  }
  return out
}

export const START_LABEL: Record<PageVideo['start'], string> = {
  click: 'Começa ao clicar',
  auto: 'Começa sozinho ao abrir',
  preview: 'Prévia sem som, toque liga o som',
}
export const PAUSE_LABEL: Record<PageVideo['pause'], string> = {
  free: 'Pode pausar',
  never: 'Não pode pausar',
  once: 'Pausa uma vez, depois trava',
}
export const BAR_LABEL: Record<PageVideo['bar'], string> = {
  smart: 'Barra esperta (não mostra o tempo que falta)',
  plain: 'Barra simples',
  full: 'Controles completos',
  none: 'Sem barra',
}
