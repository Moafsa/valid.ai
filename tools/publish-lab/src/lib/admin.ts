import { currentUser } from '@clerk/nextjs/server'
import { db } from '@funnelai/db'
import { getAuthUser } from '@/lib/auth-helper'
import { adminLoginSession } from '@/lib/admin-auth'

/**
 * Who may open /admin.
 *
 * An administrator signs in like anybody else (Clerk). What makes them one is a row in `super_admins`, written the first time a
 * person whose VERIFIED e-mail is on the allow-list (ADMIN_EMAILS, default adm1@gmail.com) or whose Clerk id is
 * SUPERADMIN_CLERK_USER_ID gets here. From then on only that Clerk user is the admin: another person registering the same
 * address later does not inherit anything (the e-mail column is unique), and the rest of the system only ever asks the database.
 */
export const adminEmails = (): string[] =>
  (process.env.ADMIN_EMAILS || 'adm1@gmail.com').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

/** The cheap check, safe to run on every page: is this Clerk user already registered as an administrator? */
export async function isAdminUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId || userId === 'user_dev_mode') return false
  return !!(await db.superAdmin.findUnique({ where: { clerkUserId: userId }, select: { id: true } }))
}

/** Registers the signed-in person as administrator when they qualify (asks Clerk who they are: use it rarely). */
export async function tryClaimAdmin(): Promise<boolean> {
  const { userId } = await getAuthUser()
  if (!userId || userId === 'user_dev_mode') return false
  if (await isAdminUser(userId)) return true
  const user = await currentUser().catch(() => null)
  if (!user) return false
  const primary = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0]
  const email = primary?.emailAddress?.toLowerCase() || ''
  const verified = primary?.verification?.status === 'verified'
  const byId = !!process.env.SUPERADMIN_CLERK_USER_ID && user.id === process.env.SUPERADMIN_CLERK_USER_ID
  if (!byId && !(verified && email && adminEmails().includes(email))) return false
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Administrador'
  try {
    await db.superAdmin.create({ data: { clerkUserId: user.id, email: email || `${user.id}@admin.local`, name } })
    return true
  } catch {
    return false                      // the address was already claimed by someone else
  }
}

/** Admin pages and routes: the registered administrator, or null. */
export async function currentAdmin(opts: { claim?: boolean } = {}): Promise<{ userId: string } | null> {
  // 1. signed in on the administrator's own login (e-mail + password)
  const own = await adminLoginSession().catch(() => null)
  if (own) return { userId: `admin:${own.email}` }
  // 2. a customer account that is registered as an administrator
  const { userId } = await getAuthUser()
  if (!userId) return null
  if (await isAdminUser(userId)) return { userId }
  if (opts.claim && (await tryClaimAdmin())) return { userId }
  return null
}
