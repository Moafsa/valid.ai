/* Pure parts of the plan system: safe to import from client components (no database here). The server side is lib/plans.ts. */
/**
 * Plans, limits and what an account may do.
 *
 * A plan is a row of `plan_configs` the administrator edits (price, benefits, limits, features). An account points at one
 * through `workspaces.planKey`. What an account really gets (`entitlementsOf`) also depends on its subscription: a paid plan
 * only counts while it is paid (a few days of grace after the due date); after that the account falls back to the free plan's
 * limits, and nothing that already exists is deleted.
 *
 * A limit is a number, or null = unlimited. A key missing from the plan counts as unlimited.
 */

export type LimitKey = 'pages' | 'domains' | 'clones' | 'aiCalls' | 'storageMb'
export type FeatureKey = 'cloaker' | 'pixels' | 'interactive' | 'prioritySupport'

export const LIMIT_KEYS: LimitKey[] = ['pages', 'domains', 'clones', 'aiCalls', 'storageMb']
export const FEATURE_KEYS: FeatureKey[] = ['prioritySupport', 'cloaker', 'interactive', 'pixels']

export const LIMIT_DEFS: Record<LimitKey, { label: string; unit: string; period: 'now' | 'month'; hint: string; enforced: boolean }> = {
  pages: { label: 'Páginas ativas', unit: 'páginas', period: 'now', hint: 'sites publicados ao mesmo tempo (os clones em rascunho não contam)', enforced: true },
  domains: { label: 'Domínios próprios', unit: 'domínios', period: 'now', hint: 'o recurso de conectar um domínio próprio ainda não existe: o número vale quando ele for liberado', enforced: false },
  clones: { label: 'Clonagens por mês', unit: 'clonagens', period: 'month', hint: 'projetos novos criados no mês', enforced: true },
  aiCalls: { label: 'Créditos de IA por mês', unit: 'créditos', period: 'month', hint: 'o assistente do editor e a análise de métricas gastam créditos pelo tamanho do pedido: mudar uma cor custa ~1, refazer uma página inteira custa vários', enforced: true },
  storageMb: { label: 'Armazenamento', unit: 'MB', period: 'now', hint: 'imagens, fontes e vídeos hospedados dos seus clones', enforced: true },
}
export const FEATURE_DEFS: Record<FeatureKey, { label: string; hint: string; enforced: boolean }> = {
  cloaker: { label: 'Identificação de cloaker', hint: 'a ferramenta que testa um link como vários visitantes', enforced: true },
  pixels: { label: 'Pixel e scripts de rastreamento', hint: 'a aba Pixels e Eventos (Meta, Google, TikTok, GTM, scripts)', enforced: true },
  interactive: { label: 'Componentes interativos', hint: 'contagem regressiva, perguntas frequentes e formulário na biblioteca do editor', enforced: true },
  prioritySupport: { label: 'Suporte prioritário', hint: 'as mensagens dessa conta aparecem primeiro para o administrador', enforced: true },
}
/** the blocks of the editor's library that need the "interactive components" feature */
export const INTERACTIVE_BLOCKS = ['contagem', 'faq', 'formulario']
/** what counts as "a use of AI" in the monthly limit */
export const AI_OPERATIONS = ['editor_ai', 'editor_ai_edit', 'analytics_ai', 'translate', 'quiz_import']

export const GRACE_DAYS = 3
const DAY = 86400_000

export type Limits = Record<LimitKey, number | null>
export type Features = Record<FeatureKey, boolean>

export interface PlanView {
  id: string
  key: string
  name: string
  description: string
  priceCents: number
  interval: string
  active: boolean
  visible: boolean
  highlight: boolean
  ctaLabel: string
  sortOrder: number
  benefits: string[]
  limits: Limits
  features: Features
  isSystem: boolean
}

const ALL_ON: Features = { cloaker: true, pixels: true, interactive: true, prioritySupport: true }
const UNLIMITED: Limits = { pages: null, domains: null, clones: null, aiCalls: null, storageMb: null }

/** The plans a fresh install starts with (also what the pricing page shows if the table cannot be read). */
export const DEFAULT_PLANS: Omit<PlanView, 'id'>[] = [
  { key: 'FREE', name: 'Gratuito', description: 'Para conhecer a plataforma', priceCents: 0, interval: 'month', active: true, visible: false, highlight: false, ctaLabel: 'Criar conta grátis', sortOrder: 0, isSystem: true,
    benefits: ['Clonagem com imagens, fontes e vídeos hospedados'],
    limits: { pages: 1, domains: 0, clones: 5, aiCalls: 30, storageMb: 200 }, features: { cloaker: false, pixels: false, interactive: false, prioritySupport: false } },
  { key: 'BASIC', name: 'Basic', description: '', priceCents: 9700, interval: 'month', active: true, visible: true, highlight: false, ctaLabel: 'Assinar Basic', sortOrder: 10, isSystem: false,
    benefits: ['Imagens, fontes e vídeos hospedados', 'Domínios próprios'],
    limits: { pages: 2, domains: null, clones: null, aiCalls: 300, storageMb: 5120 }, features: { cloaker: true, pixels: true, interactive: true, prioritySupport: true } },
  { key: 'PRO', name: 'Pro', description: '', priceCents: 24700, interval: 'month', active: true, visible: true, highlight: true, ctaLabel: 'Assinar Pro', sortOrder: 20, isSystem: false,
    benefits: ['Imagens, fontes e vídeos hospedados', 'Domínios próprios'],
    limits: { pages: 8, domains: null, clones: null, aiCalls: 1000, storageMb: 15360 }, features: { cloaker: true, pixels: true, interactive: true, prioritySupport: true } },
  { key: 'SCALE', name: 'Scale', description: '', priceCents: 59700, interval: 'month', active: true, visible: true, highlight: false, ctaLabel: 'Assinar Scale', sortOrder: 30, isSystem: false,
    benefits: ['Imagens, fontes e vídeos hospedados', 'Domínios próprios'],
    limits: { pages: 20, domains: null, clones: null, aiCalls: 3000, storageMb: 40960 }, features: { cloaker: true, pixels: true, interactive: true, prioritySupport: true } },
  { key: 'UNLIMITED', name: 'Ilimitado', description: 'Plano interno, só o administrador coloca numa conta', priceCents: 0, interval: 'month', active: true, visible: false, highlight: false, ctaLabel: '', sortOrder: 99, isSystem: true,
    benefits: [], limits: { ...UNLIMITED }, features: { ...ALL_ON } },
]

/* ───────── reading and normalising ───────── */

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : null)

export function normalizeLimits(raw: unknown): Limits {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...UNLIMITED }
  for (const k of LIMIT_KEYS) out[k] = k in r ? num(r[k]) : null
  return out
}
export function normalizeFeatures(raw: unknown): Features {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { cloaker: false, pixels: false, interactive: false, prioritySupport: false } as Features
  for (const k of FEATURE_KEYS) out[k] = r[k] === true
  return out
}

export function toView(row: any): PlanView {
  const benefits = Array.isArray(row.benefits) ? row.benefits.map((b: any) => String(typeof b === 'string' ? b : b?.text ?? '').trim()).filter(Boolean).slice(0, 14) : []
  return {
    id: row.id, key: row.key, name: row.name, description: row.description || '', priceCents: row.priceCents || 0, interval: row.interval || 'month', active: !!row.active, visible: !!row.visible, highlight: !!row.highlight,
    ctaLabel: row.ctaLabel || '', sortOrder: row.sortOrder || 0, benefits, limits: normalizeLimits(row.limits), features: normalizeFeatures(row.features), isSystem: !!row.isSystem,
  }
}

/* ───────── what an account really gets ───────── */

export interface AccountPlanFields { planKey: string; subscriptionStatus: string; planUntil: Date | null }
export type PlanState = 'free' | 'ok' | 'grace' | 'lapsed'

export interface Entitlements {
  /** the plan the account is on */
  plan: PlanView
  /** the plan whose limits apply right now (the free one when the subscription lapsed) */
  effective: PlanView
  state: PlanState
  /** shown to the customer when something is off (due soon, lapsed) */
  message: string | null
  limits: Limits
  features: Features
}

export function stateOf(plan: PlanView, a: AccountPlanFields, now = Date.now()): { state: PlanState; message: string | null } {
  if (plan.priceCents <= 0) return { state: plan.key === 'FREE' ? 'free' : 'ok', message: null }
  const until = a.planUntil ? a.planUntil.getTime() : null
  const grace = GRACE_DAYS * DAY
  if (a.subscriptionStatus === 'active') {
    if (until === null || now <= until) return { state: 'ok', message: null }
    if (now <= until + grace) return { state: 'grace', message: `O pagamento do plano ${plan.name} venceu. Você tem até ${GRACE_DAYS} dias para regularizar antes de voltar ao plano gratuito.` }
    return { state: 'lapsed', message: `O plano ${plan.name} venceu e não foi renovado: a conta voltou aos limites do plano gratuito. O que você já criou continua guardado.` }
  }
  if (a.subscriptionStatus === 'past_due') {
    if (until !== null && now <= until + grace) return { state: 'grace', message: `Há um pagamento do plano ${plan.name} em atraso. Regularize para não voltar ao plano gratuito.` }
    return { state: 'lapsed', message: `O pagamento do plano ${plan.name} está em atraso: a conta voltou aos limites do plano gratuito. O que você já criou continua guardado.` }
  }
  if (a.subscriptionStatus === 'canceled') {
    if (until !== null && now <= until) return { state: 'ok', message: `A assinatura foi cancelada e vale até ${new Date(until).toLocaleDateString('pt-BR')}.` }
    return { state: 'lapsed', message: `A assinatura do plano ${plan.name} foi cancelada: a conta está nos limites do plano gratuito.` }
  }
  return { state: 'lapsed', message: `O plano ${plan.name} ainda não tem pagamento confirmado: a conta está nos limites do plano gratuito.` }
}

const fmtMb = (mb: number) => (mb >= 1024 ? `${(Math.round((mb / 1024) * 10) / 10).toLocaleString('pt-BR')} GB` : `${Math.round(mb)} MB`)

export function limitMessage(key: LimitKey, plan: PlanView, limit: number, used: number, lapsed = false): string {
  const name = lapsed ? `${plan.name} (vencido, valem os limites do gratuito)` : plan.name
  switch (key) {
    case 'pages': return `Seu plano ${name} permite ${limit} ${limit === 1 ? 'página ativa' : 'páginas ativas'} e você já tem ${used}. Despublique uma página ou mude de plano para publicar outra.`
    case 'clones': return `Seu plano ${name} permite ${limit} ${limit === 1 ? 'clonagem' : 'clonagens'} por mês e você já fez ${used} este mês. Ela volta a liberar no próximo mês, ou mude de plano.`
    case 'aiCalls': return `Seus créditos de IA do plano ${name} acabaram: são ${limit.toLocaleString('pt-BR')} por mês e você já usou ${used.toLocaleString('pt-BR')}. Eles voltam no próximo mês, ou mude de plano para ter mais.`
    case 'storageMb': return `Seu plano ${name} inclui ${fmtMb(limit)} de armazenamento e você já usa ${fmtMb(used)}. Apague um clone ou vídeo que não usa mais, ou mude de plano.`
    case 'domains': return `Seu plano ${name} permite ${limit} ${limit === 1 ? 'domínio próprio' : 'domínios próprios'} e você já usa ${used}.`
  }
}

export type Gate = { ok: true } | { ok: false; code: 'plan_limit' | 'plan_feature'; message: string; limit: number | null; used: number }

/** The shape every API answers with when a gate says no. */
export function gateResponse(g: Extract<Gate, { ok: false }>) {
  return { error: g.message, code: g.code, limit: g.limit, used: g.used }
}

export const brlCents = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: c % 100 ? 2 : 0 })
export const fmtLimit = (v: number | null) => (v === null ? 'Ilimitado' : v.toLocaleString('pt-BR'))

/** The lines of a plan's card on the pricing page: the limits and the features write themselves (so the card can never disagree with
 *  what the plan really allows), then the extra lines the administrator typed. */
export function planCardLines(p: PlanView): string[] {
  const out: string[] = []
  const l = p.limits
  out.push(l.pages === null ? 'Páginas ativas ilimitadas' : `Até ${l.pages.toLocaleString('pt-BR')} ${l.pages === 1 ? 'página ativa' : 'páginas ativas'}`)
  if (l.clones !== null) out.push(`${l.clones.toLocaleString('pt-BR')} ${l.clones === 1 ? 'clonagem' : 'clonagens'} por mês`)
  if (l.aiCalls !== null) out.push(`${l.aiCalls.toLocaleString('pt-BR')} créditos de IA por mês`)
  if (l.storageMb !== null) out.push(`${l.storageMb >= 1024 ? `${Math.round((l.storageMb / 1024) * 10) / 10} GB` : `${l.storageMb} MB`} de armazenamento`)
  if (l.domains !== null && l.domains > 0 && !p.benefits.some(b => /domínio/i.test(b))) out.push(`${l.domains} ${l.domains === 1 ? 'domínio próprio' : 'domínios próprios'}`)
  out.push(...p.benefits)
  for (const k of FEATURE_KEYS) if (p.features[k]) out.push(FEATURE_DEFS[k].label)
  return out
}
