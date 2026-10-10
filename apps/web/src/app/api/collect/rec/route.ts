import { NextRequest } from 'next/server'
import { gunzipSync, gzipSync } from 'node:zlib'
import { db } from '@funnelai/db'
import { Prisma } from '@funnelai/db'
import { ensureSession, tooBusy } from '@/lib/analytics/ingest'
import { projectInfo } from '@/lib/analytics/goals'
import { clientIp } from '@/lib/analytics/geo'

/**
 * Chunks of a session recording (rrweb events), gzip. A visit is recorded only when the project asked for it, only up
 * to the daily cap, and never more than a few MB. Inputs were masked in the browser, so what arrives here has no typed text.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const empty = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
const MAX_BYTES = 4_000_000

export async function POST(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams
    const projectId = q.get('p') || '', sid = q.get('s') || ''
    const n = Math.max(0, Math.min(5000, Number(q.get('n') || 0) | 0))
    if (!projectId || !sid || projectId.length > 40 || sid.length > 40) return empty()
    if (tooBusy(`rec|${clientIp(req.headers) || 'x'}|${projectId}`, 400)) return empty()
    const info = await projectInfo(projectId)
    if (!info.ok || !info.settings.recording.on) return empty()

    const raw = Buffer.from(await req.arrayBuffer())
    if (!raw.length || raw.length > 800_000) return empty()
    const gz = req.headers.get('x-vai-enc') === 'gz' || req.headers.get('content-type') === 'application/octet-stream'
    let json: Buffer
    try { json = gz ? gunzipSync(raw, { maxOutputLength: 12_000_000 }) : raw } catch { return empty() }
    let events: any[]
    try { events = JSON.parse(json.toString('utf8')) } catch { return empty() }
    if (!Array.isArray(events) || !events.length) return empty()
    const data = gz ? raw : gzipSync(raw)

    const started = new Date(Math.min(Date.now(), Number(q.get('t')) || Date.now()))
    const session = await ensureSession(projectId, sid, 'unknown', Date.now())
    let rec = await db.recording.findUnique({ where: { sessionId: session.id } })
    if (!rec) {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
      const today = await db.recording.count({ where: { projectId, startedAt: { gte: dayStart } } })
      if (today >= info.settings.recording.maxPerDay) return empty()
      try {
        rec = await db.recording.create({ data: { projectId, sessionId: session.id, startedAt: started, device: (q.get('d') || '').slice(0, 10) || null, viewportW: Math.min(20000, Number(q.get('w')) | 0) || null, viewportH: Math.min(20000, Number(q.get('h')) | 0) || null } })
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') rec = await db.recording.findUnique({ where: { sessionId: session.id } })
        else throw e
      }
    }
    if (!rec || rec.bytes > MAX_BYTES) return empty()

    try {
      await db.recordingChunk.create({ data: { recordingId: rec.id, seq: n, data } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return empty()      // a retry of a chunk that is already stored
      throw e
    }
    const lastTs = Number(events[events.length - 1]?.timestamp) || 0
    await db.recording.update({
      where: { id: rec.id },
      data: {
        bytes: { increment: data.length }, events: { increment: events.length },
        durationMs: lastTs ? Math.max(rec.durationMs, Math.max(0, lastTs - rec.startedAt.getTime())) : rec.durationMs,
      },
    })
  } catch (e) {
    console.error('collect/rec error:', e instanceof Error ? e.message : e)
  }
  return empty()
}
