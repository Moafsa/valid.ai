import { NextRequest, NextResponse } from 'next/server'
import { gunzipSync } from 'node:zlib'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { Prisma } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { parseFilters, sessionWhere, num, type Filters } from '@/lib/analytics/filters'
import { breakdown, DIMENSION_KEYS, pagesTable, previousPeriod, sessionDetail, sessionsList, timeseries, totals, type Dimension } from '@/lib/analytics/queries'
import { abandonment, attentionElements, clickMap, frictions, scrollMap } from '@/lib/analytics/behaviour'
import { COMPARE_DIMS, retention, retentionBy, videoList, type CompareDim } from '@/lib/analytics/video'
import { journey, paths } from '@/lib/analytics/funnel'
import { audience } from '@/lib/analytics/audience'
import { experimentResults, readVariants } from '@/lib/analytics/experiments'
import { buildSnapshot } from '@/lib/analytics/snapshot'
import { buildInsights } from '@/lib/analytics/insights'
import { aiReport, AiUnavailable } from '@/lib/analytics/ai'
import { forgetProject, readSettings } from '@/lib/analytics/goals'
import { currentAdmin } from '@/lib/admin'
import { gate, gateResponse } from '@/lib/plans'

/**
 * Everything the Métricas screens read, one URL per view: /api/projects/<id>/analytics/<view>?period=7d&source=facebook...
 * Only the project's owner gets answers (the collector, which anyone can post to, lives at /api/collect).
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function owned(id: string) {
  const sel = { id: true, name: true, slug: true, status: true, analyticsSettings: true, workspaceId: true }
  if (await currentAdmin()) return db.project.findUnique({ where: { id }, select: sel })        // the administrator may read any project
  const workspace = await getCurrentWorkspace()
  if (!workspace) return null
  return db.project.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true, name: true, slug: true, status: true, analyticsSettings: true, workspaceId: true } })
}

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } })

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; view: string }> }) {
  const { id, view } = await params
  const project = await owned(id)
  if (!project) return json({ error: 'Not found' }, 404)
  if (project.status !== 'PUBLISHED') return json({ error: 'As métricas ficam disponíveis depois de publicar o site.', code: 'not_published' }, 403)
  const q = req.nextUrl.searchParams
  const f = parseFilters(q)
  try {
    switch (view) {
      case 'overview': {
        const [cur, prev, series, sources, devices, countries, campaigns, pages, entry, exit, channels, browsers, os, regions] = await Promise.all([
          totals(id, f), totals(id, previousPeriod(f)), timeseries(id, f),
          breakdown(id, f, 'source', { limit: 8 }), breakdown(id, f, 'device', { limit: 4 }), breakdown(id, f, 'country', { limit: 8 }), breakdown(id, f, 'campaign', { limit: 8 }),
          pagesTable(id, f), breakdown(id, f, 'landing', { limit: 6 }), breakdown(id, f, 'exit', { limit: 6 }), breakdown(id, f, 'channel', { limit: 7 }),
          breakdown(id, f, 'browser', { limit: 6 }), breakdown(id, f, 'os', { limit: 6 }), breakdown(id, f, 'region', { limit: 8 }),
        ])
        return json({ totals: cur, previous: prev, series, sources, devices, countries, campaigns, pages, entry, exit, channels, browsers, os, regions })
      }
      case 'breakdown': {
        const dim = q.get('dim') as Dimension
        if (!DIMENSION_KEYS.includes(dim)) return json({ error: 'dim' }, 400)
        return json({ rows: await breakdown(id, f, dim, { limit: Math.min(100, Number(q.get('limit')) || 30) }) })
      }
      case 'pages': return json({ rows: await pagesTable(id, f), abandonment: await abandonment(id, f) })
      case 'sessions': {
        return json(await sessionsList(id, f, { page: Number(q.get('page')) || 1, size: Number(q.get('size')) || 30, sort: q.get('sort') || 'recent', lead: q.get('lead') === '1', rec: q.get('rec') === '1' }))
      }
      case 'session': {
        const d = await sessionDetail(id, q.get('id') || '')
        return d ? json(d) : json({ error: 'Not found' }, 404)
      }
      case 'journey': {
        const [j, p] = await Promise.all([journey(id, f), paths(id, f)])
        return json({ ...j, paths: p })
      }
      case 'video': {
        const list = await videoList(id, f)
        const src = q.get('src') || list.find(v => !v.embedded && v.plays > 0)?.src || null
        if (!src) return json({ videos: list, retention: null, compare: [] })
        const r = await retention(id, f, src)
        const dim = (q.get('by') || 'source') as CompareDim
        const compare = r && dim in COMPARE_DIMS ? await retentionBy(id, f, src, dim, r.duration) : []
        return json({ videos: list, src, retention: r, compare, by: dim })
      }
      case 'heatmap': {
        const slug = q.get('page') || ''
        const device = q.get('device') || 'desktop'
        if (!slug) return json({ error: 'page' }, 400)
        const [clicks, scroll] = await Promise.all([clickMap(id, f, slug, device), scrollMap(id, f, slug, device)])
        return json({ clicks, scroll })
      }
      case 'frictions': {
        const t = await totals(id, f)
        const [fr, att] = await Promise.all([frictions(id, f), attentionElements(id, f, t.conversionRate)])
        return json({ ...fr, attention: att, abandonment: await abandonment(id, f) })
      }
      case 'recordings': {
        const where = sessionWhere(id, f)
        const rows = await db.$queryRaw<any[]>(Prisma.sql`
          SELECT r.id, r."sessionId", r."startedAt", r."durationMs", r.events, r.bytes, r.device, r."viewportW", r."viewportH",
            s.source, s."utmCampaign", s.country, s.browser, s.os, s."pageCount", s."clickCount", s."rageCount", s."deadCount", s.converted, s."maxScroll", s."landingSlug", s."exitSlug"
          FROM analytics_recordings r JOIN analytics_sessions s ON s.id = r."sessionId" WHERE ${where} AND r."durationMs" >= 2000
          ORDER BY ${q.get('sort') === 'frustrated' ? Prisma.sql`(s."rageCount" * 3 + s."deadCount") DESC,` : Prisma.empty} r."startedAt" DESC LIMIT 60`)
        return json({ rows: rows.map(r => ({ ...r, durationMs: num(r.durationMs), events: num(r.events), bytes: num(r.bytes) })) })
      }
      case 'recording': {
        const sessionId = q.get('session') || ''
        const rec = await db.recording.findFirst({ where: { sessionId, projectId: id }, include: { chunks: { orderBy: { seq: 'asc' } } } })
        if (!rec) return json({ error: 'Not found' }, 404)
        const events: unknown[] = []
        for (const c of rec.chunks) {
          try { events.push(...JSON.parse(gunzipSync(Buffer.from(c.data)).toString('utf8'))) } catch { /* a damaged chunk is skipped */ }
        }
        events.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0))
        return json({ id: rec.id, startedAt: rec.startedAt, durationMs: rec.durationMs, viewportW: rec.viewportW, viewportH: rec.viewportH, device: rec.device, events })
      }
      case 'insights': {
        const snap = await buildSnapshot(id, f)
        return json({ insights: buildInsights(snap), snapshot: { totals: snap.totals } })
      }
      case 'experiments': {
        const list = await db.experiment.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' } })
        const pages = await db.page.findMany({ where: { projectId: id, NOT: { slug: { endsWith: '__m' } } }, orderBy: { order: 'asc' }, select: { slug: true, name: true } })
        const out = []
        for (const e of list) out.push({ id: e.id, name: e.name, kind: e.kind, status: e.status, goal: e.goal, startedAt: e.startedAt, endedAt: e.endedAt, winner: e.winner, results: await experimentResults(id, e.id) })
        return json({ experiments: out, pages, published: project.status === 'PUBLISHED' })
      }
      case 'audience': return json(await audience(id, f))
      case 'live': {
        const rows = await db.$queryRaw<any[]>(Prisma.sql`
          SELECT s."exitSlug" AS slug, s.source, s.device, s.country, s."startedAt" FROM analytics_sessions s
          WHERE s."projectId" = ${id} AND s."isBot" = false AND s.device IS NOT NULL AND s."lastSeenAt" >= now() - interval '5 minutes' ORDER BY s."lastSeenAt" DESC LIMIT 20`)
        return json({ count: rows.length, rows })
      }
      case 'settings': return json({ settings: readSettings(project.analyticsSettings), slug: project.slug, published: project.status === 'PUBLISHED' })
      case 'options': {
        // what the filter menus offer: only values that exist in this project
        const base = Prisma.sql`s."projectId" = ${id} AND s."isBot" = false AND s.device IS NOT NULL`
        const col = async (c: string) => (await db.$queryRawUnsafe<any[]>(`SELECT ${c} AS v, count(*) AS n FROM analytics_sessions s WHERE s."projectId" = $1 AND s."isBot" = false AND s.device IS NOT NULL AND ${c} IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 40`, id)).map(r => String(r.v))
        void base
        const pageRows = await db.$queryRaw<any[]>(Prisma.sql`SELECT DISTINCT p.slug FROM analytics_pageviews p WHERE p."projectId" = ${id} AND p.slug IS NOT NULL ORDER BY 1 LIMIT 80`)
        const [source, campaign, medium, content, device, browser, os, country, host, channel] = await Promise.all(['s."source"', 's."utmCampaign"', 's."utmMedium"', 's."utmContent"', 's."device"', 's."browser"', 's."os"', 's."country"', 's."host"', 's."channel"'].map(col))
        return json({ page: pageRows.map(r => r.slug), source, campaign, medium, content, device, browser, os, country, host, channel })
      }
      default: return json({ error: 'Unknown view' }, 404)
    }
  } catch (e) {
    console.error('analytics view error', view, e)
    return json({ error: 'Não consegui ler as métricas agora.' }, 500)
  }
}

const goalSchema = z.object({
  id: z.string().min(1).max(40), name: z.string().min(1).max(60), type: z.enum(['lead', 'checkout', 'page', 'click', 'video', 'outbound']),
  value: z.string().max(200).optional(), conversion: z.boolean().default(true),
})
const settingsSchema = z.object({
  goals: z.array(goalSchema).max(20),
  recording: z.object({ on: z.boolean(), sample: z.number().min(0).max(1), maxPerDay: z.number().int().min(0).max(5000) }),
})
const experimentSchema = z.object({
  action: z.literal('create'), name: z.string().min(1).max(80), kind: z.enum(['page', 'headline', 'image', 'video', 'cta', 'other']).default('page'),
  goal: z.string().max(80).default('lead'),
  variants: z.array(z.object({ name: z.string().min(1).max(60), slug: z.string().min(1).max(120), weight: z.number().int().min(1).max(100).default(50) })).min(2).max(6),
}).or(z.object({ action: z.enum(['pause', 'resume', 'finish']), id: z.string(), winner: z.string().optional() })).or(z.object({ action: z.literal('delete'), id: z.string() }))

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; view: string }> }) {
  const { id, view } = await params
  const project = await owned(id)
  if (!project) return json({ error: 'Not found' }, 404)
  if (project.status !== 'PUBLISHED') return json({ error: 'As métricas ficam disponíveis depois de publicar o site.', code: 'not_published' }, 403)
  try {
    if (view === 'settings') {
      const body = settingsSchema.parse(await req.json())
      await db.project.update({ where: { id }, data: { analyticsSettings: body as any } })
      forgetProject(id)
      return json({ ok: true, settings: readSettings(body) })
    }
    if (view === 'experiments') {
      const body = experimentSchema.parse(await req.json())
      if (body.action === 'create') {
        const pages = await db.page.findMany({ where: { projectId: id }, select: { slug: true } })
        const have = new Set(pages.map(p => p.slug))
        const bad = body.variants.find(v => !have.has(v.slug))
        if (bad) return json({ error: `A página "${bad.slug}" não existe neste projeto.` }, 400)
        if (new Set(body.variants.map(v => v.slug)).size !== body.variants.length) return json({ error: 'Cada versão precisa ser uma página diferente.' }, 400)
        const busy = await db.experiment.findMany({ where: { projectId: id, status: 'running' } })
        if (busy.some(e => readVariants(e.variants)[0]?.slug === body.variants[0].slug)) return json({ error: 'Já existe um teste rodando nessa página. Encerre ou pause o outro antes.' }, 409)
        const variants = body.variants.map((v, i) => ({ id: `v${i + 1}`, name: v.name, slug: v.slug, weight: v.weight }))
        const e = await db.experiment.create({ data: { projectId: id, name: body.name, kind: body.kind, goal: body.goal, variants: variants as any } })
        return json({ ok: true, id: e.id })
      }
      const e = await db.experiment.findFirst({ where: { id: body.id, projectId: id } })
      if (!e) return json({ error: 'Not found' }, 404)
      if (body.action === 'delete') await db.experiment.delete({ where: { id: e.id } })
      else if (body.action === 'pause') await db.experiment.update({ where: { id: e.id }, data: { status: 'paused' } })
      else if (body.action === 'resume') {
        const busy = await db.experiment.findMany({ where: { projectId: id, status: 'running', NOT: { id: e.id } } })
        if (busy.some(o => readVariants(o.variants)[0]?.slug === readVariants(e.variants)[0]?.slug)) return json({ error: 'Já existe um teste rodando nessa página.' }, 409)
        await db.experiment.update({ where: { id: e.id }, data: { status: 'running', endedAt: null, winner: null } })
      } else if (body.action === 'finish') {
        const variants = readVariants(e.variants)
        const winner = body.winner && variants.some(v => v.id === body.winner) ? body.winner : null
        await db.experiment.update({ where: { id: e.id }, data: { status: 'done', endedAt: new Date(), winner } })
      }
      return json({ ok: true })
    }
    if (view === 'ai') {
      const f: Filters = parseFilters(req.nextUrl.searchParams)
      const snap = await buildSnapshot(id, f)
      const rules = buildInsights(snap)
      if (snap.totals.sessions < 5) return json({ error: 'Ainda não há visitas suficientes para a IA analisar.', code: 'few' }, 422)
      const ws = await db.workspace.findUnique({ where: { id: project.workspaceId }, select: { id: true, planKey: true, subscriptionStatus: true, planUntil: true } })
      if (ws && !(await currentAdmin())) {
        const g = await gate(ws, 'aiCalls')
        if (!g.ok) return json({ ...gateResponse(g), insights: rules }, 403)
      }
      try {
        const report = await aiReport(snap, rules)
        if (ws) db.aiUsageLog.create({ data: { workspaceId: ws.id, projectId: id, operation: 'analytics_ai', model: report.model, provider: report.provider } }).catch(() => {})
        return json({ report, insights: rules })
      } catch (e) {
        if (e instanceof AiUnavailable) return json({ error: e.code === 'no_ai_key' ? 'A IA ainda não foi conectada neste projeto.' : e.code === 'timeout' ? 'A IA demorou demais. Tente de novo.' : 'A IA não conseguiu responder agora. Tente de novo.', code: e.code, insights: rules }, 503)
        throw e
      }
    }
    return json({ error: 'Unknown view' }, 404)
  } catch (e) {
    if (e instanceof z.ZodError) return json({ error: 'Dados inválidos.' }, 400)
    console.error('analytics post error', view, e)
    return json({ error: 'Não consegui salvar agora.' }, 500)
  }
}
