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
  // page posts view/lead events to, same reasoning.
  '/projects/(.*)/p/(.*)',
  '/api/track',
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

export default function middleware(request: NextRequest, event: any) {
  if (!activeClerkMiddleware) {
    return NextResponse.next()
  }
  return (activeClerkMiddleware as any)(request, event)
}

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)','/(api|trpc)(.*)'],
}
