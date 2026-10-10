import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { db } from '@funnelai/db'

/**
 * The administrator's own login: e-mail + password, kept apart from the customers' sign-in (Clerk), so it works whatever Clerk's
 * rules are for customers. The password is stored only as a salted scrypt hash; a session is a signed cookie that lasts 12 hours;
 * five wrong passwords lock the account for 15 minutes (a weak password is only as safe as this brake).
 */
export const ADMIN_COOKIE = 'vai_admin'
const SESSION_SECONDS = 12 * 3600
const secret = () => `${process.env.CONFIG_ENCRYPTION_KEY || ''}|${process.env.CLERK_SECRET_KEY || ''}|vai-admin`

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`
}

export function checkPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split('$')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const got = scryptSync(password, Buffer.from(salt, 'hex'), 64)
  const want = Buffer.from(hash, 'hex')
  return got.length === want.length && timingSafeEqual(got, want)
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('hex')

export function makeToken(email: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS
  const body = Buffer.from(JSON.stringify({ e: email, x: exp })).toString('base64url')
  return `${body}.${sign(body)}`
}

export function readToken(token: string | undefined | null): { email: string } | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const want = sign(body)
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return p.x > Date.now() / 1000 ? { email: String(p.e) } : null
  } catch { return null }
}

export const cookieHeader = (token: string) => `${ADMIN_COOKIE}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`
export const clearCookieHeader = () => `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`

/** The administrator signed in with e-mail and password, or null (also checks the account still exists). */
export async function adminLoginSession(): Promise<{ email: string } | null> {
  const s = readToken((await cookies()).get(ADMIN_COOKIE)?.value)
  if (!s) return null
  const row = await db.adminLogin.findUnique({ where: { email: s.email }, select: { id: true } })
  return row ? s : null
}

export async function attemptLogin(email: string, password: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const row = await db.adminLogin.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (row?.lockedUntil && row.lockedUntil > new Date()) return { ok: false, error: 'Muitas tentativas erradas. Espere alguns minutos e tente de novo.' }
  if (!row || !checkPassword(password, row.passwordHash)) {
    if (row) {
      const n = row.failedCount + 1
      await db.adminLogin.update({ where: { id: row.id }, data: n >= 5 ? { failedCount: 0, lockedUntil: new Date(Date.now() + 15 * 60_000) } : { failedCount: n } })
    } else {
      scryptSync(password, 'x', 64)                    // the same time as a real check, so the answer does not say whether the e-mail exists
    }
    return { ok: false, error: 'E-mail ou senha incorretos.' }
  }
  await db.adminLogin.update({ where: { id: row.id }, data: { failedCount: 0, lockedUntil: null, lastLoginAt: new Date() } })
  return { ok: true, token: makeToken(row.email) }
}
