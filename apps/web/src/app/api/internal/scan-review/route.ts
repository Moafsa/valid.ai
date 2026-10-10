import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  projectId: z.string().min(1),
  review: z.object({
    ok: z.boolean(),
    warnings: z.number().int().min(0).max(100),
    items: z.array(z.object({ status: z.enum(['ok', 'warn', 'bad', 'info']), title: z.string().max(200), detail: z.string().max(500) })).max(30),
    metrics: z.array(z.record(z.string(), z.any())).max(4).optional(),
  }),
})

/**
 * The scanner's automatic check of a finished clone against its original (computer + phone), delivered
 * server to server. Stored with the project's crawl stats and shown on the project page. Same shared
 * secret as /api/internal/scan-complete.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SCANNER_SHARED_SECRET || ''
  const given = req.headers.get('x-scanner-secret') || ''
  const a = Buffer.from(secret)
  const b = Buffer.from(given)
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { projectId, review } = schema.parse(await req.json())
    const project = await db.project.findUnique({ where: { id: projectId }, select: { crawlStats: true } })
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const stats = (project.crawlStats && typeof project.crawlStats === 'object' ? project.crawlStats : {}) as Record<string, unknown>
    await db.project.update({ where: { id: projectId }, data: { crawlStats: { ...stats, review: { ...review, at: new Date().toISOString() } } as any } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Invalid review' }, { status: 400 })
    console.error('scan-review error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
