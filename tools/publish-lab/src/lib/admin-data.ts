import { clerkClient } from '@clerk/nextjs/server'
import { db } from '@funnelai/db'

/** Shared by the administration screens: who the people are, how active an account is, and the small formatters. */
export const DAY = 86400_000
export const PAID = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']
/** the only limit the system really enforces is the AI credit balance: this is "close to running out" */
export const LOW_CREDITS = 10

export const n = (v: number) => v.toLocaleString('pt-BR')
export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const ago = (d: Date | number | null | undefined) => {
  if (!d) return '—'
  const t = typeof d === 'number' ? d : d.getTime()
  if (!t) return '—'
  const s = (Date.now() - t) / 1000
  if (s < 90) return 'agora'
  return s < 3600 ? `há ${Math.floor(s / 60)} min` : s < 86400 ? `há ${Math.floor(s / 3600)} h` : s < 86400 * 60 ? `há ${Math.floor(s / 86400)} d` : `há ${Math.floor(s / (86400 * 30))} meses`
}

export interface Person { id: string; email: string; name: string; lastSignInAt: number | null }

/** Clerk knows names, e-mails and the last sign-in. The list still works without it (names fall back to the account name). */
export async function loadPeople(userIds: string[]): Promise<Map<string, Person>> {
  const ids = Array.from(new Set(userIds)).filter(u => u && u !== 'user_dev_mode')
  const out = new Map<string, Person>()
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
  await Promise.all(chunks.map(async chunk => {
    try {
      const res: any = await clerkClient.users.getUserList({ userId: chunk, limit: 100 })
      for (const u of res.data ?? res) {
        const primary = u.emailAddresses?.find((e: any) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses?.[0]
        out.set(u.id, { id: u.id, email: primary?.emailAddress || '', name: [u.firstName, u.lastName].filter(Boolean).join(' '), lastSignInAt: u.lastSignInAt ?? null })
      }
    } catch { /* names are a nicety */ }
  }))
  return out
}

/** Accounts of the people whose name or e-mail matches the text (Clerk does the searching). */
export async function workspaceIdsForPerson(q: string): Promise<string[]> {
  try {
    const res: any = await clerkClient.users.getUserList({ query: q, limit: 50 })
    const ids: string[] = (res.data ?? res).map((u: any) => u.id)
    if (!ids.length) return []
    return (await db.workspaceMember.findMany({ where: { clerkUserId: { in: ids } }, select: { workspaceId: true } })).map(m => m.workspaceId)
  } catch { return [] }
}

/** The last time each account did anything (project touched, AI used, credits moved, clone started). One query for everyone. */
export async function lastActivity(): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ id: string; at: Date }[]>`
    SELECT w AS id, max(t) AS at FROM (
      SELECT "workspaceId" AS w, "updatedAt" AS t FROM projects
      UNION ALL SELECT "workspaceId", "createdAt" FROM ai_usage_logs
      UNION ALL SELECT "workspaceId", "createdAt" FROM credit_transactions
      UNION ALL SELECT p."workspaceId", j."createdAt" FROM scan_jobs j JOIN projects p ON p."scanJobId" = j.id
    ) x GROUP BY w`
  return new Map(rows.map(r => [r.id, r.at.getTime()]))
}

/** Clones that finished and clones that failed since a date, per account. */
export async function cloneOutcomes(since: Date): Promise<Map<string, { done: number; err: number }>> {
  const rows = await db.$queryRaw<{ w: string; done: number; err: number }[]>`
    SELECT p."workspaceId" AS w, (count(*) FILTER (WHERE j.status = 'DONE'))::int AS done, (count(*) FILTER (WHERE j.status = 'ERROR'))::int AS err
    FROM scan_jobs j JOIN projects p ON p."scanJobId" = j.id WHERE j."createdAt" >= ${since} GROUP BY 1`
  return new Map(rows.map(r => [r.w, { done: r.done, err: r.err }]))
}

export type Standing = 'problem' | 'new' | 'active' | 'inactive'
export const STANDING: Record<Standing, { label: string; cls: string }> = {
  problem: { label: 'Com problema', cls: 'bg-red-500/15 text-red-300' },
  new: { label: 'Novo', cls: 'bg-blue-500/15 text-blue-300' },
  active: { label: 'Ativo', cls: 'bg-emerald-500/15 text-emerald-300' },
  inactive: { label: 'Inativo', cls: 'bg-white/10 text-gray-400' },
}

/** One word for how an account is doing: failing clones win over everything, then new, then used in the last week, else idle. */
export function standing(createdAt: Date, lastSeen: number, out: { done: number; err: number } | undefined, now = Date.now()): Standing {
  if (out && out.err > 0 && out.err >= out.done) return 'problem'
  if (now - createdAt.getTime() < 7 * DAY) return 'new'
  if (lastSeen && now - lastSeen < 7 * DAY) return 'active'
  return 'inactive'
}

/** "Maria Souza" and her e-mail for each account id (the account name when Clerk has nothing). */
export async function accountNames(ids: string[]): Promise<Map<string, { name: string; email: string }>> {
  const unique = Array.from(new Set(ids))
  const out = new Map<string, { name: string; email: string }>()
  if (!unique.length) return out
  const list = await db.workspace.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, members: { select: { clerkUserId: true } } } })
  const people = await loadPeople(list.flatMap(w => w.members.map(m => m.clerkUserId)))
  for (const w of list) {
    const p = w.members.map(m => people.get(m.clerkUserId)).find(Boolean)
    out.set(w.id, { name: p?.name || w.name, email: p?.email || '' })
  }
  return out
}

export const when = (d: Date | null | undefined) => (d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—')
export const OPERATION: Record<string, string> = { scan_lp: 'Clonagem', cloaker: 'Detector de cloaker', translate: 'Tradução', quiz_import: 'Importar quiz', editor_ai: 'Editor com IA', analytics_ai: 'Análise das métricas' }

/** The lab, the development seed and the dev-mode login are not customers: they never count in the platform numbers or lists. */
export const INTERNAL_ORGS = ['lab_internal_org', 'dev_org', 'user:user_dev_mode']
export async function internalWorkspaceIds(): Promise<string[]> {
  return (await db.workspace.findMany({ where: { clerkOrgId: { in: INTERNAL_ORGS } }, select: { id: true } })).map(w => w.id)
}
