import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/',
  '/api/webhooks/(.*)',
  '/api/health',
  // Server-to-server routes (scanner service) — authenticated by their own
  // X-Internal-Token check, not a Clerk session, since the caller is never
  // a signed-in browser user.
  '/api/internal/(.*)',
  // Published funnels and the sdk.js beacon they load — visited by anonymous
  // end customers, never a logged-in Valid.ai user.
  '/f/(.*)',
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
