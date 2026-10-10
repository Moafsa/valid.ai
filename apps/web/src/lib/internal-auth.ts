import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Short-lived link to ONE project's working copy for our own scanner (the automatic review opens the clone in a browser without a
 * session). Signed with the scanner's shared secret and bound to the project id and an expiry, so it can neither be reused for another
 * project nor outlive its minutes, and the secret itself never travels in a URL or to a third-party site.
 * The scanner builds the same token in scan_orchestrator.py (preview_token).
 */
const sign = (projectId: string, exp: string) => createHmac('sha256', process.env.SCANNER_SHARED_SECRET || '').update(`preview:${projectId}:${exp}`).digest('hex')

export function previewTokenOk(projectId: string, token: string | null | undefined): boolean {
  if (!token || !process.env.SCANNER_SHARED_SECRET) return false
  const [exp, sig] = token.split('.')
  if (!exp || !sig || !/^\d{10,16}$/.test(exp) || Number(exp) < Date.now()) return false
  const want = Buffer.from(sign(projectId, exp)), got = Buffer.from(sig)
  return want.length === got.length && timingSafeEqual(want, got)
}
