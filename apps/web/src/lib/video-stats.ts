import { db } from '@funnelai/db'

export interface VideoStat {
  src: string
  plays: number
  pauses: number
  avgWatch: string
  milestones: { label: string; pct: number; count: number }[]
}

const fmt = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m > 0 ? `${m}min ${s}s` : `${s}s`
}

/**
 * How far people get in each video of a project, from the events the smart
 * player (public/vai-player.js) reports: one "play" per viewer, a milestone
 * event the first time they pass 25 / 50 / 75 / 95 / 100% and a "leave" with
 * how many seconds they had seen when they went away.
 */
export async function videoStats(projectId: string): Promise<VideoStat[]> {
  const events = await db.pageEvent.findMany({
    where: { projectId, type: 'video' },
    select: { data: true },
    orderBy: { createdAt: 'desc' },
    take: 20000,
  })
  const bySrc = new Map<string, { plays: number; pauses: number; marks: Record<string, number>; watched: number[] }>()
  for (const ev of events) {
    const d = ev.data as { src?: string; e?: string; t?: number } | null
    if (!d?.src || !d.e) continue
    const rec = bySrc.get(d.src) ?? { plays: 0, pauses: 0, marks: {}, watched: [] }
    if (d.e === 'play') rec.plays++
    else if (d.e === 'pause') rec.pauses++
    else if (d.e === 'leave') rec.watched.push(Number(d.t) || 0)
    else rec.marks[d.e] = (rec.marks[d.e] ?? 0) + 1
    bySrc.set(d.src, rec)
  }
  return [...bySrc.entries()]
    .filter(([, r]) => r.plays > 0)
    .map(([src, r]) => ({
      src,
      plays: r.plays,
      pauses: r.pauses,
      avgWatch: r.watched.length ? fmt(r.watched.reduce((a, b) => a + b, 0) / r.watched.length) : 'ainda sem dados',
      milestones: [
        ['25% do vídeo', 'p25'],
        ['50% do vídeo', 'p50'],
        ['75% do vídeo', 'p75'],
        ['95% do vídeo', 'p95'],
        ['Assistiu tudo', 'p100'],
      ].map(([label, key]) => ({
        label,
        count: r.marks[key] ?? 0,
        pct: Math.min(100, Math.round(((r.marks[key] ?? 0) / r.plays) * 100)),
      })),
    }))
}
