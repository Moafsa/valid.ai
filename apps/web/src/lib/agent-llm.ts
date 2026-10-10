import { ProviderError, markFailed, markWorked, postJson, type StoredProvider } from '@/lib/ai-providers'
import type { AgentMsg, Block, ToolDef } from '@/lib/visual-editor/agent-tools'

/**
 * One model turn of the editor agent, for any connected provider. The conversation arrives in a neutral format
 * (see lib/visual-editor/agent-tools.ts) and is converted to what the provider expects:
 *   - Claude: content blocks (`tool_use` from the model, `tool_result` blocks back in the next user message).
 *   - OpenAI-style (Gemini, Groq, OpenRouter, OpenAI...): `tool_calls` on the assistant message and one `tool` message per result.
 * When a provider fails the next one takes over, so a rate limit in the middle of a task does not end the task.
 */

export interface ModelTurn {
  message: AgentMsg
  /** 'tool_use': the model wants tools run · 'end': it answered · 'length': it ran out of room */
  stop: 'tool_use' | 'end' | 'length'
  inTok: number
  outTok: number
  provider: StoredProvider
}

const text = (blocks: Block[]) => blocks.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text').map(b => b.text).join('\n').trim()

/* ───────── to the provider ───────── */

export function toAnthropicMessages(messages: AgentMsg[]) {
  return messages.map(m => {
    const results = m.content.filter(b => b.type === 'tool_result')
    const rest = m.content.filter(b => b.type !== 'tool_result')
    // Claude wants the tool results first in the user message that answers a tool_use
    const ordered = [...results, ...rest]
    return {
      role: m.role,
      content: ordered.map(b => {
        if (b.type === 'text') return { type: 'text', text: b.text || '(vazio)' }
        if (b.type === 'image') return { type: 'image', source: { type: 'base64', media_type: b.media_type, data: b.data } }
        if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input }
        return { type: 'tool_result', tool_use_id: b.tool_use_id, content: b.content || '(vazio)', ...(b.is_error ? { is_error: true } : {}) }
      }),
    }
  })
}

export function toOpenAIMessages(system: string, messages: AgentMsg[], opts: { emptyAssistant?: string | null } = {}) {
  const out: any[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'assistant') {
      const calls = m.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use')
      const t = text(m.content)
      out.push({
        role: 'assistant',
        content: t || (calls.length ? opts.emptyAssistant ?? null : '(vazio)'),
        ...(calls.length ? { tool_calls: calls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input) } })) } : {}),
      })
      continue
    }
    for (const b of m.content) if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: b.content || '(vazio)' })
    const parts: any[] = []
    for (const b of m.content) {
      if (b.type === 'text') parts.push({ type: 'text', text: b.text || '(vazio)' })
      else if (b.type === 'image') parts.push({ type: 'image_url', image_url: { url: `data:${b.media_type};base64,${b.data}` } })
    }
    if (parts.length) out.push({ role: 'user', content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts })
  }
  return out
}

const anthropicTools = (tools: ToolDef[]) => tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }))
const openaiTools = (tools: ToolDef[]) => tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))

/* ───────── from the provider ───────── */

export function fromAnthropic(data: any): Pick<ModelTurn, 'message' | 'stop' | 'inTok' | 'outTok'> {
  const content: Block[] = []
  for (const b of data?.content || []) {
    if (b.type === 'text' && b.text) content.push({ type: 'text', text: b.text })
    else if (b.type === 'tool_use') content.push({ type: 'tool_use', id: String(b.id), name: String(b.name), input: b.input && typeof b.input === 'object' ? b.input : {} })
  }
  const stop = data?.stop_reason === 'tool_use' ? 'tool_use' : data?.stop_reason === 'max_tokens' ? 'length' : 'end'
  return { message: { role: 'assistant', content: content.length ? content : [{ type: 'text', text: '' }] }, stop, inTok: data?.usage?.input_tokens ?? 0, outTok: data?.usage?.output_tokens ?? 0 }
}

let callSeq = 0
export function fromOpenAI(data: any): Pick<ModelTurn, 'message' | 'stop' | 'inTok' | 'outTok'> {
  const choice = data?.choices?.[0]
  const msg = choice?.message || {}
  const content: Block[] = []
  const t = typeof msg.content === 'string' ? msg.content : Array.isArray(msg.content) ? msg.content.map((p: any) => p?.text || '').join('') : ''
  if (t.trim()) content.push({ type: 'text', text: t })
  for (const c of msg.tool_calls || []) {
    let input: Record<string, unknown> = {}
    const raw = c?.function?.arguments
    if (typeof raw === 'string' && raw.trim()) { try { input = JSON.parse(raw) } catch { input = { __invalid_json: raw.slice(0, 300) } } }
    else if (raw && typeof raw === 'object') input = raw
    // some providers leave the call id empty: the next request needs one to pair the result with the call
    content.push({ type: 'tool_use', id: c?.id ? String(c.id) : `call_${Date.now().toString(36)}_${++callSeq}`, name: String(c?.function?.name || ''), input })
  }
  const hasCalls = content.some(b => b.type === 'tool_use')
  const stop = hasCalls ? 'tool_use' : choice?.finish_reason === 'length' ? 'length' : 'end'
  return { message: { role: 'assistant', content: content.length ? content : [{ type: 'text', text: '' }] }, stop, inTok: data?.usage?.prompt_tokens ?? 0, outTok: data?.usage?.completion_tokens ?? 0 }
}

/* ───────── one turn, with failover ───────── */

export async function modelTurn(providers: StoredProvider[], opts: { system: string; messages: AgentMsg[]; tools: ToolDef[]; maxTokens?: number; timeoutMs?: number }): Promise<ModelTurn> {
  let last: ProviderError | null = null
  const maxTokens = opts.maxTokens ?? 12000
  for (const p of providers) {
    try {
      let parsed: Pick<ModelTurn, 'message' | 'stop' | 'inTok' | 'outTok'>
      if (p.kind === 'anthropic') {
        const data = await postJson(p, { model: p.model, max_tokens: maxTokens, system: opts.system, messages: toAnthropicMessages(opts.messages), tools: anthropicTools(opts.tools), tool_choice: { type: 'auto' } }, opts.timeoutMs ?? 85_000)
        parsed = fromAnthropic(data)
      } else {
        const data = await postJson(p, {
          model: p.model, [p.preset === 'openai' ? 'max_completion_tokens' : 'max_tokens']: maxTokens,
          messages: toOpenAIMessages(opts.system, opts.messages, { emptyAssistant: p.preset === 'gemini' ? '' : null }),
          tools: openaiTools(opts.tools), tool_choice: 'auto',
        }, opts.timeoutMs ?? 85_000)
        parsed = fromOpenAI(data)
      }
      markWorked(p)
      return { ...parsed, provider: p }
    } catch (e) {
      if (!(e instanceof ProviderError)) throw e
      console.error('Agent: provider failed', p.name, e.status, e.message)
      markFailed(p, e.status)
      if (e.status === 429 && last?.status === 429 && last.retryAfterMs && e.retryAfterMs) e.retryAfterMs = Math.min(e.retryAfterMs, last.retryAfterMs)
      last = e
    }
  }
  throw last ?? new ProviderError(503, 'sem provedor')
}
