import { createHash } from 'crypto'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { currentAdmin } from '@/lib/admin'
import { previewTokenOk } from '@/lib/internal-auth'
import { LEGACY_BASE_CSS } from '@/lib/legacy-base-css'
import { pageCssFor } from '@/lib/page-css'
import { readSettings } from '@/lib/analytics/goals'
import { cookieName, cookieOf, experimentFor, pickVariant } from '@/lib/analytics/experiments'
import { isRealEntry, recordVisit, type ServerVisit } from '@/lib/analytics/server-visit'
import { pixelConfigFor, runtimeForViewer } from '@/lib/pixels-server'
import type { PixelRuntimeConfig } from '@/lib/pixels'

export interface CloneShell {
  html?: Record<string, string>
  body?: Record<string, string>
  wrappers?: { tag: string; attrs: Record<string, string> }[]
  viewport?: string | null
  title?: string | null
  fontLinks?: string[]
  /** this page has its own version for phones: the slug of that page (see scan_orchestrator, `__m`) */
  mobileSlug?: string
  /** set on the phone version itself: which page it is the phone version of */
  variant?: 'mobile'
  of?: string
  /** hidden behaviour of the original page, replayed by the runtime (see lib/clone-flow.ts) */
  rules?: { id: string; trigger: 'exit-intent' | 'back' | 'time' | 'video-pause' | 'video-end' | 'video-time' | 'hidden' | 'scroll-up'; once?: boolean; after?: number; goto?: string }[]
}

interface Block {
  order?: number
  generatedHtml?: string | null
  [key: string]: any
}

/** Short content hash of a stylesheet: its URL changes only when its text does, so it can be cached forever. */
export const cssHash = (css: string) => createHash('sha1').update(css).digest('hex').slice(0, 16)

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const SAFE_TAG = /^[a-z][a-z0-9-]*$/
const SAFE_ATTR = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/

/**
 * Pictures past the first screenful are fetched when the visitor scrolls near
 * them, not up front: a long page of photos no longer drags the phone's
 * connection while the first section is still loading. The first pictures stay
 * eager (and the first one is high priority) because they are what the visitor
 * sees. A tag that already says how to load is left alone.
 */
export function lazyImages(html: string): string {
  let n = 0
  return html.replace(/<img\b[^>]*>/gi, tag => {
    const i = n++
    if (/\sloading\s*=/i.test(tag)) return tag
    if (i === 0 && !/\sfetchpriority\s*=/i.test(tag)) return tag.replace(/<img\b/i, '<img fetchpriority="high" decoding="async"')
    if (i < 3) return tag.replace(/<img\b/i, '<img decoding="async"')
    return tag.replace(/<img\b/i, '<img loading="lazy" decoding="async"')
  })
}

export function attrString(attrs: Record<string, string> | undefined | null): string {
  if (!attrs) return ''
  return Object.entries(attrs)
    .filter(([name]) => SAFE_ATTR.test(name) && !/^on/i.test(name))
    .map(([name, value]) => ` ${name}="${escAttr(String(value))}"`)
    .join('')
}

/**
 * The clone as a standalone, bare HTML document — no dashboard CSS, no
 * Tailwind preflight, no framework chrome of ours around it. The original
 * site's own stylesheet is the ONLY stylesheet on the page, applied to the
 * original markup wrapped in the original <html>/<body>/wrapper attributes,
 * so every class-driven rule and @media breakpoint resolves exactly as it
 * did on the source. Anything of ours sitting in the same document
 * (resets, `body{}` rules, colliding CSS variable names) would bend that.
 */
export function buildCloneDocument(opts: {
  projectId: string
  pageId: string
  name: string
  blocks: Block[]
  customCss: string | null
  shell: CloneShell | null
  isOwner: boolean
  /** Where this project's other pages live (`/projects/<id>/p` or `/s/<slug>`): funnel steps navigate through it. */
  basePath: string
  /** a desktop document whose page has a phone version: a narrow window is sent to it (?v=m) */
  narrowToPhone?: boolean
  /** a thumbnail inside the dashboard: no tracking, no timers (see vai-runtime.js) */
  preview?: boolean
  /** put the stylesheet in the document itself (the scanner checks a clone before it is saved, when the file does not exist yet) */
  inlineCss?: boolean
  /** what the behaviour analytics needs to know about this page (see public/vai-m.js) */
  /** the project's pixels and events for this visitor (published pages only; see lib/pixels-server.ts) */
  pixels?: PixelRuntimeConfig | null
  analytics?: { slug: string; mode: 'published' | 'draft'; rec?: { on: boolean; sample: number } | null; exp?: { id: string; v: string } | null; visit?: { vid: string; sid: string; seq: number; isNew: boolean } | null }
}): string {
  const { projectId, pageId, name, blocks, customCss, shell, isOwner, basePath, narrowToPhone, preview, inlineCss, analytics, pixels } = opts
  const sorted = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const body = lazyImages(sorted.map(b => b.generatedHtml || '').join('\n'))
  const css = (customCss || '').replace(/<\/style/gi, '<\\/style')

  const wrappers = (shell?.wrappers ?? []).filter(w => SAFE_TAG.test(w.tag))
  // The innermost wrapper holds the page's blocks: funnel steps swap its
  // content in place (see vai-runtime.js) instead of reloading the document.
  const open = wrappers
    .map((w, i) => `<${w.tag}${attrString(w.attrs)}${i === wrappers.length - 1 ? ' data-vai-root' : ''}>`)
    .join('')
  const close = [...wrappers].reverse().map(w => `</${w.tag}>`).join('')

  const htmlAttrs = shell ? attrString(shell.html) : ' lang="pt-BR"'
  const bodyAttrs = shell ? attrString(shell.body) : ''
  const fontLinks = (shell?.fontLinks ?? [])
    .filter(href => /^https?:\/\//i.test(href))
    .map(href => `<link rel="stylesheet" href="${escAttr(href)}">`)
    .join('\n')
  // A captured stylesheet is big (a Tailwind build is ~200KB) and identical on
  // every step of a funnel: as its own cacheable file it is downloaded once
  // instead of inside every page. Legacy pages keep it inline.
  const pageCssTag = shell && css && !inlineCss
    ? `<link rel="stylesheet" href="/projects/${escAttr(projectId)}/css/${cssHash(customCss || '')}.css">`
    : `<style id="vai-page-css">${css}</style>`
  // A page that never declared a viewport is drawn by phones at a 980px-wide desktop layout, shrunk to fit; adding the
  // usual device-width meta to it would make the clone behave differently from the original on every phone.
  const viewportMeta = shell
    ? (shell.viewport ? `<meta name="viewport" content="${escAttr(shell.viewport)}">` : '')
    : '<meta name="viewport" content="width=device-width, initial-scale=1">'
  const title = shell?.title || name

  const ownerChip = isOwner && !preview
    ? `<div onclick="location.href='/projects/${escAttr(projectId)}'" style="position:fixed;top:12px;left:12px;z-index:2147483647;background:#111827;color:#fff;font:600 13px system-ui,sans-serif;padding:8px 14px;border-radius:999px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4);opacity:.85">← Voltar</div>`
    : ''

  return `<!DOCTYPE html>
<html${htmlAttrs}>
<head>
<meta charset="utf-8">
${viewportMeta}
<title>${escText(title)}</title>
${narrowToPhone ? `<script>try{var u=new URL(location.href);if(!u.searchParams.has('v')&&innerWidth<768){u.searchParams.set('v','m');location.replace(u.toString())}}catch(e){}</script>` : ''}
${fontLinks}
${shell ? '' : `<style id="vai-legacy-base">${LEGACY_BASE_CSS}</style>`}
${pageCssTag}
<style id="vai-runtime-css">[data-vai-delay]:not([data-vai-shown]),[data-vai-pitch-at]:not([data-vai-shown]){display:none!important}[data-vai-next],[data-vai-href],[data-vai-select]{cursor:pointer}</style>
</head>
<body${bodyAttrs}>
${open}${body}${close}
${ownerChip}
<script>window.__VAI=${JSON.stringify({
    projectId, pageId, basePath, rules: shell?.rules ?? [],
    ...(preview ? { preview: true } : {}),
    // the visit is the page's, so the owner looking at their own work is never counted
    ...(analytics ? { slug: analytics.slug.replace(/__m$/, ''), mode: analytics.mode, ...(isOwner ? { owner: true } : {}), ...(analytics.rec ? { rec: analytics.rec } : {}), ...(analytics.exp ? { exp: analytics.exp } : {}), ...(analytics.visit ? { vid: analytics.visit.vid, sid: analytics.visit.sid, seq: analytics.visit.seq, ...(analytics.visit.isNew ? { fresh: 1 } : {}) } : {}) } : {}),
  }).replace(/</g, '\\u003c')}</script>
${analytics && !preview ? '<script src="/vai-m.js" defer></script>\n' : ''}<script src="/vai-runtime.js" defer></script>
${pixels && !preview && analytics?.mode === 'published' ? `<script>window.__VAI_PX=${JSON.stringify(pixels).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')}</script>\n<script src="/vai-e.js" defer></script>\n` : ''}</body>
</html>`
}

/** what the page's recorder is told: whether this project records visits and what share of them */
function recordingFor(raw: unknown): { on: boolean; sample: number } | null {
  const r = readSettings(raw).recording
  return r.on && r.sample > 0 ? { on: true, sample: r.sample } : null
}

type PageLookup =
  | { by: 'id'; projectId: string; pageSlug: string }
  | { by: 'slug'; projectSlug: string; pageSlug?: string }
  /** the public address of a published project: served from the frozen snapshot, never from the editor's pages */
  | { by: 'published'; projectSlug: string; pageSlug?: string }

export interface RenderOpts {
  ua?: string | null
  /** the Sec-CH-UA-Mobile header ("?1" on phones) */
  chMobile?: string | null
  /** ?v=m or ?v=d forces the phone / desktop version */
  view?: string | null
  /** ?vai_preview=1: render for a thumbnail */
  preview?: boolean
  /** ?vai_token=: our scanner's signed, short-lived link to the working copy (see lib/internal-auth.ts) */
  token?: string | null
  /** served on <sub>.be-vallid.com: the site lives at the root of that host instead of under /s/<slug> */
  sub?: string | null
  /** the visitor's cookies: an A/B test keeps each person on the version they were first given */
  cookie?: string | null
  /** the request itself: the server writes the entry of a real visitor into the analytics (see lib/analytics/server-visit.ts) */
  headers?: Headers
  method?: string
  href?: string
}

const PHONE_UA = /Android.+Mobile|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile|webOS|Mobile Safari/i
const isPhone = (o: RenderOpts) => o.chMobile === '?1' || (!!o.ua && PHONE_UA.test(o.ua) && !/iPad|Tablet/i.test(o.ua))

export function requestOpts(req: { headers: Headers; method?: string; nextUrl: { searchParams: URLSearchParams; href?: string } }): RenderOpts {
  return { ua: req.headers.get('user-agent'), chMobile: req.headers.get('sec-ch-ua-mobile'), view: req.nextUrl.searchParams.get('v'), preview: req.nextUrl.searchParams.get('vai_preview') === '1', token: req.nextUrl.searchParams.get('vai_token'), sub: req.headers.get('x-vai-sub'), cookie: req.headers.get('cookie'), headers: req.headers, method: req.method, href: req.nextUrl.href }
}

const notFoundResponse = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })

/**
 * The visitor-facing site. Reads the snapshot written by "Publicar" and nothing else: no owner chip, no dashboard
 * links, and the pages' internal links stay under the public address instead of the editor's canonical routes.
 */
async function renderPublished(lookup: { projectSlug: string; pageSlug?: string }, opts: RenderOpts): Promise<Response> {
  const project = await db.project.findUnique({ where: { slug: lookup.projectSlug } })
  if (!project || project.status !== 'PUBLISHED') return notFoundResponse()
  const pages = await db.publishedPage.findMany({ where: { projectId: project.id }, orderBy: { order: 'asc' } })
  if (pages.length === 0) return notFoundResponse()

  const found = lookup.pageSlug ? pages.find(p => p.pageSlug === lookup.pageSlug) : pages.find(p => !(p.shell as CloneShell | null)?.variant) ?? pages[0]
  if (!found) return notFoundResponse()

  // An A/B test on this address: the visitor is given one of the versions (and keeps it), or everyone gets the winner
  let shown = found
  let expCfg: { id: string; v: string } | null = null
  let setCookie: string | null = null
  const test = opts.preview ? null : await experimentFor(project.id, found.pageSlug)
  if (test) {
    const chosen = test.winner ?? pickVariant(test.variants, cookieOf(opts.cookie, cookieName(test.exp.id)), Math.random).variant
    const versionPage = pages.find(p => p.pageSlug === chosen.slug)
    if (versionPage) {
      shown = versionPage
      if (!test.winner) {
        expCfg = { id: test.exp.id, v: chosen.id }
        if (cookieOf(opts.cookie, cookieName(test.exp.id)) !== chosen.id) setCookie = `${cookieName(test.exp.id)}=${encodeURIComponent(chosen.id)}; Path=/; Max-Age=${60 * 86400}; SameSite=Lax`
      }
    }
  }

  let page = shown
  const phoneSlug = (shown.shell as CloneShell | null)?.mobileSlug
  if (phoneSlug && opts.view !== 'd' && (opts.view === 'm' || isPhone(opts))) {
    const phone = pages.find(p => p.pageSlug === phoneSlug)
    if (phone) page = phone
  }

  // The entry is written by the server itself, before anything depends on the visitor's browser (blockers, no JavaScript, instant exits)
  let visit: ServerVisit | null = null
  if (!opts.preview && opts.headers && opts.href && isRealEntry(opts.headers, opts.method || 'GET', new URL(opts.href))) {
    visit = await recordVisit({ projectId: project.id, slug: page.pageSlug.replace(/__m$/, ''), headers: opts.headers, url: new URL(opts.href), host: opts.headers.get('x-forwarded-host') || opts.headers.get('host') || '' })
  }

  const css = page.customCss ?? pages.find(p => p.customCss)?.customCss ?? null
  // on its own subdomain the site sits at the root of the host; otherwise under /s/<slug>
  const publicBase = opts.sub && opts.sub === project.slug ? '' : `/s/${project.slug}`
  const pointAtPublicSite = (html: string) => html.split(`/projects/${project.id}/p/`).join(`${publicBase}/`)
  const blocks = (Array.isArray(page.blocks) ? (page.blocks as Block[]) : []).map(b => ({
    ...b,
    generatedHtml: b.generatedHtml ? pointAtPublicSite(b.generatedHtml) : b.generatedHtml,
  }))

  // views and clicks are counted against the project's real page (the snapshot row is only a copy of it)
  const livePage = await db.page.findFirst({ where: { projectId: project.id, slug: page.pageSlug }, select: { id: true } })

  const html = buildCloneDocument({
    projectId: project.id,
    pageId: livePage?.id ?? page.id,
    name: project.name,
    blocks,
    customCss: css,
    shell: (page.shell as CloneShell | null) ?? null,
    isOwner: false,
    basePath: publicBase,
    narrowToPhone: !!phoneSlug && page === shown && opts.view !== 'd' && !opts.preview,
    preview: !!opts.preview,
    // the project's pixels: handed over only to the public site, never to a thumbnail, and never able to change what the page does
    pixels: opts.preview ? null : runtimeForViewer(await pixelConfigFor(project.id), opts.cookie),
    analytics: { slug: page.pageSlug, mode: 'published', rec: recordingFor(project.analyticsSettings), exp: expCfg, visit: visit ? { vid: visit.vid, sid: visit.sid, seq: visit.seq, isNew: visit.isNew } : null },
  })
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', vary: 'User-Agent, Sec-CH-UA-Mobile, Cookie' })
  if (setCookie) headers.append('set-cookie', setCookie)
  for (const c of visit?.cookies ?? []) headers.append('set-cookie', c)
  if (opts.preview) headers.set('content-security-policy', "frame-ancestors 'self'")
  return new Response(html, { headers })
}

/** Resolves a public clone URL to its project + page and renders the document. */
export async function renderClonePage(lookup: PageLookup, opts: RenderOpts = {}): Promise<Response> {
  if (lookup.by === 'published') return renderPublished(lookup, opts)
  const notFound = notFoundResponse

  const project =
    lookup.by === 'id'
      ? await db.project.findUnique({ where: { id: lookup.projectId } })
      : await db.project.findUnique({ where: { slug: lookup.projectSlug } })
  if (!project || !['READY', 'PUBLISHED'].includes(project.status)) return notFound()

  const found =
    lookup.by === 'slug' && !lookup.pageSlug
      ? await db.page.findFirst({ where: { projectId: project.id }, orderBy: { order: 'asc' } })
      : await db.page.findFirst({ where: { projectId: project.id, slug: lookup.pageSlug! } })
  if (!found) return notFound()

  // Some sites build a different page for phones; that version was cloned as a page of its own.
  // Phones get it, everyone else gets the desktop one (a narrow desktop window is sent over by a tiny script).
  let page = found
  const phoneSlug = (found.shell as CloneShell | null)?.mobileSlug
  if (phoneSlug && opts.view !== 'd' && (opts.view === 'm' || isPhone(opts))) {
    const phone = await db.page.findFirst({ where: { projectId: project.id, slug: phoneSlug } })
    if (phone) page = phone
  }

  // The working copy (by id) is what the editor shows, possibly unfinished: only its owner, the administrator, or our own scanner
  // (signed, short-lived link) may open it. The visitor-facing site is the published snapshot, served elsewhere (by 'slug' / 'published').
  const workspace = await getCurrentWorkspace().catch(() => null)
  const isOwner = workspace?.id === project.workspaceId
  if (lookup.by === 'id' && !isOwner && !previewTokenOk(project.id, opts.token) && !(await currentAdmin().catch(() => null))) return notFound()

  const html = buildCloneDocument({
    projectId: project.id,
    pageId: page.id,
    name: project.name,
    blocks: Array.isArray(page.blocks) ? (page.blocks as Block[]) : [],
    customCss: await pageCssFor(project.id, page),
    shell: (page.shell as CloneShell | null) ?? null,
    isOwner,
    basePath: lookup.by === 'id' ? `/projects/${project.id}/p` : `/s/${project.slug}`,
    narrowToPhone: !!phoneSlug && page === found && opts.view !== 'd' && !opts.preview,
    preview: !!opts.preview,
  })
  return new Response(html, {
    // this is the working copy (what the editor shows), not the published site: keep it out of search engines
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', vary: 'User-Agent, Sec-CH-UA-Mobile', ...(opts.preview ? { 'content-security-policy': "frame-ancestors 'self'" } : {}) },
  })
}
