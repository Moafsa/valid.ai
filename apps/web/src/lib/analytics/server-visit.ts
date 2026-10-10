import { db } from '@funnelai/db'
import { Prisma } from '@funnelai/db'
import { parseUa } from './ua'
import { classifyChannel } from './channel'
import { clientIp, geoFor } from './geo'
import { cookieOf } from './experiments'

/**
 * The server's own record of an entry into the published site.
 *
 * Every time a person opens a page of the published site the server already knows the essentials (who, from where, on what,
 * which page), so it writes the visit itself instead of waiting for the page's script to say so. That way nothing depends on
 * the visitor's browser cooperating: a tracker blocker, JavaScript turned off, or someone who leaves in half a second are all
 * counted. The page's script then adopts the same visit (same ids) and adds what only a browser can see: clicks, scroll, video,
 * time on the page, recordings.
 */
export const VISITOR_COOKIE = 'vai_v'
export const SESSION_COOKIE = 'vai_s'
const SESSION_MS = 30 * 60 * 1000

const rid = (n = 8) => Array.from({ length: n * 2 }, () => Math.floor(Math.random() * 16).toString(16)).join('')

export interface ServerVisit { vid: string; sid: string; seq: number; isNew: boolean; cookies: string[] }

export interface VisitInput {
  projectId: string
  slug: string
  headers: Headers
  /** the address that was asked for (to read utm_* from) */
  url: URL
  /** the host the site answered on (to tell "came from my own site" from "came from elsewhere") */
  host: string
}

/** A page opened by a person, as opposed to a fetch made by the page itself, a prefetch, a preview frame or a robot. */
export function isRealEntry(headers: Headers, method: string, url: URL): boolean {
  if (method !== 'GET') return false
  if (url.searchParams.get('vai_preview') === '1') return false
  if (url.searchParams.get('vai_pxtest') === '1') return false                         // the owner trying their pixels
  if (headers.get('x-vai-step')) return false                                         // the runtime fetching the next step in the background
  const purpose = `${headers.get('sec-purpose') || ''} ${headers.get('purpose') || ''}`.toLowerCase()
  if (purpose.includes('prefetch') || purpose.includes('prerender')) return false
  const dest = headers.get('sec-fetch-dest')
  if (dest && dest !== 'document') return false                                       // iframes, fetch(), images...
  const mode = headers.get('sec-fetch-mode')
  if (mode && mode !== 'navigate') return false
  return true
}

const cookie = (name: string, value: string, maxAge: number) => `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`

export async function recordVisit(i: VisitInput): Promise<ServerVisit | null> {
  const ua = i.headers.get('user-agent') || ''
  const info = parseUa(ua, {})
  if (info.bot) return null

  const now = Date.now()
  const cookies = i.headers.get('cookie')
  let vid = cookieOf(cookies, VISITOR_COOKIE)
  const knownVisitor = !!vid && /^[a-f0-9]{8,32}$/.test(vid)
  if (!knownVisitor) vid = rid(8)
  // "sid.lastMs.seq": the same visit while the last sign of life is under 30 minutes old
  const raw = cookieOf(cookies, SESSION_COOKIE) || ''
  const [csid, clast, cseq] = raw.split('.')
  const alive = /^[a-f0-9]{8,32}$/.test(csid || '') && now - Number(clast) <= SESSION_MS
  const sid = alive ? csid : rid(8)
  // the next page of this visit: counted from what is stored (the page's own script also adds pages when a funnel step swaps in place)
  let seq = 1
  if (alive) {
    const last = await db.analyticsPageview.aggregate({ where: { projectId: i.projectId, session: { sid } }, _max: { seq: true } }).catch(() => null)
    seq = Math.min(100000, (last?._max.seq ?? (Number(cseq) || 0)) + 1)
  }
  const out: ServerVisit = {
    vid: vid!, sid, seq, isNew: !knownVisitor,
    cookies: [cookie(VISITOR_COOKIE, vid!, 730 * 86400), cookie(SESSION_COOKIE, `${sid}.${now}.${seq}`, 2 * 3600)],
  }

  try {
    const existing = await db.analyticsSession.findUnique({ where: { projectId_sid: { projectId: i.projectId, sid } } })
    const at = new Date(now)
    if (!existing) {
      const q = i.url.searchParams
      let ref = i.headers.get('referer') || ''
      let refDomain = ''
      try { refDomain = ref ? new URL(ref).hostname.replace(/^www\./, '') : '' } catch { ref = '' }
      const root = (h: string) => h.split('.').slice(-2).join('.')
      const ownHost = i.host.toLowerCase().split(':')[0].replace(/^www\./, '')
      if (refDomain && root(refDomain) === root(ownHost)) { ref = ''; refDomain = '' }
      let cid: string | null = null, cidT: string | null = null
      for (const k of ['fbclid', 'gclid', 'ttclid', 'msclkid', 'wbraid', 'gbraid', 'twclid', 'li_fat_id']) if (!cid && q.get(k)) { cid = q.get(k)!.slice(0, 80); cidT = k }
      const us = q.get('utm_source') || q.get('src'), um = q.get('utm_medium')
      const ch = classifyChannel({ referrerDomain: refDomain || null, ownHost, utmSource: us, utmMedium: um, clickIdType: cidT })
      const lang = (i.headers.get('accept-language') || '').split(',')[0].trim().slice(0, 12) || null
      const geo = geoFor(clientIp(i.headers), null, lang)
      await db.analyticsSession.create({
        data: {
          projectId: i.projectId, sid, visitorId: vid!, startedAt: at, lastSeenAt: at, mode: 'published', host: ownHost || null,
          landingSlug: i.slug, exitSlug: i.slug, landingPath: i.url.pathname.slice(0, 200), referrer: ref.slice(0, 300) || null, referrerDomain: refDomain || null,
          channel: ch.channel, source: ch.source,
          utmSource: us ? us.slice(0, 100) : null, utmMedium: um ? um.slice(0, 100) : null, utmCampaign: q.get('utm_campaign')?.slice(0, 150) || null,
          utmContent: q.get('utm_content')?.slice(0, 150) || null, utmTerm: q.get('utm_term')?.slice(0, 150) || null, clickId: cid, clickIdType: cidT,
          device: info.device, browser: info.browser, browserVersion: info.browserVersion, os: info.os, osVersion: info.osVersion, deviceBrand: info.brand, deviceModel: info.model, inApp: info.inApp,
          language: lang, country: geo.country, region: geo.region, city: geo.city, isNew: !knownVisitor, isBot: false, pageCount: 1,
        },
      })
    } else {
      await db.analyticsSession.update({ where: { id: existing.id }, data: { lastSeenAt: at, exitSlug: i.slug, pageCount: Math.max(existing.pageCount, seq) } })
    }
    const session = existing ?? (await db.analyticsSession.findUnique({ where: { projectId_sid: { projectId: i.projectId, sid } } }))
    if (session) {
      await db.analyticsPageview.upsert({
        where: { sessionId_seq: { sessionId: session.id, seq } },
        create: { projectId: i.projectId, sessionId: session.id, seq, slug: i.slug, path: i.url.pathname.slice(0, 200), enteredAt: at },
        update: {},
      })
    }
  } catch (e) {
    // never let a measuring problem stop the page from being shown
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) console.error('recordVisit:', e instanceof Error ? e.message : e)
  }
  return out
}
