import { NextRequest, NextResponse } from 'next/server'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { gate, gateResponse } from '@/lib/plans'

const schema = z.object({
  html: z.string().min(1).max(20000),
  instruction: z.string().min(1).max(500),
})

const SYSTEM_PROMPT = `Você edita um único elemento HTML de uma página web, a pedido do dono do site.

Regras obrigatórias:
- Devolva SOMENTE o HTML modificado. Nada de explicação, nada de comentário, nada de cerca de markdown (sem \`\`\`).
- Devolva exatamente UM elemento de nível superior — nunca múltiplos elementos irmãos, nunca texto solto fora de uma tag.
- Mantenha a mesma tag raiz do elemento original, a menos que o pedido peça explicitamente pra mudar o tipo de elemento.
- Preserve tudo que não foi pedido pra mudar: outros atributos, classes, estrutura interna. Em especial, preserve os atributos "data-vai-block-id" e "id" exatamente como estavam, se existirem.
- Nunca inclua tags <script>, atributos de evento inline (onclick, onload, etc.) ou valores "javascript:" em href/src.
- Aplique apenas a mudança pedida. Não reescreva nem "melhore" partes do elemento que não foram mencionadas no pedido.`

/**
 * Edits exactly ONE selected GrapesJS component via natural language —
 * the server only produces and lightly cleans the replacement HTML; the
 * client (visual-editor.tsx, applyAiEdit) does the authoritative DOM-based
 * validation/sanitize pass and the actual swap via comp.replaceWith(),
 * which is what structurally guarantees nothing outside this one element
 * is ever touched.
 */
export async function POST(req: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace()
    if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { html, instruction } = schema.parse(await req.json())

    const plan = await gate(workspace, 'aiCalls')
    if (!plan.ok) return NextResponse.json(gateResponse(plan), { status: 403 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada no servidor' }, { status: 500 })
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Pedido: ${instruction}\n\n---\nHTML atual do elemento:\n${html}` },
        ],
      }),
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      console.error('AI edit: Anthropic API error', res.status, errBody)
      return NextResponse.json({ error: 'Falha ao consultar a IA' }, { status: 502 })
    }

    const data = await res.json()
    let text: string = data?.content?.[0]?.text ?? ''
    text = text.trim()
    // Defensive: the system prompt says no markdown fences, but strip them
    // if the model includes one anyway rather than failing the request.
    text = text.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim()

    if (!text) {
      return NextResponse.json({ error: 'A IA não devolveu nenhum resultado' }, { status: 502 })
    }
    // First layer of defense — the client's DOMParser-based pass is the
    // authoritative one, this just avoids handing back something blatantly
    // unsafe even before it reaches that real parser.
    if (/<script[\s>]/i.test(text) || /\son\w+\s*=/i.test(text) || /javascript:/i.test(text)) {
      return NextResponse.json({ error: 'A IA devolveu conteúdo não permitido' }, { status: 502 })
    }

    db.aiUsageLog.create({ data: { workspaceId: workspace.id, operation: 'editor_ai_edit', model: 'claude-sonnet-5-5', provider: 'anthropic' } }).catch(() => {})
    return NextResponse.json({ html: text })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }
    console.error('AI edit error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
