import { NextRequest, NextResponse } from 'next/server'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { db, getAiCredentials, getConfig } from '@funnelai/db'
import { z } from 'zod'
import { gate, gateResponse } from '@/lib/plans'
import { STARTER_BLOCKS } from '@/lib/visual-editor/starter-blocks'
import { APPLY_CHANGES_TOOL, AssistResponseSchema, OperationSchema } from '@/lib/visual-editor/ai-types'

export const maxDuration = 90

const schema = z.object({
  instruction: z.string().min(1).max(1500),
  outline: z.any(),
  selectedHtml: z.string().max(7000).optional(),
  scope: z.enum(['page', 'selection']).default('page'),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(1200) })).max(10).optional(),
  /** a reference picture (data URL, already downscaled by the browser) */
  image: z.string().max(2_200_000).regex(/^data:image\/(png|jpe?g|webp);base64,/).optional(),
})

const BLOCK_LIST = STARTER_BLOCKS.map(b => `${b.id} (${b.label})`).join(', ')

const SYSTEM = `Você é o assistente de edição dentro de um editor visual de páginas (parecido com Figma + Elementor). O dono do site, que não é técnico, escreve o que quer em português e você EDITA A PÁGINA de verdade, devolvendo operações que o editor aplica.

Como pensar:
- Você recebe um "outline" da página aberta: seções (s1, s2...) e elementos (e1, e2...) com tipo, texto e cores atuais. Mire sempre nesses ids, ou use busca por tipo (kind) para mudanças em vários elementos ("todos os botões" = target {by:"kind", kind:"button"}).
- Mudança geral de aparência (fundo, cores, fonte, espaçamento) mexe em VÁRIOS lugares: seções, títulos, textos, botões. Pense no resultado final como um designer: se o fundo vira escuro, os textos precisam virar claros; se mudar a cor da marca, aplique nos botões e destaques coerentemente. Uma página "mais premium" ganha mais respiro, tipografia melhor, poucas cores e contraste elegante.
- Respeite o pedido: se o usuário falar de "essa seção" ou "esse elemento", use o que está em "selected" do outline e NÃO mexa no resto da página. Sem seleção e sem escopo claro, o pedido vale para a página toda.
- Use op "style" com css em kebab-case (background-color, color, font-size, font-family, font-weight, letter-spacing, line-height, padding-top, padding-bottom, border-radius, box-shadow, text-align, border...). Use valores completos com unidade. Fundo de página inteira: target {by:"page"}.
- Para adicionar uma seção comum use op "add_block" com um destes ids: ${BLOCK_LIST}. Ela entra no fim da página por padrão (where "page-end"); "page-start" põe no topo; "after" com target põe depois de um elemento ou seção. Para algo que a biblioteca não tem, use op "insert" com UM elemento HTML, só estilos inline (sem classes, sem script), responsivo (grid com auto-fit, max-width, padding) e com a mesma linguagem visual da página (cores e fontes do outline).
- Para trocar o texto use op "text" (um elemento por operação). Para refazer um elemento por inteiro use "replace" com UM elemento HTML. Para tirar algo use "remove".
- Quando o pedido for "deixar parecido com a referência" e houver imagem anexada, compare a imagem com a página e ajuste cores, tipografia, espaçamento, cantos e sombras para chegar perto, sem inventar conteúdo.
- Nunca invente links, preços ou depoimentos reais: use textos de exemplo claros. Nunca inclua script, atributos on*, nem javascript:.
- Faça só o que foi pedido, mas faça por inteiro. Evite passar de 40 operações; agrupe elementos com o mesmo estilo num único target.
- O "reply" é para uma pessoa leiga: 1 ou 2 frases curtas, simpáticas, dizendo o que mudou (ou perguntando UMA coisa se o pedido estiver confuso). Sem travessão, sem jargão técnico, sem listas.`

function sanitizeOps(raw: unknown): z.infer<typeof OperationSchema>[] {
  if (!Array.isArray(raw)) return []
  const out: z.infer<typeof OperationSchema>[] = []
  for (const item of raw) {
    const parsed = OperationSchema.safeParse(item)
    if (!parsed.success) continue
    const op = parsed.data
    if (op.html && (/<script[\s>]/i.test(op.html) || /\son[a-z]+\s*=/i.test(op.html) || /javascript:/i.test(op.html))) continue
    if (op.css) {
      for (const [k, v] of Object.entries(op.css)) if (/[{};]/.test(v) || /javascript:/i.test(v)) delete op.css[k]
    }
    out.push(op)
  }
  return out
}

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

function userContent(p: { instruction: string; outline: unknown; selectedHtml?: string; scope?: string; history?: { role: string; text: string }[] }) {
  const hist = (p.history || []).map(h => `${h.role === 'user' ? 'Usuário' : 'Assistente'}: ${h.text}`).join('\n')
  return [
    hist ? `Conversa até agora:\n${hist}\n` : '',
    `Pedido do usuário: ${p.instruction}`,
    p.scope === 'selection' ? 'ESCOPO: SÓ o elemento selecionado (outline.selected) e o que está dentro dele. Não mexa no resto da página.' : 'ESCOPO: a página inteira.',
    '',
    'Outline da página (JSON):',
    JSON.stringify(p.outline),
    p.selectedHtml ? `\nHTML do elemento selecionado (cortado):\n${p.selectedHtml}` : '',
  ].filter(Boolean).join('\n')
}

async function callOpenAI(key: string, p: Parameters<typeof userContent>[0], image?: string) {
  const base = process.env.AI_EDITOR_OPENAI_BASE_URL || 'https://api.openai.com'
  const configured = process.env.AI_EDITOR_OPENAI_MODEL || (await getConfig('ai_editor_model').catch(() => null))
  // an account that has no access to one model answers 404: try the next best
  const models = [configured, 'gpt-4o', 'gpt-4.1', 'gpt-4o-mini'].filter((m, i, a): m is string => !!m && a.indexOf(m) === i)
  const content: any[] = [{ type: 'text', text: userContent(p) }]
  if (image) content.push({ type: 'image_url', image_url: { url: image } })
  let lastErr: ProviderError | null = null
  for (const model of models) {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_completion_tokens: 6000,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content }],
        tools: [{ type: 'function', function: { name: APPLY_CHANGES_TOOL.name, description: APPLY_CHANGES_TOOL.description, parameters: APPLY_CHANGES_TOOL.parameters } }],
        tool_choice: { type: 'function', function: { name: APPLY_CHANGES_TOOL.name } },
      }),
      signal: AbortSignal.timeout(80_000),
    })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      lastErr = new ProviderError(res.status, data?.error?.message || 'OpenAI error')
      if (res.status === 404 || data?.error?.code === 'model_not_found') continue
      throw lastErr
    }
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
    return { args, model, inTok: data?.usage?.prompt_tokens ?? 0, outTok: data?.usage?.completion_tokens ?? 0 }
  }
  throw lastErr ?? new ProviderError(502, 'OpenAI error')
}

async function callAnthropic(key: string, p: Parameters<typeof userContent>[0], image?: string) {
  const base = process.env.AI_EDITOR_ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
  const model = process.env.AI_EDITOR_ANTHROPIC_MODEL || 'claude-sonnet-5-5'
  const content: any[] = []
  if (image) {
    const m = image.match(/^data:(image\/[a-z+]+);base64,(.+)$/i)
    if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } })
  }
  content.push({ type: 'text', text: userContent(p) })
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 6000,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      tools: [{ name: APPLY_CHANGES_TOOL.name, description: APPLY_CHANGES_TOOL.description, input_schema: APPLY_CHANGES_TOOL.parameters }],
      tool_choice: { type: 'tool', name: APPLY_CHANGES_TOOL.name },
    }),
    signal: AbortSignal.timeout(80_000),
  })
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok) throw new ProviderError(res.status, data?.error?.message || 'Anthropic error')
  const block = (data?.content || []).find((b: any) => b.type === 'tool_use')
  return { args: block?.input, model, inTok: data?.usage?.input_tokens ?? 0, outTok: data?.usage?.output_tokens ?? 0 }
}

class ProviderError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

// a small per-workspace brake (the model call costs money)
const hits = new Map<string, number[]>()
function limited(id: string) {
  const now = Date.now()
  const arr = (hits.get(id) || []).filter(t => now - t < 60_000)
  arr.push(now)
  hits.set(id, arr)
  return arr.length > 20
}

export async function POST(req: NextRequest) {
  const started = Date.now()
  try {
    const workspace = await getCurrentWorkspace()
    if (!workspace) return NextResponse.json({ error: 'Faça login de novo pra usar a IA.', code: 'unauthorized' }, { status: 401 })
    if (limited(workspace.id)) return NextResponse.json({ error: 'Calma, são muitos pedidos seguidos. Tente de novo em um minuto.', code: 'rate' }, { status: 429 })

    const body = schema.parse(await req.json())
    const plan = await gate(workspace, 'aiCalls')
    if (!plan.ok) return NextResponse.json({ ...gateResponse(plan), code: 'plan_limit' }, { status: 403 })
    const provider = await pickProvider()
    if (!provider) return NextResponse.json({ error: 'A IA ainda não foi conectada neste projeto.', code: 'no_ai_key' }, { status: 503 })

    const payload = { instruction: body.instruction, outline: body.outline, selectedHtml: body.selectedHtml, scope: body.scope, history: body.history }
    const out = provider.kind === 'anthropic' ? await callAnthropic(provider.key, payload, body.image) : await callOpenAI(provider.key, payload, body.image)

    let args: any = out.args
    if (typeof args === 'string') { try { args = JSON.parse(args) } catch { args = null } }
    if (!args || typeof args !== 'object') return NextResponse.json({ error: 'A IA não conseguiu montar uma resposta. Tente dizer o pedido de outro jeito.', code: 'bad_output' }, { status: 502 })

    const parsed = AssistResponseSchema.safeParse({ reply: typeof args.reply === 'string' ? args.reply : '', operations: [] })
    const operations = sanitizeOps(args.operations)

    db.aiUsageLog.create({
      data: {
        workspaceId: workspace.id, operation: 'editor_ai', model: out.model, provider: provider.kind,
        inputTokens: out.inTok, outputTokens: out.outTok, durationMs: Date.now() - started,
      },
    }).catch(() => {})

    return NextResponse.json({ reply: parsed.success ? parsed.data.reply : '', operations, provider: provider.kind, model: out.model })
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Pedido inválido.', code: 'invalid' }, { status: 400 })
    if (e instanceof ProviderError) {
      console.error('AI assist provider error', e.status, e.message)
      const msg = e.status === 401 || e.status === 403 ? 'A chave da IA configurada foi recusada. Confira em Configurações do admin.'
        : e.status === 429 ? 'A IA está sobrecarregada ou sem saldo agora. Tente em instantes.'
        : 'A IA não respondeu. Tente de novo.'
      return NextResponse.json({ error: msg, code: 'provider' }, { status: 502 })
    }
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return NextResponse.json({ error: 'A IA demorou demais. Tente um pedido menor.', code: 'timeout' }, { status: 504 })
    console.error('AI assist error', e)
    return NextResponse.json({ error: 'Algo deu errado. Tente de novo.', code: 'internal' }, { status: 500 })
  }
}
