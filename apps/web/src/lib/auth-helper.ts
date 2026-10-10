import { auth } from '@clerk/nextjs/server'
import { db } from '@funnelai/db'

export async function getAuthUser(): Promise<{ userId: string | null }> {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
  const isClerkConfigured = key.length > 30 && !key.endsWith('xxx') && !key.endsWith('dummy')

  if (!isClerkConfigured) {
    // No login provider configured: a shared development user, but never in production (a missing key there must lock the app, not open it)
    return { userId: process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_AUTH !== '1' ? null : 'user_dev_mode' }
  }

  // Signed out, or Clerk failing: nobody. Falling back to the shared development user here would hand every anonymous request one account.
  try {
    const { userId } = await auth()
    return { userId: userId || null }
  } catch (_e) {
    return { userId: null }
  }
}

/**
 * Resolves the signed-in user's OWN workspace — via WorkspaceMember, keyed
 * by their real Clerk user id, not a bare `findFirst()` across every
 * workspace in the database (a real cross-tenant leak this app had before:
 * every signed-in user saw whichever workspace happened to be first).
 *
 * The webhook that provisions a personal workspace on signup
 * (api/webhooks/clerk/route.ts, `user.created`) only fires for accounts
 * created after it existed, and needs CLERK_WEBHOOK_SECRET configured to
 * verify at all — so this also auto-provisions on first access as a
 * fallback, rather than leaving an otherwise-valid signed-in user stuck
 * with no workspace.
 */
export async function getCurrentWorkspace() {
  const { userId } = await getAuthUser()
  if (!userId) return null

  const member = await db.workspaceMember.findFirst({
    where: { clerkUserId: userId },
    include: { workspace: true },
  })
  if (member) return member.workspace

  // upsert, not create: guards against a concurrent request (or the
  // signup webhook) racing to provision the same user's workspace first.
  const workspace = await db.workspace.upsert({
    where: { clerkOrgId: `user:${userId}` },
    update: {},
    create: { clerkOrgId: `user:${userId}`, name: 'Minha Workspace', slug: userId, plan: 'FREE', aiCredits: 50 },
  })
  await db.workspaceMember.upsert({
    where: { workspaceId_clerkUserId: { workspaceId: workspace.id, clerkUserId: userId } },
    update: {},
    create: { workspaceId: workspace.id, clerkUserId: userId, role: 'OWNER' },
  })
    // the very first visit of a new account: the one moment worth asking Clerk who this is (an administrator signs up like anybody else)
  await import('@/lib/admin').then(m => m.tryClaimAdmin()).catch(() => {})
  return workspace
}
