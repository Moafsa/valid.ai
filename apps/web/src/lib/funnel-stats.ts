import { db } from '@funnelai/db'

/**
 * Numbers for the funnel map, from the tracking events the clone sends (see public/vai-runtime.js):
 * a "view" every time a step opens and a "click" every time a button or answer moves the visitor on,
 * both carrying a per-tab session id. Following one session through its views tells where people
 * arrive, where they go next and where they stop.
 */
export interface StepStats {
  /** times the step was opened */
  views: number
  /** different visitors who opened it */
  visitors: number
  /** visitors whose last step was this one */
  stopped: number
  /** median seconds before moving on */
  secs: number | null
}

export interface FunnelStats {
  windowDays: number
  sessions: number
  leads: number
  /** how many visitors reached the last step */
  reachedEnd: number
  steps: Record<string, StepStats>
  /** "fromSlug>toSlug" -> visitors */
  moves: Record<string, number>
  /** the answers / buttons pressed on a step, most pressed first */
  clicks: Record<string, { label: string; to: string; n: number }[]>
  hasData: boolean
}

const WINDOW_DAYS = 30
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export async function funnelStats(projectId: string, pages: { id: string; slug: string }[]): Promise<FunnelStats> {
  const slugOf = new Map(pages.map(p => [p.id, p.slug]))
  const rows = await db.$queryRaw<{ pageId: string | null; createdAt: Date; type: string; sid: string | null; label: string | null; dest: string | null }[]>`
    SELECT "pageId", "createdAt", type, data->>'sid' AS sid, data->>'label' AS label, data->>'to' AS dest
    FROM page_events
    WHERE "projectId" = ${projectId} AND type IN ('view', 'click') AND "createdAt" > now() - interval '30 days'
    ORDER BY "createdAt" ASC
    LIMIT 250000`
  const leads = await db.pageEvent.count({ where: { projectId, type: 'lead', createdAt: { gt: new Date(Date.now() - WINDOW_DAYS * 86400_000) } } })

  const steps: Record<string, StepStats> = {}
  const touch = (slug: string) => (steps[slug] ??= { views: 0, visitors: 0, stopped: 0, secs: null })
  const seenBy = new Map<string, Set<string>>()
  const timeline = new Map<string, { slug: string; t: number }[]>()
  const clicks: Record<string, Map<string, { label: string; to: string; n: number }>> = {}

  for (const r of rows) {
    const slug = r.pageId ? slugOf.get(r.pageId) : undefined
    if (!slug) continue
    if (r.type === 'view') {
      touch(slug).views++
      if (r.sid) {
        if (!seenBy.has(slug)) seenBy.set(slug, new Set())
        seenBy.get(slug)!.add(r.sid)
        const tl = timeline.get(r.sid) ?? []
        // a reload of the same step is not a move
        if (!tl.length || tl[tl.length - 1].slug !== slug) tl.push({ slug, t: new Date(r.createdAt).getTime() })
        timeline.set(r.sid, tl)
      }
    } else if (r.type === 'click' && r.label !== null) {
      const m = (clicks[slug] ??= new Map())
      const key = `${r.label}|${r.dest ?? ''}`
      const cur = m.get(key)
      if (cur) cur.n++
      else m.set(key, { label: r.label || '(sem texto)', to: r.dest ?? '', n: 1 })
    }
  }

  const moves: Record<string, number> = {}
  const dwell = new Map<string, number[]>()
  const last = pages.length ? pages[pages.length - 1].slug : ''
  let reachedEnd = 0
  for (const tl of timeline.values()) {
    for (let i = 0; i < tl.length; i++) {
      const cur = tl[i]
      if (i < tl.length - 1) {
        const nxt = tl[i + 1]
        const key = `${cur.slug}>${nxt.slug}`
        moves[key] = (moves[key] ?? 0) + 1
        const secs = (nxt.t - cur.t) / 1000
        if (secs >= 0 && secs < 600) (dwell.get(cur.slug) ?? dwell.set(cur.slug, []).get(cur.slug)!).push(secs)
      } else touch(cur.slug).stopped++
    }
    if (tl.some(x => x.slug === last)) reachedEnd++
  }
  for (const [slug, set] of seenBy) touch(slug).visitors = set.size
  for (const [slug, xs] of dwell) touch(slug).secs = median(xs) === null ? null : Math.round(median(xs)!)

  const clickOut: FunnelStats['clicks'] = {}
  for (const [slug, m] of Object.entries(clicks)) clickOut[slug] = [...m.values()].sort((a, b) => b.n - a.n).slice(0, 8)
  const sessions = timeline.size
  return { windowDays: WINDOW_DAYS, sessions, leads, reachedEnd, steps, moves, clicks: clickOut, hasData: sessions > 0 }
}
