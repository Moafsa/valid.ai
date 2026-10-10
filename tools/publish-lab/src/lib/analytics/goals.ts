import { db } from '@funnelai/db'

/**
 * What counts as a conversion, and how much to record. Lives in Project.analyticsSettings; a project that never set
 * anything gets the defaults below (a captured lead, or a click on the way to a checkout, is a conversion).
 */
export type GoalType = 'lead' | 'checkout' | 'page' | 'click' | 'video' | 'outbound'

export interface Goal {
  id: string
  name: string
  type: GoalType
  /** page: the page's slug · click: text or address of what was pressed · video: percent watched · outbound: part of the address */
  value?: string
  /** counts as the visit having converted (otherwise it is only a step the funnel shows) */
  conversion: boolean
}

export interface RecordingSettings { on: boolean; sample: number; maxPerDay: number }

export interface AnalyticsSettings {
  goals: Goal[]
  recording: RecordingSettings
}

export const DEFAULT_GOALS: Goal[] = [
  { id: 'lead', name: 'Lead capturado', type: 'lead', conversion: true },
  { id: 'checkout', name: 'Foi para o checkout', type: 'checkout', conversion: true },
]
export const DEFAULT_RECORDING: RecordingSettings = { on: true, sample: 1, maxPerDay: 300 }

export function readSettings(raw: unknown): AnalyticsSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AnalyticsSettings>
  const goals = Array.isArray(r.goals) && r.goals.length
    ? r.goals
        .filter(g => g && typeof g.id === 'string' && typeof g.name === 'string' && typeof g.type === 'string')
        .slice(0, 20)
        .map(g => ({ id: String(g.id).slice(0, 40), name: String(g.name).slice(0, 60), type: g.type as GoalType, value: g.value != null ? String(g.value).slice(0, 200) : undefined, conversion: g.conversion !== false }))
    : DEFAULT_GOALS
  const rec = { ...DEFAULT_RECORDING, ...(r.recording || {}) }
  rec.sample = Math.min(1, Math.max(0, Number(rec.sample)))
  rec.maxPerDay = Math.min(5000, Math.max(0, Math.round(Number(rec.maxPerDay))))
  return { goals, recording: { on: rec.on !== false, sample: Number.isFinite(rec.sample) ? rec.sample : 1, maxPerDay: Number.isFinite(rec.maxPerDay) ? rec.maxPerDay : 300 } }
}

/** checkout platforms and the words a link to a payment page tends to carry */
export const CHECKOUT_RE = /checkout|pay\.|\/pay\b|payment|pagamento|pagar|comprar|\/compra|\/buy\b|buy\.|carrinho|\/cart\b|hotmart|kiwify|eduzz|monetizze|braip|ticto|perfectpay|yampi|cartpanda|digistore|clickbank|stripe\.com|mercadopago|pagar\.me|pagseguro|paypal|sunize|appmax|greenn|lastlink|doppus|pepper\.com\.br|assinatura|go\.hotmart|sales\./i

export const isCheckoutHref = (href: string | null | undefined) => !!href && CHECKOUT_RE.test(href)

/* A small cache: the collector asks for the project on every batch. */
interface Cached { exp: number; ok: boolean; settings: AnalyticsSettings }
const cache = new Map<string, Cached>()

export async function projectInfo(projectId: string): Promise<Cached> {
  const hit = cache.get(projectId)
  if (hit && hit.exp > Date.now()) return hit
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true, analyticsSettings: true } })
  const v: Cached = { exp: Date.now() + 60_000, ok: !!p, settings: readSettings(p?.analyticsSettings) }
  cache.set(projectId, v)
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string)
  return v
}

export function forgetProject(projectId: string) { cache.delete(projectId) }

const norm = (s: string | null | undefined) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()

/** the goals one thing a visitor did reaches */
export function goalsReached(settings: AnalyticsSettings, what:
  | { kind: 'lead' }
  | { kind: 'page'; slug: string | null }
  | { kind: 'click'; text: string | null; href: string | null }
  | { kind: 'outbound'; href: string | null }
  | { kind: 'video'; pct: number }): Goal[] {
  const out: Goal[] = []
  for (const g of settings.goals) {
    const v = norm(g.value)
    if (what.kind === 'lead' && g.type === 'lead') out.push(g)
    else if (what.kind === 'page' && g.type === 'page' && v && norm(what.slug) === v) out.push(g)
    else if (what.kind === 'click' && g.type === 'click' && v && (norm(what.text).includes(v) || norm(what.href).includes(v))) out.push(g)
    else if (what.kind === 'outbound') {
      if (g.type === 'checkout' && isCheckoutHref(what.href)) out.push(g)
      else if (g.type === 'outbound' && v && norm(what.href).includes(v)) out.push(g)
    } else if (what.kind === 'video' && g.type === 'video' && Number(g.value) > 0 && what.pct >= Number(g.value)) out.push(g)
  }
  return out
}
