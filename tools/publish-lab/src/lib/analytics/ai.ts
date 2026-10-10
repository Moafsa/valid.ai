import { createHash } from 'node:crypto'
import { getAiCredentials, getConfig } from '@funnelai/db'
import type { Insight } from './insights'
import type { Snapshot } from './snapshot'

/**
 * The AI layer of Métricas. It never sees raw visits, only the numbers the rules already computed, and is told to use
 * no other number. Its job is to say them like a person would: what happened, what hurts, what to try first.
 */
export interface AiReport {
  summary: string
  /** what to do first, most valuable first */
  priorities: { title: string; why: string; action: string }[]
  /** ideas worth an A/B test */
  tests: { idea: string; why: string }[]
  /** what seems to be working */
  working: string[]
  provider: string
  model: string
}

const SYSTEM = `Você é um analista de conversão que explica métricas de uma página de vendas/funil para o dono do negócio, que não é técnico. Escreva em português do Brasil, simples, direto e simpático, sem travessões, sem jargão e sem enrolação.

Regras duras:
- Use SOMENTE os números e fatos que estão no JSON. Nunca invente números, comparações, benchmarks de mercado ou causas que os dados não mostram. Se algo é hipótese, diga "pode ser" ou "vale testar".
- Se houver poucos dados (poucas visitas), diga isso com clareza e seja cauteloso.
- Cada recomendação precisa apontar para uma evidência (número) do JSON.
- Priorize o que mais pode aumentar conversão. No máximo 4 prioridades, 3 testes e 3 pontos que estão funcionando.
- Responda APENAS com um JSON no formato: {"summary": string (2 a 4 frases), "priorities": [{"title": string, "why": string, "action": string}], "tests": [{"idea": string, "why": string}], "working": [string]}`

interface Provider { kind: 'openai' | 'anthropic'; key: string }

async function pickProvider(): Promise<Provider | null> {
  const env = { openai: process.env.OPENAI_API_KEY || '', anthropic: process.env.ANTHROPIC_API_KEY || '' }
  let stored: { openai?: string | null; anthropic?: string | null } = {}
  try { stored = await getAiCredentials() } catch { /* config table unreachable: env only */ }
  const keys = { openai: stored.openai || env.openai, anthropic: stored.anthropic || env.anthropic }
  let preferred = ''
  try { preferred = (await getConfig('ai_default_provider')) || '' } catch { /* ignore */ }
  const order: ('openai' | 'anthropic')[] = preferred === 'anthropic' ? ['anthropic', 'openai'] : ['openai', 'anthropic']
  for (const kind of order) if (keys[kind]) return { kind, key: keys[kind] as string }
  return null
}

export class AiUnavailable extends Error {
  constructor(public code: 'no_ai_key' | 'provider' | 'bad_output' | 'timeout', message: string) { super(message) }
}

function compact(s: Snapshot, rules: Insight[]) {
  const t = s.totals, pv = s.previous
  return {
    periodo: s.filters,
    totais: t,
    periodoAnterior: { visitas: pv.sessions, visitantes: pv.visitors, conversoes: pv.conversions, taxaConversao: pv.conversionRate },
    origens: s.sources.slice(0, 6).map(a => ({ origem: a.label, visitas: a.sessions, conversoes: a.conversions, taxa: a.conversionRate })),
    campanhas: s.campaigns.slice(0, 6).map(a => ({ campanha: a.label, visitas: a.sessions, conversoes: a.conversions, taxa: a.conversionRate })),
    aparelhos: s.devices.map(a => ({ aparelho: a.label, visitas: a.sessions, taxa: a.conversionRate })),
    paginas: s.pages.slice(0, 8).map(a => ({ pagina: a.slug, aberturas: a.views, tempoAtivoSeg: a.avgActiveSec, rolagemMedia: a.avgScroll, taxaSaida: a.exitRate })),
    funil: s.steps.map(a => ({ etapa: a.label, pessoas: a.count, percentualDaEtapaAnterior: a.ofPrev, saiuEm: a.lostAt?.slug })),
    video: s.videos.slice(0, 2).map(a => ({ taxaPlay: a.playRate, apertaramPlay: a.plays, viram: a.seen, assistiramEmMediaPercent: a.avgPct, chegaramAoFim: a.endRate })),
    retencaoVideo: s.retention ? { duracaoSeg: s.retention.duration, espectadores: s.retention.starters, quedas: s.retention.drops, conversaoPorQuantoAssistiu: s.retention.byWatched } : null,
    publico: { quentes: s.audience.score.hot, mornos: s.audience.score.warm, frios: s.audience.score.cold, perfilQuente: s.audience.score.profile.slice(0, 4), modelos: s.audience.models.slice(0, 5).map(m => ({ marca: m.brand, modelo: m.model, visitas: m.sessions, conversao: m.conversionRate })), apps: s.audience.inApp.slice(0, 4), velocidade: { lcpP75Seg: Math.round(s.audience.speed.lcp.p75 / 100) / 10, boasPercent: s.audience.speed.goodShare, medidas: s.audience.speed.measured } },
    atrito: s.friction.items.slice(0, 5).map(a => ({ tipo: a.kind, texto: a.text, pagina: a.slug, visitas: a.sessions })),
    testes: s.experiments,
    achadosDasRegras: rules.map(r => ({ tipo: r.kind, titulo: r.title, evidencias: r.evidence })),
  }
}

const cache = new Map<string, { at: number; report: AiReport }>()

export async function aiReport(s: Snapshot, rules: Insight[]): Promise<AiReport> {
  const data = JSON.stringify(compact(s, rules))
  const key = createHash('sha1').update(data).digest('hex')
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.report

  const provider = await pickProvider()
  if (!provider) throw new AiUnavailable('no_ai_key', 'A IA ainda não foi conectada neste projeto.')
  let text = '', model = ''
  try {
    if (provider.kind === 'anthropic') {
      model = process.env.AI_EDITOR_ANTHROPIC_MODEL || 'claude-sonnet-5-5'
      const res = await fetch(`${process.env.AI_EDITOR_ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': provider.key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 2500, system: SYSTEM, messages: [{ role: 'user', content: `Dados reais da página neste período:\n${data}` }] }),
        signal: AbortSignal.timeout(60_000),
      })
      const j: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new AiUnavailable('provider', j?.error?.message || 'Anthropic error')
      text = (j?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    } else {
      model = process.env.AI_EDITOR_OPENAI_MODEL || 'gpt-4o'
      const res = await fetch(`${process.env.AI_EDITOR_OPENAI_BASE_URL || 'https://api.openai.com'}/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` },
        body: JSON.stringify({ model, max_completion_tokens: 2500, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Dados reais da página neste período:\n${data}` }] }),
        signal: AbortSignal.timeout(60_000),
      })
      const j: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new AiUnavailable('provider', j?.error?.message || 'OpenAI error')
      text = j?.choices?.[0]?.message?.content || ''
    }
  } catch (e: any) {
    if (e instanceof AiUnavailable) throw e
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new AiUnavailable('timeout', 'A IA demorou demais.')
    throw new AiUnavailable('provider', String(e?.message || e))
  }
  const m = text.match(/\{[\s\S]*\}/)
  let parsed: any = null
  try { parsed = m ? JSON.parse(m[0]) : null } catch { parsed = null }
  if (!parsed || typeof parsed.summary !== 'string') throw new AiUnavailable('bad_output', 'A IA não devolveu uma análise utilizável.')
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  const str = (v: unknown, max = 400) => String(v ?? '').replace(/—/g, ',').slice(0, max)
  const report: AiReport = {
    summary: str(parsed.summary, 900),
    priorities: arr(parsed.priorities).slice(0, 4).map((a: any) => ({ title: str(a?.title, 140), why: str(a?.why), action: str(a?.action) })),
    tests: arr(parsed.tests).slice(0, 3).map((a: any) => ({ idea: str(a?.idea, 200), why: str(a?.why) })),
    working: arr(parsed.working).slice(0, 3).map((a: any) => str(a, 300)),
    provider: provider.kind, model,
  }
  cache.set(key, { at: Date.now(), report })
  if (cache.size > 100) cache.delete(cache.keys().next().value as string)
  return report
}
