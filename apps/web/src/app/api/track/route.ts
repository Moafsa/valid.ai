import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { z } from 'zod'
import { ensureSession, ingest, tooBusy, type Batch } from '@/lib/analytics/ingest'
import { goalsReached, projectInfo } from '@/lib/analytics/goals'
import { clientIp } from '@/lib/analytics/geo'
import { ingestPixels, type PxBatch } from '@/lib/pixels-server'

/**
 * Public ingestion endpoint (no auth — see middleware.ts) called by the
 * PageTracker beacon on every cloned page. "view" feeds the visitor count,
 * "lead" also writes a Lead row so the owner can see the actual submitted
 * fields, not just a count.
 */
const schema = z.object({
  projectId: z.string(),
  pageId: z.string().optional(),
  type: z.enum(['view', 'lead', 'update', 'video', 'click']),
  path: z.string().nullable().optional(),
  referrer: z.string().nullable().optional(),
  formData: z.record(z.string(), z.string()).optional(),
  // one visitor, many funnel steps: the first lead event creates the row, later ones update it
  leadKey: z.string().max(64).optional(),
  // the visit and the browser the behaviour analytics follows (vai-m.js): ties the lead to where it came from
  asid: z.string().max(40).optional(),
  avid: z.string().max(40).optional(),
  // the funnel step (page slug) the beacon comes from
  slug: z.string().max(120).optional(),
  // type 'video': { src, e: play|p25|p50|p75|p95|leave, t: seconds watched, d: video length }
  // type 'view': { sid }; type 'click': { sid, label, to } (which button/answer was pressed, and where it leads)
  data: z.record(z.string(), z.union([z.string().max(300), z.number()])).optional(),
})

const EMAIL_KEYS = ['email', 'e-mail', 'seu-email', 'seu_email']
const PHONE_KEYS = ['phone', 'telefone', 'celular', 'whatsapp', 'tel']
const NAME_KEYS = ['name', 'nome', 'seu-nome', 'seu_nome', 'fullname']

function pick(formData: Record<string, string>, keys: string[]): string | undefined {
  const lower = Object.fromEntries(Object.entries(formData).map(([k, v]) => [k.toLowerCase(), v]))
  for (const key of keys) {
    if (lower[key]) return lower[key]
  }
  return undefined
}

export async function POST(req: NextRequest) {
  try {
    const text = await req.text()
    if (text.length > 300_000) return new Response(null, { status: 204 })
    const parsed = JSON.parse(text)
    // The behaviour analytics reports through this same address (a tracker blocker that lets the page's view beacon through lets this through too)
    if (parsed && parsed.v === 1 && Array.isArray(parsed.e) && typeof parsed.s === 'string') {
      const ip = clientIp(req.headers)
      if (!tooBusy(`${ip || 'x'}|${parsed.p}`)) await ingest(parsed as Batch, ip)
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
    }
    // what the page's pixels did (public/vai-e.js): written down, never used to decide anything on the page
    if (parsed && parsed.px === 1 && Array.isArray(parsed.e)) {
      await ingestPixels(parsed as PxBatch, clientIp(req.headers)).catch(() => {})
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
    }
    const body = schema.parse(parsed)

    const project = await db.project.findUnique({ where: { id: body.projectId } })
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (body.type === 'view' && body.asid && body.slug) await countStepView(body.projectId, body.asid, body.slug).catch(() => {})

    // 'update' = more answers from a visitor who is already a lead: not a new event
    if (body.type !== 'update') {
      await db.pageEvent.create({
        data: {
          projectId: body.projectId,
          pageId: body.pageId,
          type: body.type,
          path: body.path ?? undefined,
          referrer: body.referrer ?? undefined,
          data: ['video', 'view', 'click'].includes(body.type) ? (body.data as any) : undefined,
        },
      })
    }

    if ((body.type === 'lead' || body.type === 'update') && body.formData) {
      const answers: Record<string, string> = { ...body.formData }
      const contact = {
        email: pick(answers, EMAIL_KEYS),
        phone: pick(answers, PHONE_KEYS),
        name: pick(answers, NAME_KEYS),
      }
      let leadId: string
      const existing = body.leadKey
        ? await db.lead.findFirst({
            where: { projectId: body.projectId, quizAnswers: { path: ['_k'], equals: body.leadKey } },
          })
        : null
      if (existing) {
        await db.lead.update({
          where: { id: existing.id },
          data: {
            email: contact.email ?? existing.email,
            phone: contact.phone ?? existing.phone,
            name: contact.name ?? existing.name,
            quizAnswers: { ...answers, _k: body.leadKey },
          },
        })
        leadId = existing.id
      } else {
        const created = await db.lead.create({
          data: {
            projectId: body.projectId,
            ...contact,
            quizAnswers: body.leadKey ? { ...answers, _k: body.leadKey } : answers,
          },
        })
        leadId = created.id
      }
      if (body.asid) await tieLeadToVisit(body.projectId, leadId, body.asid, body.avid, clientIp(req.headers), !existing).catch(e => console.error('lead/visit link:', e))
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 })
    }
    console.error('Track error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


/** The lead remembers the visit it came from (origin, campaign, device, country) and the visit remembers it converted. */
async function tieLeadToVisit(projectId: string, leadId: string, sid: string, vid: string | undefined, ip: string | null, first: boolean) {
  const session = await ensureSession(projectId, sid, vid || 'unknown', Date.now(), undefined, ip)
  await db.lead.update({
    where: { id: leadId },
    data: {
      sessionId: session.id, visitorId: session.visitorId === 'unknown' ? null : session.visitorId,
      device: session.device, country: session.country,
      utmParams: {
        source: session.source, channel: session.channel, utm_source: session.utmSource, utm_medium: session.utmMedium, utm_campaign: session.utmCampaign,
        utm_content: session.utmContent, utm_term: session.utmTerm, referrer: session.referrerDomain, landing: session.landingSlug,
      },
    },
  })
  if (!first) return
  const info = await projectInfo(projectId)
  const hit = goalsReached(info.settings, { kind: 'lead' })
  const now = new Date()
  await db.analyticsEvent.create({ data: { projectId, sessionId: session.id, slug: session.exitSlug, type: 'lead', ts: now, data: { leadId } } })
  const conv = hit.find(g => g.conversion)
  if (conv && !session.converted) await db.analyticsSession.update({ where: { id: session.id }, data: { converted: true, goal: conv.name, convertedAt: now, leadId } })
  else await db.analyticsSession.update({ where: { id: session.id }, data: { leadId } })
}


/**
 * A funnel step swapped in place is not a request the server sees. When the page's behaviour script is working it reports the
 * step itself; when it is not (blocked), this view beacon is the only sign, so the step is counted here.
 */
async function countStepView(projectId: string, sid: string, slug: string) {
  const session = await db.analyticsSession.findUnique({ where: { projectId_sid: { projectId, sid } }, select: { id: true, jsSeen: true, pageCount: true } })
  if (!session || session.jsSeen) return
  const last = await db.analyticsPageview.findFirst({ where: { sessionId: session.id }, orderBy: { seq: 'desc' }, select: { seq: true, slug: true } })
  if (last && last.slug === slug) return
  await db.analyticsPageview.create({ data: { projectId, sessionId: session.id, seq: (last?.seq ?? 0) + 1, slug, enteredAt: new Date() } }).catch(() => {})
  await db.analyticsSession.update({ where: { id: session.id }, data: { pageCount: { increment: 1 }, exitSlug: slug, lastSeenAt: new Date() } })
}
