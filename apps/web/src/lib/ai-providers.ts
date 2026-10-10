import { randomUUID } from 'node:crypto'
import { getConfig, setConfig } from '@funnelai/db'
import { AI_PRESETS, presetOf } from '@/lib/ai-presets'

/**
 * The AI providers the platform can talk to. The admin connects as many as wanted (Claude, Groq, Gemini, ...); the list is
 * kept in the (encrypted) system config, in priority order: the first one that is on and has a key answers, and if it fails
 * the next one takes over. Everything that needs an AI (the editor assistant, the Métricas analysis) goes through here.
 */
export interface TestResult { ok: boolean; msg: string; at: number; ms: number }
export interface StoredProvider {
  id: string
  preset: string
  name: string
  kind: 'anthropic' | 'compat'
  baseUrl: string
  model: string
  key: string
  enabled: boolean
  lastTest?: TestResult
}

export class ProviderError extends Error {
  constructor(public status: number, message: string, public retryAfterMs?: number) { super(message) }
}

/** How long a provider asked to wait: the Retry-After header, Gemini's RetryInfo, or "retry in 12.3s" in the message. */
function retryHint(res: Response, err: any, raw: string): number | undefined {
  let ms: number | undefined
  const h = res.headers.get('retry-after')
  if (h) { const n = Number(h); ms = Number.isFinite(n) ? n * 1000 : Math.max(0, Date.parse(h) - Date.now()) }
  const d = Array.isArray(err?.details) ? err.details.find((x: any) => x?.retryDelay)?.retryDelay : undefined
  if (ms === undefined && typeof d === 'string') { const n = parseFloat(d); if (Number.isFinite(n)) ms = n * 1000 }
  if (ms === undefined) { const m = /retry in ([\d.]+)\s*s/i.exec(raw); if (m) ms = parseFloat(m[1]) * 1000 }
  return ms !== undefined && Number.isFinite(ms) ? Math.min(120_000, Math.max(500, Math.round(ms))) : undefined
}
export class NoProviderError extends Error {}

const CONFIG_KEY = 'ai_providers'

/**
 * A provider that just failed rests for a while (a free plan that hit its daily limit, a key that was revoked, a model that no longer
 * exists) so the next requests go straight to one that works instead of waiting on the broken one. Resting ones are still tried last.
 */
const resting = new Map<string, number>()
export function markFailed(p: StoredProvider, status: number) {
  const minutes = status === 429 ? 3 : status === 401 || status === 403 || status === 404 || status === 400 ? 10 : 1
  resting.set(p.id, Date.now() + minutes * 60_000)
}
export function markWorked(p: StoredProvider) { resting.delete(p.id) }
const isResting = (p: StoredProvider) => (resting.get(p.id) ?? 0) > Date.now()
let cache: { at: number; list: StoredProvider[] } | null = null

const hostOf = (u: string) => { try { return new URL(u).host } catch { return u } }

export function maskKey(k: string) {
  return k.length <= 10 ? '••••••••' : `${k.slice(0, 4)}…${k.slice(-4)}`
}

/** What a typed address must look like to be safe to send a key to (admin input, but still: https, and not our own network). */
export function validBaseUrl(raw: string): string | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (u.protocol !== 'https:') return null
  if (/^(localhost|127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(u.hostname) || !u.hostname.includes('.')) return null
  return (u.origin + u.pathname).replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
}

export function endpointOf(p: Pick<StoredProvider, 'kind' | 'baseUrl'>) {
  const base = p.baseUrl.replace(/\/+$/, '')
  return p.kind === 'anthropic' ? `${base}/v1/messages` : `${base}/chat/completions`
}

function clean(raw: unknown): StoredProvider[] {
  if (!Array.isArray(raw)) return []
  const out: StoredProvider[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object' || typeof r.key !== 'string' || typeof r.id !== 'string') continue
    const preset = presetOf(String(r.preset)) || presetOf('custom')!
    out.push({
      id: r.id.slice(0, 40), preset: preset.id, name: String(r.name || preset.name).slice(0, 60), kind: r.kind === 'anthropic' ? 'anthropic' : 'compat',
      baseUrl: String(r.baseUrl || ''), model: String(r.model || ''), key: r.key, enabled: r.enabled !== false,
      lastTest: r.lastTest && typeof r.lastTest.ok === 'boolean' ? { ok: r.lastTest.ok, msg: String(r.lastTest.msg || '').slice(0, 300), at: Number(r.lastTest.at) || 0, ms: Number(r.lastTest.ms) || 0 } : undefined,
    })
  }
  return out
}

/** Before the list existed there were three loose settings (one Claude key, one OpenAI-style key + address + model). Turn them into the list once. */
async function migrateLegacy(): Promise<StoredProvider[]> {
  const get = (k: string) => getConfig(k).catch(() => null)
  const [anthropic, openai, base, model, preferred] = await Promise.all([get('anthropic_api_key'), get('openai_api_key'), get('ai_editor_openai_base_url'), get('ai_editor_openai_model'), get('ai_default_provider')])
  const list: StoredProvider[] = []
  if (openai) {
    let url = (base || '').trim().replace(/\/+$/, '')
    let preset = 'openai'
    if (url) {
      preset = /groq\.com/.test(url) ? 'groq' : /googleapis\.com/.test(url) ? 'gemini' : /openrouter\.ai/.test(url) ? 'openrouter' : /nvidia\.com/.test(url) ? 'nvidia' : 'custom'
      if (preset === 'groq' && !/\/v1$/.test(url)) url += '/v1'
    }
    const p = presetOf(preset)!
    list.push({ id: randomUUID().slice(0, 8), preset, name: p.name, kind: 'compat', baseUrl: url || p.baseUrl, model: model || p.model, key: openai, enabled: true })
  }
  if (anthropic) {
    const p = presetOf('anthropic')!
    const entry: StoredProvider = { id: randomUUID().slice(0, 8), preset: 'anthropic', name: p.name, kind: 'anthropic', baseUrl: p.baseUrl, model: p.model, key: anthropic, enabled: true }
    if (preferred === 'anthropic') list.unshift(entry); else list.push(entry)
  }
  if (list.length) await saveProviders(list)
  return list
}

export async function loadProviders(): Promise<StoredProvider[]> {
  if (cache && Date.now() - cache.at < 8000) return cache.list
  let raw: string | null
  try { raw = await getConfig(CONFIG_KEY) } catch { return [] }
  let list: StoredProvider[]
  if (raw) { try { list = clean(JSON.parse(raw)) } catch { list = [] } } else list = await migrateLegacy()
  cache = { at: Date.now(), list }
  return list
}

export async function saveProviders(list: StoredProvider[]) {
  await setConfig(CONFIG_KEY, JSON.stringify(list), { label: 'Provedores de IA', category: 'AI', isSecret: true })
  cache = null
}

/** The providers a request can use, in the order they are tried. Keys in the server environment are the last resort. */
export async function usableProviders(): Promise<StoredProvider[]> {
  const list = (await loadProviders()).filter(p => p.enabled && p.key && p.model && p.baseUrl)
  const env = (id: string, key: string | undefined) => {
    const pr = presetOf(id)!
    if (key && !list.some(p => p.preset === id)) list.push({ id: `env-${id}`, preset: id, name: pr.name, kind: pr.kind, baseUrl: pr.baseUrl, model: pr.model, key, enabled: true })
  }
  env('anthropic', process.env.ANTHROPIC_API_KEY)
  env('openai', process.env.OPENAI_API_KEY)
  return [...list.filter(p => !isResting(p)), ...list.filter(isResting)]
}

/* ───────── talking to a provider ───────── */

function friendly(p: StoredProvider, status: number, raw: string): string {
  const tail = ` (${status ? `HTTP ${status}${raw ? ': ' : ''}` : ''}${raw.replace(/\s+/g, ' ').slice(0, 140)})`
  if (status === 401 || status === 403) return `Chave recusada por ${p.name}. Confira se foi copiada inteira e se ainda está ativa${tail}`
  if (status === 404) return `Modelo "${p.model}" não encontrado em ${p.name}. Troque o nome do modelo ou confira o endereço${tail}`
  if (status === 429) return `${p.name} bloqueou por limite de uso ou falta de saldo${tail}`
  if (status === 408) return `${p.name} demorou demais para responder`
  if (status >= 500) return `${p.name} está fora do ar agora${tail}`
  return `${p.name} recusou o pedido${tail}`
}

/** One POST to a provider. Any failure is a ProviderError that already says what went wrong in plain words. */
export async function postJson(p: StoredProvider, body: unknown, timeoutMs = 80_000): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (p.kind === 'anthropic') { headers['x-api-key'] = p.key; headers['anthropic-version'] = '2023-06-01' } else headers.Authorization = `Bearer ${p.key}`
  let res: Response
  try {
    res = await fetch(endpointOf(p), { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
  } catch (e: any) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new ProviderError(408, friendly(p, 408, ''))
    throw new ProviderError(0, `Não consegui conectar em ${hostOf(p.baseUrl)}. Confira o endereço${e?.cause?.code ? ` (${e.cause.code})` : ''}`)
  }
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    // some providers answer errors as a list: [{ "error": {...} }]
    const body = Array.isArray(data) ? data[0] : data
    const err = body?.error ?? body
    const raw = typeof err === 'string' ? err : err?.message || body?.message || body?.detail || ''
    throw new ProviderError(res.status, friendly(p, res.status, String(raw)), retryHint(res, err, String(raw)))
  }
  return data
}

/** Plain text in, plain text out, with the next provider taking over when one fails. */
export async function completeText(opts: { system: string; user: string; maxTokens: number; timeoutMs?: number }): Promise<{ text: string; provider: StoredProvider; inTok: number; outTok: number }> {
  const list = await usableProviders()
  if (!list.length) throw new NoProviderError('Nenhum provedor de IA ativo')
  let last: ProviderError | null = null
  for (const p of list) {
    try { const r = await callText(p, opts); markWorked(p); return { text: r.text, provider: p, inTok: r.inTok, outTok: r.outTok } } catch (e) {
      if (!(e instanceof ProviderError)) throw e
      markFailed(p, e.status)
      last = e
    }
  }
  throw last!
}

export async function callText(p: StoredProvider, opts: { system: string; user: string; maxTokens: number; timeoutMs?: number }): Promise<{ text: string; inTok: number; outTok: number }> {
  if (p.kind === 'anthropic') {
    const j = await postJson(p, { model: p.model, max_tokens: opts.maxTokens, system: opts.system, messages: [{ role: 'user', content: opts.user }] }, opts.timeoutMs)
    return { text: (j?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''), inTok: j?.usage?.input_tokens ?? 0, outTok: j?.usage?.output_tokens ?? 0 }
  }
  const j = await postJson(p, {
    model: p.model, [p.preset === 'openai' ? 'max_completion_tokens' : 'max_tokens']: opts.maxTokens,
    messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }],
  }, opts.timeoutMs)
  return { text: j?.choices?.[0]?.message?.content || '', inTok: j?.usage?.prompt_tokens ?? 0, outTok: j?.usage?.completion_tokens ?? 0 }
}

/** The models this key can really use, asked to the provider itself (names change often, so never guess them). */
export async function listModels(p: Pick<StoredProvider, 'kind' | 'baseUrl' | 'key' | 'name' | 'model'>): Promise<string[]> {
  const base = p.baseUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = p.kind === 'anthropic' ? { 'x-api-key': p.key, 'anthropic-version': '2023-06-01' } : { Authorization: `Bearer ${p.key}` }
  let res: Response
  try {
    res = await fetch(p.kind === 'anthropic' ? `${base}/v1/models?limit=100` : `${base}/models`, { headers, signal: AbortSignal.timeout(15_000) })
  } catch { throw new ProviderError(0, `Não consegui conectar em ${hostOf(p.baseUrl)}. Confira o endereço`) }
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok) throw new ProviderError(res.status, friendly(p as StoredProvider, res.status, typeof data?.error === 'string' ? data.error : data?.error?.message || data?.message || ''))
  const rows: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : []
  const ids = rows.map(r => String(r?.id || r?.name || '').replace(/^models\//, '')).filter(Boolean)
  return Array.from(new Set(ids.filter(id => !/embed|whisper|tts|guard|moderat|rerank|image|dall|speech|transcri|safety|reward|parse|audio|live|imagen|veo|video/i.test(id)))).sort()
}

/** A real, tiny request: proves the key, the address and the model all work together. */
export async function testProvider(p: StoredProvider): Promise<TestResult> {
  const t = Date.now()
  try {
    const { text } = await callText(p, { system: 'Responda apenas com a palavra: ok', user: 'ok', maxTokens: 16, timeoutMs: 25_000 })
    const ms = Date.now() - t
    return text.trim() ? { ok: true, msg: `Respondeu em ${(ms / 1000).toFixed(1)} s`, at: Date.now(), ms } : { ok: false, msg: `${p.name} respondeu vazio. Confira o modelo`, at: Date.now(), ms }
  } catch (e: any) {
    return { ok: false, msg: String(e?.message || e).slice(0, 300), at: Date.now(), ms: Date.now() - t }
  }
}

export { AI_PRESETS }
