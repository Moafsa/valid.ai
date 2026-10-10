import { db } from '@funnelai/db'
import { Prisma } from '@funnelai/db'
import { parseUa } from './ua'
import { classifyChannel, normalizeSource } from './channel'
import { geoFor } from './geo'
import { goalsReached, isCheckoutHref, projectInfo, type AnalyticsSettings } from './goals'

/**
 * Takes what the page's script (public/vai-m.js) sent and writes it as sessions, page views, clicks,
 * events and video views, all tied to one visit (sid) and one browser (vid).
 *
 * Nothing here trusts the page: every number is clamped, every string cut, unknown things dropped. The visitor's
 * address is used for the country lookup and then forgotten.
 */

interface Ctx {
  n?: number; bot?: number; ua?: string; sw?: number; sh?: number; vw?: number; vh?: number; lang?: string; tz?: string; touch?: number
  conn?: { et?: string; sd?: boolean } | null; dpr?: number; mem?: number; cores?: number
  a?: { ref?: string; rd?: string; us?: string; um?: string; uc?: string; ut?: string; ux?: string; cid?: string; cidt?: string; land?: string; host?: string }
  mode?: string; host?: string; exp?: { id?: string; v?: string } | null; t0?: number
}
export interface Batch {
  v?: number; b?: string; cn?: number; p: string; s: string; vid: string; c?: Ctx; e?: any[]
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v ? v.slice(0, max) : null)
const int = (v: unknown, lo = 0, hi = 2_000_000_000): number => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo }
const slugOf = (v: unknown) => str(v, 120)

// a batch that is retried must not count twice
const seen = new Set<string>()
function firstTime(id: string | undefined): boolean {
  if (!id) return true
  if (seen.has(id)) return false
  seen.add(id)
  if (seen.size > 20000) for (const k of Array.from(seen).slice(0, 5000)) seen.delete(k)
  return true
}

// a crude per-address brake: a page does not send more than a few batches a minute
const hits = new Map<string, { n: number; at: number }>()
export function tooBusy(key: string, limit = 240): boolean {
  const now = Date.now()
  const h = hits.get(key)
  if (!h || now - h.at > 60_000) { hits.set(key, { n: 1, at: now }); if (hits.size > 20000) hits.clear(); return false }
  h.n++
  return h.n > limit
}

export function mergeRanges(r: [number, number][]): [number, number][] {
  const a = r.filter(x => Array.isArray(x) && x.length >= 2 && Number.isFinite(x[0]) && Number.isFinite(x[1]) && x[1] >= x[0]).map(x => [Math.max(0, Math.round(x[0])), Math.min(86400, Math.round(x[1]))] as [number, number]).sort((x, y) => x[0] - y[0])
  const out: [number, number][] = []
  for (const x of a) {
    const l = out[out.length - 1]
    if (l && x[0] <= l[1] + 1) l[1] = Math.max(l[1], x[1])
    else out.push([x[0], x[1]])
  }
  return out.slice(0, 200)
}
const covered = (r: [number, number][]) => r.reduce((t, x) => t + (x[1] - x[0] + 1), 0)

/** the visit's row; created on its first sign of life, completed when the page's description arrives */
export async function ensureSession(projectId: string, sid: string, vid: string, received: number, ctx?: Ctx, ip?: string | null) {
  const found = await db.analyticsSession.findUnique({ where: { projectId_sid: { projectId, sid } } })
  // the server wrote this visit when the page was opened (who, from where, on what): the browser now adds what only it can see
  if (found && found.device && ctx && !found.viewportW) {
    const ua = parseUa(ctx.ua, { touch: !!ctx.touch, sw: ctx.sw, sh: ctx.sh, vw: ctx.vw })
    const geo = found.country ? null : geoFor(ip ?? null, ctx.tz, ctx.lang)
    return db.analyticsSession.update({ where: { id: found.id }, data: {
      deviceBrand: ua.brand ?? found.deviceBrand, deviceModel: ua.model ?? found.deviceModel, inApp: ua.inApp ?? found.inApp,
      connection: str(ctx.conn?.et, 10), saveData: typeof ctx.conn?.sd === 'boolean' ? ctx.conn.sd : null,
      dpr: ctx.dpr ? Math.min(8, Math.max(0.5, Number(ctx.dpr))) : null, memoryGb: ctx.mem ? Number(ctx.mem) : null, cores: ctx.cores ? int(ctx.cores, 1, 256) : null,
      screenW: ctx.sw ? int(ctx.sw, 0, 20000) : null, screenH: ctx.sh ? int(ctx.sh, 0, 20000) : null,
      viewportW: ctx.vw ? int(ctx.vw, 0, 20000) : null, viewportH: ctx.vh ? int(ctx.vh, 0, 20000) : null,
      timezone: str(ctx.tz, 60), language: found.language || str(ctx.lang, 12), device: ua.device,
      ...(geo?.country ? { country: geo.country, region: geo.region, city: geo.city } : {}),
      expId: found.expId || str(ctx.exp?.id, 40), variant: found.variant || str(ctx.exp?.v, 40),
    } })
  }
  if (found && (found.device || !ctx)) return found
  // seen before being described (a recording chunk or a lead arrived first): a bare row, completed by the next batch
  if (!ctx) {
    try {
      return await db.analyticsSession.create({ data: { projectId, sid, visitorId: vid.slice(0, 40), startedAt: new Date(received), lastSeenAt: new Date(received) } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await db.analyticsSession.findUnique({ where: { projectId_sid: { projectId, sid } } })
        if (again) return again
      }
      throw e
    }
  }

  const a = ctx?.a || {}
  const uaInfo = parseUa(ctx?.ua, { touch: !!ctx?.touch, sw: ctx?.sw, sh: ctx?.sh, vw: ctx?.vw })
  const geo = geoFor(ip ?? null, ctx?.tz, ctx?.lang)
  const ownHost = str(ctx?.host || a.host, 120)
  const refDomain = str(a.rd, 120)
  const ch = classifyChannel({ referrerDomain: refDomain, ownHost, utmSource: a.us, utmMedium: a.um, clickIdType: a.cidt || null })
  const startedAt = new Date(Math.min(received, ctx?.t0 && ctx?.t0 > 0 ? ctx.t0 + 0 : received))
  const data = {
    mode: ctx?.mode === 'draft' ? 'draft' : 'published',
    host: ownHost,
    landingPath: str(a.land, 200),
    referrer: str(a.ref, 300), referrerDomain: refDomain,
    channel: ch.channel, source: ch.source,
    utmSource: str(a.us, 100), utmMedium: str(a.um, 100), utmCampaign: str(a.uc, 150), utmContent: str(a.ut, 150), utmTerm: str(a.ux, 150),
    clickId: str(a.cid, 80), clickIdType: str(a.cidt, 20),
    device: uaInfo.device, browser: uaInfo.browser, browserVersion: uaInfo.browserVersion, os: uaInfo.os, osVersion: uaInfo.osVersion,
    deviceBrand: uaInfo.brand, deviceModel: uaInfo.model, inApp: uaInfo.inApp,
    connection: str(ctx?.conn?.et, 10), saveData: typeof ctx?.conn?.sd === 'boolean' ? ctx.conn.sd : null,
    dpr: ctx?.dpr ? Math.min(8, Math.max(0.5, Number(ctx.dpr))) : null, memoryGb: ctx?.mem ? Number(ctx.mem) : null, cores: ctx?.cores ? int(ctx.cores, 1, 256) : null,
    screenW: ctx?.sw ? int(ctx.sw, 0, 20000) : null, screenH: ctx?.sh ? int(ctx.sh, 0, 20000) : null,
    viewportW: ctx?.vw ? int(ctx.vw, 0, 20000) : null, viewportH: ctx?.vh ? int(ctx.vh, 0, 20000) : null,
    language: str(ctx?.lang, 12), timezone: str(ctx?.tz, 60),
    country: geo.country, region: geo.region, city: geo.city,
    isNew: !!ctx?.n, isBot: !!ctx?.bot || uaInfo.bot,
    expId: str(ctx?.exp?.id, 40), variant: str(ctx?.exp?.v, 40),
  }
  try {
    if (found) {
      const done = await db.analyticsSession.update({ where: { id: found.id }, data: { ...data, ...(found.visitorId === 'unknown' ? { visitorId: vid.slice(0, 40) } : {}), startedAt: found.startedAt < startedAt ? found.startedAt : startedAt } })
      // a lead can be saved before the page said who the visitor is: it takes the origin, device and country now
      const orphans = await db.lead.findMany({ where: { sessionId: found.id }, select: { id: true } })
      for (const l of orphans) {
        await db.lead.update({ where: { id: l.id }, data: {
          visitorId: done.visitorId === 'unknown' ? null : done.visitorId, device: done.device, country: done.country,
          utmParams: { source: done.source, channel: done.channel, utm_source: done.utmSource, utm_medium: done.utmMedium, utm_campaign: done.utmCampaign, utm_content: done.utmContent, utm_term: done.utmTerm, referrer: done.referrerDomain, landing: done.landingSlug },
        } })
      }
      return done
    }
    return await db.analyticsSession.create({ data: { projectId, sid, visitorId: vid.slice(0, 40), startedAt, lastSeenAt: new Date(received), ...data } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const again = await db.analyticsSession.findUnique({ where: { projectId_sid: { projectId, sid } } })
      if (again) return again
    }
    throw e
  }
}

export async function ingest(body: Batch, ip: string | null): Promise<{ ok: boolean; skipped?: string }> {
  const projectId = str(body.p, 40), sid = str(body.s, 40), vid = str(body.vid, 40)
  if (!projectId || !sid || !vid) return { ok: false, skipped: 'ids' }
  const info = await projectInfo(projectId)
  if (!info.ok) return { ok: false, skipped: 'project' }
  // only the published site is measured: the working copy (editor link) never counts
  if (body.c?.mode === 'draft') return { ok: true, skipped: 'draft' }
  if (!firstTime(body.b)) return { ok: true, skipped: 'duplicate' }

  const received = Date.now()
  const offset = typeof body.cn === 'number' && Number.isFinite(body.cn) ? received - body.cn : 0
  const tsOf = (t: unknown): Date => {
    const n = Number(t)
    const when = Number.isFinite(n) && n > 0 ? n + offset : received
    return new Date(Math.min(received, Math.max(received - 6 * 3600_000, when)))
  }
  const ctx = body.c
  // the page's own clock is only good for the order of things: the first time the visit is seen is "now" for the server
  if (ctx?.t0) ctx.t0 = tsOf(ctx.t0).getTime()
  const session = await ensureSession(projectId, sid, vid, received, ctx, ip)
  const items = (Array.isArray(body.e) ? body.e : []).slice(0, 120)
  if (!items.length) return { ok: true }

  const settings: AnalyticsSettings = info.settings
  const device = session.device
  const inc = { clickCount: 0, rageCount: 0, deadCount: 0, ctaClicks: 0, videoPlays: 0, formStarts: 0 }
  let maxScroll = session.maxScroll
  let interacted = session.interacted
  let converted = session.converted
  let goalName: string | null = session.goal
  let convertedAt: Date | null = session.convertedAt
  let lastSlug: string | null = session.exitSlug
  let landingSlug: string | null = session.landingSlug
  let videoMaxPct = session.videoMaxPct
  let pagesTouched = false
  let vitals: { lcpMs: number | null; fcpMs: number | null; ttfbMs: number | null; loadMs: number | null; cls: number | null } | null = null
  let activeTouched = false

  const reach = (hit: ReturnType<typeof goalsReached>, at: Date, events: Prisma.AnalyticsEventCreateManyInput[], slug: string | null) => {
    for (const g of hit) {
      events.push({ projectId, sessionId: session.id, slug, type: 'goal', ts: at, data: { id: g.id, name: g.name, type: g.type } })
      if (g.conversion && !converted) { converted = true; goalName = g.name; convertedAt = at }
    }
  }

  const events: Prisma.AnalyticsEventCreateManyInput[] = []
  const clicks: Prisma.AnalyticsClickCreateManyInput[] = []

  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    const at = tsOf(it.ts)
    const slug = slugOf(it.slug)
    switch (it.t) {
      case 'pv': {
        const seq = int(it.seq, 0, 100000)
        await upsertPageview(session.id, projectId, seq, { slug, path: str(it.path, 200), title: str(it.title, 120), enteredAt: at }, true)
        lastSlug = slug ?? lastSlug
        landingSlug = landingSlug ?? slug
        pagesTouched = true
        reach(goalsReached(settings, { kind: 'page', slug }), at, events, slug)
        break
      }
      case 'eng':
      case 'exit': {
        const seq = int(String(it.pv || '').split('.').pop(), 0, 100000)
        const bands = Array.isArray(it.bd) ? it.bd.slice(0, 10).map((n: unknown) => int(n, 0, 3600)) : []
        const sc = int(it.sc, 0, 100)
        await upsertPageview(session.id, projectId, seq, {
          slug, activeMs: int(it.act, 0, 6 * 3600_000), maxScroll: sc, clicks: int(it.ck, 0, 100000), bands,
          ...(it.t === 'exit' ? { leftAt: at, exitKind: str(it.k, 20) || 'leave' } : { leftAt: at }),
          enteredAt: new Date(at.getTime() - int(it.tot, 0, 6 * 3600_000)),
        }, false)
        if (sc > maxScroll) maxScroll = sc
        if (sc >= 25) interacted = true
        activeTouched = true
        break
      }
      case 'ck': {
        const href = str(it.href, 220)
        const text = str(it.tx, 60)
        clicks.push({
          projectId, sessionId: session.id, slug, ts: at, sel: str(it.sel, 240), tag: str(it.tag, 20), text, href,
          x: int(it.x, 0, 100000), y: int(it.y, 0, 1000000), docW: int(it.dw, 0, 100000), docH: int(it.dh, 0, 1000000), vw: int(it.vw, 0, 20000), vh: int(it.vh, 0, 20000),
          ox: int(it.ox, 0, 1000), oy: int(it.oy, 0, 1000), device, isCta: !!it.cta, dead: false, rage: !!it.rage, video: !!it.vi,
        })
        inc.clickCount++
        if (it.cta) inc.ctaClicks++
        interacted = true
        if (isCheckoutHref(href)) events.push({ projectId, sessionId: session.id, slug, type: 'checkout', ts: at, data: { href, text } })
        reach(goalsReached(settings, { kind: 'click', text, href }), at, events, slug)
        reach(goalsReached(settings, { kind: 'outbound', href }), at, events, slug)
        break
      }
      case 'ev': {
        const k = str(it.k, 30)
        if (!k) break
        const d = it.d && typeof it.d === 'object' ? it.d : {}
        if (k === 'dead') {
          inc.deadCount++
          const around = tsOf(d.at)
          await db.analyticsClick.updateMany({ where: { sessionId: session.id, sel: str(d.sel, 240), dead: false, ts: { gte: new Date(around.getTime() - 3000), lte: new Date(around.getTime() + 3000) } }, data: { dead: true } })
        } else if (k === 'rage') inc.rageCount++
        else if (k === 'form_start') { inc.formStarts++; interacted = true }
        else if (k === 'video_play') { inc.videoPlays++; interacted = true }
        else if (k === 'vitals') {
          // how fast the page really was for this person: kept once per visit, from its first page
          if (session.lcpMs == null && session.loadMs == null) {
            vitals = { lcpMs: d.lcp ? int(d.lcp, 0, 120000) : null, fcpMs: d.fcp ? int(d.fcp, 0, 120000) : null, ttfbMs: d.ttfb ? int(d.ttfb, 0, 120000) : null, loadMs: d.load ? int(d.load, 0, 300000) : null, cls: Number.isFinite(Number(d.cls)) ? Math.min(10, Math.max(0, Number(d.cls))) : null }
          }
        }
        else if (k === 'outbound') reach(goalsReached(settings, { kind: 'outbound', href: str(d.href, 220) }), at, events, slug)
        const data = JSON.parse(JSON.stringify(d).slice(0, 1500) || '{}')
        events.push({ projectId, sessionId: session.id, slug, type: k, ts: at, data })
        break
      }
      case 'vd': {
        const src = str(it.src, 200)
        if (!src) break
        const rg = mergeRanges(Array.isArray(it.rg) ? it.rg : [])
        const dur = int(it.dur, 0, 86400)
        const mx = int(it.mx, 0, 86400)
        const ended = !!it.end
        const prev = await db.videoView.findUnique({ where: { sessionId_src: { sessionId: session.id, src } } })
        const ranges = mergeRanges([...(((prev?.ranges as any) || []) as [number, number][]), ...rg])
        const duration = Math.max(prev?.duration || 0, dur)
        const maxTime = Math.max(prev?.maxTime || 0, mx, ranges.length ? ranges[ranges.length - 1][1] : 0)
        const data = { slug, duration, plays: Math.max(prev?.plays || 0, int(it.plays, 0, 1000)), ranges: ranges as any, maxTime, watchedSecs: covered(ranges), ended: (prev?.ended || false) || ended, leftAt: int(it.at, 0, 86400) }
        if (prev) await db.videoView.update({ where: { id: prev.id }, data })
        else await db.videoView.create({ data: { projectId, sessionId: session.id, src, firstPlayAt: at, ...data } })
        const pct = data.ended ? 100 : duration > 0 ? Math.min(100, Math.round((maxTime / duration) * 100)) : 0
        if (pct > videoMaxPct) videoMaxPct = pct
        interacted = true
        reach(goalsReached(settings, { kind: 'video', pct }), at, events, slug)
        break
      }
      default: break
    }
  }

  if (clicks.length) await db.analyticsClick.createMany({ data: clicks })
  if (events.length) await db.analyticsEvent.createMany({ data: events })

  const pageCount = pagesTouched ? Math.max(session.pageCount, await db.analyticsPageview.count({ where: { sessionId: session.id } })) : session.pageCount
  let activeMs = session.activeMs
  if (activeTouched) {
    const agg = await db.analyticsPageview.aggregate({ where: { sessionId: session.id }, _sum: { activeMs: true } })
    activeMs = agg._sum.activeMs || 0
  }
  const ctaTotal = session.ctaClicks + inc.ctaClicks, rageTotal = session.rageCount + inc.rageCount, formsTotal = session.formStarts + inc.formStarts
  const score = leadScore({ converted, activeMs, maxScroll, videoMaxPct, cta: ctaTotal > 0, form: formsTotal > 0, rage: rageTotal > 0 })
  await db.analyticsSession.update({
    where: { id: session.id },
    data: {
      score, ...(vitals ?? {}),
      lastSeenAt: new Date(received),
      durationMs: Math.max(session.durationMs, received - session.startedAt.getTime()),
      activeMs, pageCount, maxScroll, interacted, videoMaxPct, exitSlug: lastSlug, landingSlug, jsSeen: true,
      clickCount: { increment: inc.clickCount }, rageCount: { increment: inc.rageCount }, deadCount: { increment: inc.deadCount },
      ctaClicks: { increment: inc.ctaClicks }, videoPlays: { increment: inc.videoPlays }, formStarts: { increment: inc.formStarts },
      ...(converted && !session.converted ? { converted: true, goal: goalName, convertedAt } : {}),
    },
  })
  return { ok: true }
}

async function upsertPageview(sessionId: string, projectId: string, seq: number, f: {
  slug?: string | null; path?: string | null; title?: string | null; enteredAt?: Date; leftAt?: Date; activeMs?: number; maxScroll?: number; clicks?: number; exitKind?: string | null; bands?: number[]
}, isStart: boolean) {
  const key = { sessionId_seq: { sessionId, seq } }
  for (let tries = 0; tries < 2; tries++) {
    const row = await db.analyticsPageview.findUnique({ where: key })
    if (!row) {
      try {
        await db.analyticsPageview.create({ data: { projectId, sessionId, seq, slug: f.slug ?? null, path: f.path ?? null, title: f.title ?? null, enteredAt: f.enteredAt ?? new Date(), leftAt: f.leftAt ?? null, activeMs: f.activeMs ?? 0, maxScroll: f.maxScroll ?? 0, clicks: f.clicks ?? 0, exitKind: f.exitKind ?? null, bands: f.bands && f.bands.length ? (f.bands as any) : undefined } })
        return
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue
        throw e
      }
    }
    const prevBands = Array.isArray(row.bands) ? (row.bands as number[]) : []
    const bands = f.bands && f.bands.length ? Array.from({ length: 10 }, (_, i) => (prevBands[i] || 0) + (f.bands![i] || 0)) : undefined
    await db.analyticsPageview.update({
      where: { id: row.id },
      data: {
        ...(isStart ? { slug: f.slug ?? row.slug, path: f.path ?? row.path, title: f.title ?? row.title, enteredAt: f.enteredAt && f.enteredAt < row.enteredAt ? f.enteredAt : row.enteredAt } : {}),
        ...(f.leftAt && (!row.leftAt || f.leftAt > row.leftAt) ? { leftAt: f.leftAt } : {}),
        // a "left" mark is final: later heartbeats of the same page do not take it back
        ...(f.exitKind ? { exitKind: f.exitKind } : {}),
        activeMs: Math.max(row.activeMs, f.activeMs ?? 0), maxScroll: Math.max(row.maxScroll, f.maxScroll ?? 0), clicks: Math.max(row.clicks, f.clicks ?? 0),
        ...(bands ? { bands: bands as any } : {}),
      },
    })
    return
  }
}

export { normalizeSource }

/** How promising a visit looks, 0-100, from what the person did (a conversion counts most, then time, depth, the video, the button, the form). */
export function leadScore(v: { converted: boolean; activeMs: number; maxScroll: number; videoMaxPct: number; cta: boolean; form: boolean; rage: boolean }): number {
  const pts = (v.converted ? 45 : 0) + Math.min(20, Math.round(v.activeMs / 1000 / 3)) + Math.round((Math.min(100, v.maxScroll) / 100) * 10) + Math.round((Math.min(100, v.videoMaxPct) / 100) * 15) + (v.cta ? 7 : 0) + (v.form ? 3 : 0) - (v.rage ? 5 : 0)
  return Math.max(0, Math.min(100, pts))
}
