/**
 * The screen-size ranges the page itself is built for.
 *
 * A cloned page keeps its own stylesheet, so its phone / tablet layouts begin wherever ITS author put them
 * (767 and 1023 for a Tailwind page, 575 and 991 for Bootstrap, anything for a hand-made one). The editor's
 * Tablet and Mobile modes must write their changes for exactly those ranges; with fixed numbers a change made on the
 * "Mobile" screen would leave part of the phone layout untouched, or spill into the tablet one.
 */
export interface Breakpoints {
  /** widest screen that still gets the phone layout */
  mobileMax: number
  /** widest screen that still gets the tablet layout */
  tabletMax: number
}

export const DEFAULT_BREAKPOINTS: Breakpoints = { mobileMax: 767, tabletMax: 1023 }

export function pickBreakpoints(css: string | null | undefined): Breakpoints {
  if (!css) return DEFAULT_BREAKPOINTS
  const counts = new Map<number, number>()
  const re = /\(\s*(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    const v = Math.floor(parseFloat(m[2]))
    const upper = m[1] === 'max' ? v : v - 1
    if (upper >= 280 && upper <= 1800) counts.set(upper, (counts.get(upper) ?? 0) + 1)
  }
  const best = (lo: number, hi: number, fallback: number) => {
    let pick = fallback, score = 0
    for (const [bp, n] of counts) if (bp >= lo && bp <= hi && (n > score || (n === score && bp > pick))) { pick = bp; score = n }
    return pick
  }
  const mobileMax = best(480, 820, DEFAULT_BREAKPOINTS.mobileMax)
  const tabletMax = Math.max(best(mobileMax + 1, 1150, Math.max(DEFAULT_BREAKPOINTS.tabletMax, mobileMax + 200)), mobileMax + 1)
  return { mobileMax, tabletMax }
}

/**
 * Per-device visibility (the "Ocultar em" switches) is a plain utility class. These rules travel with every saved
 * block that uses one of the classes, and are also live inside the editor's canvas.
 */
export function visibilityCss(bp: Breakpoints): string {
  return `
@media (min-width: ${bp.tabletMax + 1}px) { .vai-hide-desktop { display: none !important; } }
@media (max-width: ${bp.tabletMax}px) { .vai-hide-tablet { display: none !important; } }
@media (max-width: ${bp.mobileMax}px) { .vai-hide-mobile { display: none !important; } }
`
}

/**
 * Blocks saved by earlier versions of the editor hold the Desktop edits inside `@media (max-width: 1440px) { ... }`
 * (the Desktop canvas is 1440px wide and its width was used as the media width). Those rules were meant for every
 * width: they are lifted out of that wrapper, so they apply again on wide screens and later Desktop edits do not
 * end up fighting an older copy of the same rule.
 */
export function unwrapDesktopMedia(html: string): string {
  const MARK = /@media\s*\(\s*max-width\s*:\s*1440px\s*\)\s*\{/g
  return html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, css: string, close: string) => {
    let out = ''
    let last = 0
    let m: RegExpExecArray | null
    MARK.lastIndex = 0
    while ((m = MARK.exec(css))) {
      let depth = 1
      let i = MARK.lastIndex
      while (i < css.length && depth > 0) {
        if (css[i] === '{') depth++
        else if (css[i] === '}') depth--
        i++
      }
      if (depth !== 0) break
      out += css.slice(last, m.index) + css.slice(MARK.lastIndex, i - 1)
      last = i
      MARK.lastIndex = i
    }
    return open + out + css.slice(last) + close
  })
}
