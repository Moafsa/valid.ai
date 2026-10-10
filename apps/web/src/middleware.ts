import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/',
  '/api/webhooks/(.*)',
  '/api/health',
  // The cloned page itself — this is what a real site visitor opens, so it
  // can't require the owner's own login. /api/track is the beacon that
  // page posts view/lead events to, same reasoning. /s/(.*) is the same
  // thing under the pretty published-domain alias (be-vallid.com/s/{slug}).
  '/projects/(.*)/p/(.*)',
  '/s/(.*)',
  '/api/track(.*)',
  // the behaviour collector of the same pages (visits, clicks, scroll, video, recordings)
  '/api/collect(.*)',
  // the administrator's own login and panel check their own cookie (see lib/admin-auth.ts); the analytics API checks who asks inside
  '/admin(.*)',
  '/api/admin/(.*)',
  '/api/projects/(.*)/analytics/(.*)',
  // scanner -> web hand-over of a finished clone (guarded by a shared secret)
  '/api/internal/(.*)',
])

const isClerkKeyValid = () => {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
  return key.length > 30 && !key.endsWith('xxx') && !key.endsWith('dummy')
}

const activeClerkMiddleware = isClerkKeyValid()
  ? clerkMiddleware(async (authObj, request) => {
      if (!isPublicRoute(request)) {
        const { userId, redirectToSignIn } = await authObj()
        if (!userId) return redirectToSignIn()
      }
    })
  : null

// <slug>.be-vallid.com serves the published site of that project (the same thing as be-vallid.com/s/<slug>).
// Needs a wildcard DNS record + certificate in front; the code is ready for the day they exist.
const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'be-vallid.com').toLowerCase()
const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api', 'admin', 'mail', 'cdn', 's3', 'static'])

function publishedSubdomain(request: NextRequest): string | null {
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase().split(':')[0]
  if (!host.endsWith('.' + ROOT_DOMAIN)) return null
  const sub = host.slice(0, -(ROOT_DOMAIN.length + 1))
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sub) || RESERVED_SUBDOMAINS.has(sub)) return null
  return sub
}

export default function middleware(request: NextRequest, event: any) {
  const sub = publishedSubdomain(request)
  if (sub) {
    // A visitor of a published site never goes through the dashboard's login: only the site (and its
    // view/click beacon) answers on this address.
    const { pathname } = request.nextUrl
    if (pathname === '/api/track' || pathname === '/api/track/r' || pathname === '/api/collect' || pathname === '/api/collect/rec') return NextResponse.next()
    if (pathname.startsWith('/api/') || pathname.startsWith('/s/') || pathname.startsWith('/projects/') && !/^\/projects\/[^/]+\/css\//.test(pathname)) {
      return new NextResponse('Not found', { status: 404 })
    }
    if (pathname.startsWith('/projects/')) return NextResponse.next()
    const url = request.nextUrl.clone()
    url.pathname = `/s/${sub}${pathname === '/' ? '' : pathname}`
    const headers = new Headers(request.headers)
    headers.set('x-vai-sub', sub)
    return NextResponse.rewrite(url, { request: { headers } })
  }
  if (!activeClerkMiddleware) {
    return NextResponse.next()
  }
  return (activeClerkMiddleware as any)(request, event)
}

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)','/(api|trpc)(.*)'],
}
