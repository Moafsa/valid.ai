import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { aiCreditsState, gate, gateResponse } from '@/lib/plans'
import { creditsFor } from '@/lib/ai-credits'
import { ProviderError, usableProviders } from '@/lib/ai-providers'
import { modelTurn } from '@/lib/agent-llm'
import { STARTER_BLOCKS } from '@/lib/visual-editor/starter-blocks'
import { AGENT_TOOLS, AgentMsgSchema } from '@/lib/visual-editor/agent-tools'

export const maxDuration = 90

const schema = z.object({
  messages: z.array(AgentMsgSchema).min(1).max(90),
  scope: z.enum(['page', 'selection']).default('page'),
})

const BLOCK_LIST = STARTER_BLOCKS.map(b => `${b.id} (${b.label})`).join(', ')

const SYSTEM = `Você é o agente de edição dentro de um editor visual de páginas (como o Lovable). O dono do site, que não é técnico, pede em português e você EXECUTA as mudanças na página real usando ferramentas, confere o resultado e corrige o que der errado.

Como trabalhar (em ciclo):
1. Entenda o pedido. A primeira mensagem já traz um resumo da página. Use get_page_outline, inspect_element e find_elements para olhar o que precisar antes de mexer. Nunca invente ids: use os que as ferramentas devolveram.
2. Aja com as ferramentas, escolhendo a mais simples que resolve:
   - apply_theme: pedidos abertos (premium, moderno, escuro, claro, mudar as cores). É o melhor primeiro passo.
   - set_styles, set_text, set_attributes: mudanças pontuais. Para vários elementos iguais, UM set_styles com kind em vez de repetir.
   - insert_html, add_block: seções novas.
   - get_element_html + replace_element: refazer uma seção mantendo os textos, links e imagens do original.
   - get_css_rules + add_css: o que o estilo inline não faz (:hover, @media, animações, classes) e para entender por que um estilo não pega.
3. Confira. Depois de alterar a página, chame check_page (com viewport "mobile" quando criar ou mexer em layout). Se aparecer problema, corrija e confira de novo. Se uma mudança piorou a página, use undo_last_change.
4. Termine só quando o pedido estiver cumprido e verificado. Aí responda SEM chamar ferramentas, em 1 ou 2 frases curtas para uma pessoa leiga (sem travessão, sem jargão), dizendo o que mudou de verdade. Se algo não foi possível, diga o quê e por quê.

Regras:
- Um resultado de ferramenta com erro é informação: leia, ajuste e tente de novo (no máximo 3 tentativas na mesma coisa). Depois explique ao usuário.
- Se o escopo for "só o elemento selecionado", não mexa fora dele; as ferramentas recusam.
- Faça o que foi pedido por inteiro e de forma visível. Mantenha textos, links, preços, vídeos e imagens, a menos que o pedido fale deles.
- Nunca invente links, preços, números nem depoimentos de pessoas reais: use textos de exemplo claros. Nunca coloque script, atributos on* nem javascript:.
- HTML novo: estilos inline, responsivo (grid com repeat(auto-fit,minmax(240px,1fr)), max-width, padding), usando as cores e fontes da página. Textos reais e coerentes com o assunto dela.
- Não troque imagens de fundo nem remova vídeos, formulários ou botões de checkout sem o pedido pedir.
- Seja econômico: cada passo é um pedido ao provedor de IA, e planos grátis aceitam poucos por minuto. Junte o que puder numa mesma resposta (várias ferramentas de uma vez quando uma não depende do resultado da outra), não releia a página se o resumo já basta e chame check_page uma vez no fim.
- Seções prontas para add_block: ${BLOCK_LIST}.`

const hits = new Map<string, number[]>()
function limited(id: string) {
  const now = Date.now()
  const arr = (hits.get(id) || []).filter(t => now - t < 60_000)
  arr.push(now)
  hits.set(id, arr)
  return arr.length > 90
}

export async function POST(req: NextRequest) {
  const started = Date.now()
  try {
    const workspace = await getCurrentWorkspace()
    if (!workspace) return NextResponse.json({ error: 'Faça login de novo pra usar a IA.', code: 'unauthorized' }, { status: 401 })
    if (limited(workspace.id)) return NextResponse.json({ error: 'Calma, são muitos pedidos seguidos. Tente de novo em um minuto.', code: 'rate' }, { status: 429 })

    const raw = await req.text()
    if (raw.length > 1_500_000) return NextResponse.json({ error: 'A conversa ficou grande demais. Comece um pedido novo.', code: 'too_long' }, { status: 413 })
    const body = schema.parse(JSON.parse(raw))

    const plan = await gate(workspace, 'aiCalls', 1)
    if (!plan.ok) return NextResponse.json({ ...gateResponse(plan), code: 'plan_limit' }, { status: 403 })
    const providers = await usableProviders()
    if (!providers.length) return NextResponse.json({ error: 'A IA ainda não foi conectada neste projeto.', code: 'no_ai_key' }, { status: 503 })

    const turn = await modelTurn(providers, { system: SYSTEM + (body.scope === 'selection' ? '\n\nESCOPO DESTE PEDIDO: só o elemento selecionado e o que está dentro dele.' : ''), messages: body.messages, tools: AGENT_TOOLS })

    await db.aiUsageLog.create({
      data: {
        workspaceId: workspace.id, operation: 'editor_ai', model: turn.provider.model, provider: turn.provider.preset,
        inputTokens: turn.inTok, outputTokens: turn.outTok, creditsUsed: creditsFor(turn.inTok, turn.outTok), durationMs: Date.now() - started,
      },
    }).catch(() => {})
    const credits = await aiCreditsState(workspace).catch(() => null)
    return NextResponse.json({ message: turn.message, stop: turn.stop, provider: turn.provider.preset, model: turn.provider.model, credits })
  } catch (e: any) {
    if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Pedido inválido.', code: 'invalid' }, { status: 400 })
    if (e instanceof ProviderError && e.status === 429) {
      console.error('Agent: rate limited', e.message)
      return NextResponse.json({ error: 'O provedor de IA atingiu o limite de pedidos por minuto.', code: 'rate_limited', retryAfterMs: e.retryAfterMs ?? null }, { status: 429 })
    }
    if (e instanceof ProviderError) {
      console.error('Agent: every provider failed', e.status, e.message)
      const msg = e.status === 401 || e.status === 403 ? 'A chave da IA configurada foi recusada. Confira na aba IA do admin.'
        : e.status === 429 ? 'A IA está sobrecarregada ou sem saldo agora. Tente em instantes.'
        : e.status === 408 ? 'A IA demorou demais nesse passo.'
        : 'A IA não respondeu. Tente de novo.'
      return NextResponse.json({ error: msg, code: 'provider' }, { status: 502 })
    }
    console.error('Agent error', e)
    return NextResponse.json({ error: 'Algo deu errado. Tente de novo.', code: 'internal' }, { status: 500 })
  }
}
