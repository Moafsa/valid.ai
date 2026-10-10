/**
 * Pixels & events: the shared (pure) part. Types, the catalog of integrations, the events a project tracks, the names each vendor
 * receives. Safe to import from client components (no database here). The server side is lib/pixels-server.ts and the runtime that
 * fires everything on the public page is public/vai-e.js.
 *
 * The rule behind all of it: the pixel is optional. Nothing here, and nothing in the runtime, may ever stop a page from working.
 */

export type Integration = 'META_PIXEL' | 'GOOGLE_ANALYTICS' | 'GOOGLE_TAG' | 'TIKTOK_PIXEL' | 'GTM' | 'CUSTOM'
export const INTEGRATION_KEYS: Integration[] = ['META_PIXEL', 'GOOGLE_ANALYTICS', 'GOOGLE_TAG', 'TIKTOK_PIXEL', 'GTM', 'CUSTOM']

export interface IntegrationDef {
  label: string
  idLabel: string
  placeholder: string
  pattern: RegExp | null
  help: string
  /** what "sent" can really mean for this one */
  confirms: string
  /** runs code that its owner controls (a tag manager, a script): not run for a person who is signed in to this platform */
  risky: boolean
}

export const INTEGRATIONS: Record<Integration, IntegrationDef> = {
  META_PIXEL: { label: 'Meta Pixel', idLabel: 'ID do pixel', placeholder: '123456789012345', pattern: /^\d{8,20}$/, help: 'Gerenciador de Eventos do Meta > seu pixel > o número do ID.', confirms: 'a requisição ao Meta saiu do navegador, com o nome do evento', risky: false },
  GOOGLE_ANALYTICS: { label: 'Google Analytics 4', idLabel: 'ID de métricas', placeholder: 'G-XXXXXXXXXX', pattern: /^G-[A-Z0-9]{6,14}$/i, help: 'Google Analytics > Administrador > Fluxos de dados > ID de métricas (começa com G-).', confirms: 'a requisição de coleta saiu do navegador', risky: false },
  GOOGLE_TAG: { label: 'Google Ads', idLabel: 'ID da conta de conversão', placeholder: 'AW-123456789', pattern: /^AW-\d{6,14}$/i, help: 'Google Ads > Metas > Conversões > Tag do Google (começa com AW-). Cada evento de conversão precisa do rótulo.', confirms: 'a requisição de conversão saiu do navegador', risky: false },
  TIKTOK_PIXEL: { label: 'TikTok Pixel', idLabel: 'ID do pixel', placeholder: 'C1ABCDE2FGHI3JKL4MNO', pattern: /^[A-Z0-9]{10,26}$/i, help: 'TikTok Ads > Eventos > Eventos da Web > seu pixel (o código do pixel).', confirms: 'a requisição ao TikTok saiu do navegador', risky: false },
  GTM: { label: 'Google Tag Manager', idLabel: 'ID do contêiner', placeholder: 'GTM-XXXXXXX', pattern: /^GTM-[A-Z0-9]{4,10}$/i, help: 'Tag Manager > o código do contêiner (começa com GTM-). Se o GA4 já está dentro do contêiner, não adicione o GA4 aqui também.', confirms: 'o contêiner carregou e o evento entrou no dataLayer (o que as tags fazem a partir daí não dá para ver)', risky: true },
  CUSTOM: { label: 'Script personalizado', idLabel: 'Nome (para você achar depois)', placeholder: 'Pixel do Kwai', pattern: null, help: 'Cole o código que a plataforma te deu (com ou sem a tag <script>). Ele escuta os eventos da página: window.addEventListener("vai:pixel", e => e.detail).', confirms: 'só dá para saber que o script foi carregado', risky: true },
}

export const CUSTOM_CODE_MAX = 20_000

export type EventKind = 'pageview' | 'cta' | 'lead' | 'checkout' | 'video' | 'purchase' | 'custom'
export interface EventTrigger {
  type: 'pageview' | 'cta' | 'form' | 'checkout' | 'video' | 'page' | 'click'
  /** click: text of the button, or "sel:<css selector>" · page: the step's slug */
  match?: string
}
export interface ProjectEvent {
  id: string
  kind: EventKind
  name: string
  on: boolean
  trigger: EventTrigger
  /** a fixed value (purchase and custom events) */
  value?: number | null
  /** or a URL parameter that carries it (?valor=97) */
  valueParam?: string
  /** counts as a conversion in Métricas */
  goal: boolean
}
export interface ConsentSettings { required: boolean; respectDnt: boolean; text: string }
export interface PixelSettings { consent: ConsentSettings; currency: string; events: ProjectEvent[] }

export const DEFAULT_CONSENT: ConsentSettings = { required: false, respectDnt: true, text: 'Usamos cookies e pixels para medir os resultados dos anúncios. Você aceita?' }

export const DEFAULT_EVENTS: ProjectEvent[] = [
  { id: 'pageview', kind: 'pageview', name: 'Visualização de página', on: true, trigger: { type: 'pageview' }, goal: false },
  { id: 'cta', kind: 'cta', name: 'Clique em botões e CTAs', on: true, trigger: { type: 'cta' }, goal: false },
  { id: 'lead', kind: 'lead', name: 'Lead (envio de formulário)', on: true, trigger: { type: 'form' }, goal: true },
  { id: 'video', kind: 'video', name: 'Vídeo (início, 50% e fim)', on: false, trigger: { type: 'video' }, goal: false },
  { id: 'checkout', kind: 'checkout', name: 'Início de checkout', on: true, trigger: { type: 'checkout' }, goal: true },
  { id: 'purchase', kind: 'purchase', name: 'Compra', on: false, trigger: { type: 'page', match: '' }, value: null, goal: true },
]

const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

export function readPixelSettings(raw: unknown): PixelSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<PixelSettings>
  const c = { ...DEFAULT_CONSENT, ...(r.consent && typeof r.consent === 'object' ? r.consent : {}) }
  const saved = Array.isArray(r.events) ? r.events.filter(e => e && typeof e.id === 'string') : []
  const byId = new Map(saved.map(e => [e.id, e]))
  // the built-in events always exist (the person may only switch them on or off and set what they need); custom ones come from what was saved
  const events: ProjectEvent[] = DEFAULT_EVENTS.map(d => {
    const e = byId.get(d.id)
    if (!e) return { ...d }
    return {
      ...d, on: e.on === true,
      trigger: d.kind === 'purchase' ? { type: 'page' as const, match: clean(e.trigger?.match, 120) } : d.trigger,
      value: d.kind === 'purchase' ? numOrNull(e.value) : null, valueParam: d.kind === 'purchase' ? clean(e.valueParam, 40) || undefined : undefined,
      goal: e.goal === true,
    }
  })
  for (const e of saved) {
    if (DEFAULT_EVENTS.some(d => d.id === e.id) || !/^c_[a-z0-9]{3,12}$/.test(e.id)) continue
    const t = e.trigger?.type
    events.push({
      id: e.id, kind: 'custom', name: clean(e.name, 60) || 'Evento personalizado', on: e.on !== false,
      trigger: { type: t === 'page' || t === 'click' ? t : 'click', match: clean(e.trigger?.match, 120) },
      value: numOrNull(e.value), valueParam: clean(e.valueParam, 40) || undefined, goal: e.goal === true,
    })
  }
  return {
    consent: { required: c.required === true, respectDnt: c.respectDnt !== false, text: clean(c.text, 240) || DEFAULT_CONSENT.text },
    currency: /^[A-Z]{3}$/.test(String(r.currency)) ? String(r.currency) : 'BRL',
    events: events.slice(0, 30),
  }
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return v === null || v === undefined || v === '' || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 100) / 100
}

/* ───────── what each integration receives ───────── */

export interface MapEntry { on: boolean; name?: string; label?: string }
export type EventMap = Record<string, MapEntry>

export interface TrackingConfig { label?: string; map: EventMap; code?: string }

/** The name the vendor receives for a project event (video has three moments). */
export function vendorName(type: Integration, ev: Pick<ProjectEvent, 'id' | 'kind' | 'name'>, entry?: MapEntry, sub?: 'start' | '50' | 'end'): string {
  if (entry?.name) return entry.name
  const k = ev.kind
  switch (type) {
    case 'META_PIXEL': return ({ pageview: 'PageView', cta: 'CTA_Click', lead: 'Lead', checkout: 'InitiateCheckout', purchase: 'Purchase', video: sub === '50' ? 'Video50' : sub === 'end' ? 'VideoComplete' : 'VideoPlay', custom: ev.name } as Record<string, string>)[k]
    case 'GOOGLE_ANALYTICS': return ({ pageview: 'page_view', cta: 'cta_click', lead: 'generate_lead', checkout: 'begin_checkout', purchase: 'purchase', video: sub === '50' ? 'video_progress' : sub === 'end' ? 'video_complete' : 'video_start', custom: ev.name } as Record<string, string>)[k]
    case 'GOOGLE_TAG': return 'conversion'
    case 'TIKTOK_PIXEL': return ({ pageview: 'Pageview', cta: 'ClickButton', lead: 'SubmitForm', checkout: 'InitiateCheckout', purchase: 'CompletePayment', video: sub === '50' ? 'Video50' : sub === 'end' ? 'VideoComplete' : 'VideoPlay', custom: ev.name } as Record<string, string>)[k]
    case 'GTM': return ({ pageview: 'vai_page_view', cta: 'vai_cta_click', lead: 'vai_lead', checkout: 'vai_checkout', purchase: 'vai_purchase', video: sub === '50' ? 'vai_video_50' : sub === 'end' ? 'vai_video_complete' : 'vai_video_start', custom: ev.name } as Record<string, string>)[k]
    case 'CUSTOM': return ev.id
  }
}

/** The map a new integration starts with: every event the project tracks is sent (Google Ads needs a label per event first). */
export function defaultMap(type: Integration, events: ProjectEvent[]): EventMap {
  const map: EventMap = {}
  for (const e of events) {
    if (type === 'GOOGLE_TAG') map[e.id] = { on: e.kind === 'lead' || e.kind === 'checkout' || e.kind === 'purchase', label: '' }
    else map[e.id] = { on: true }
  }
  return map
}

export function readTrackingConfig(raw: unknown): TrackingConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<TrackingConfig>
  const map: EventMap = {}
  if (r.map && typeof r.map === 'object') {
    for (const [id, v] of Object.entries(r.map)) {
      if (!/^[a-z0-9_]{2,16}$/.test(id) || !v || typeof v !== 'object') continue
      map[id] = { on: (v as MapEntry).on === true, ...(clean((v as MapEntry).name, 60) ? { name: clean((v as MapEntry).name, 60) } : {}), ...((v as MapEntry).label !== undefined ? { label: clean((v as MapEntry).label, 80) } : {}) }
    }
  }
  return { label: clean(r.label, 60) || undefined, map, ...(typeof r.code === 'string' ? { code: r.code.slice(0, CUSTOM_CODE_MAX) } : {}) }
}

export function validPixelId(type: Integration, id: string): boolean {
  const def = INTEGRATIONS[type]
  return def.pattern ? def.pattern.test(id.trim()) : id.trim().length >= 2
}

/* ───────── what the runtime is handed ───────── */

export interface RuntimeIntegration { id: string; type: Integration; pixelId: string; map: EventMap; code?: string }
export interface PixelRuntimeConfig {
  v: 1
  p: string
  consent: ConsentSettings
  currency: string
  events: { id: string; kind: EventKind; name: string; trigger: EventTrigger; value: number | null; valueParam?: string }[]
  integrations: RuntimeIntegration[]
}

/* ───────── states ───────── */

export type PixelState = 'fired' | 'sent' | 'unconfirmed' | 'blocked' | 'skipped'
export const STATE_LABEL: Record<PixelState, { label: string; hint: string; tone: 'good' | 'warn' | 'bad' | 'mute' }> = {
  sent: { label: 'Enviado', hint: 'O navegador do visitante enviou a requisição para a plataforma.', tone: 'good' },
  fired: { label: 'Disparado', hint: 'A página chamou o pixel, mas a página fechou antes de a gente ver o envio.', tone: 'warn' },
  unconfirmed: { label: 'Sem confirmação', hint: 'A página chamou o pixel e a gente não viu a requisição sair (pode ter sido bloqueada por extensão ou rede).', tone: 'warn' },
  blocked: { label: 'Bloqueado', hint: 'O código do pixel não carregou neste navegador (bloqueador, rede ou ID inválido).', tone: 'bad' },
  skipped: { label: 'Não disparado', hint: 'O visitante não deu consentimento ou pediu para não ser rastreado: o pixel nem foi carregado.', tone: 'mute' },
}
/** a later state never replaces a better one (sent > fired > unconfirmed > blocked > skipped) */
export const STATE_RANK: Record<PixelState, number> = { sent: 5, fired: 4, unconfirmed: 3, blocked: 2, skipped: 1 }
