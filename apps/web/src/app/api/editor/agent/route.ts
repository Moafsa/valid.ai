import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { aiCreditsState, chargeBonusCredits, gate, gateResponse } from '@/lib/plans'
import { creditsFor } from '@/lib/ai-credits'
import { ProviderError, usableProviders } from '@/lib/ai-providers'
import { modelTurn } from '@/lib/agent-llm'
import { STARTER_BLOCKS } from '@/lib/visual-editor/starter-blocks'
import { skillIndex } from '@/lib/visual-editor/design-skills'
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

Identidade visual (a regra mais importante):
- A primeira mensagem traz a "IDENTIDADE VISUAL DESTE SITE", medida na própria página: tema, cores com seus papéis, fontes, estilo dos botões e dos cartões, espaçamento. TUDO que você criar ou mudar (HTML novo, CSS, temas, seções) deve usar esses valores exatos, para parecer feito pela mesma marca. Não invente paleta, não troque a fonte, não mude o raio ou o estilo dos botões, a menos que o pedido peça exatamente isso.
- Em apply_theme, mantenha accent, background e font do site. Mude só o que o pedido pediu.
- Antes de criar uma seção nova, leia uma parecida que já existe (get_element_html) e siga o mesmo padrão de título, texto, botão e cartão.
- As ferramentas avisam quando algo foge da identidade ("identity_warnings"): corrija com set_styles antes de terminar.

O original é a referência (regra de ouro de design):
- O site foi clonado e o original está guardado. Antes de refazer ou mudar o layout de uma seção que já existe, leia como ela era (get_original_html). Se a versão atual perdeu o visual do original (cartão sem borda, botões ou fonte diferentes, uma fileira que virou coluna, etiqueta solta), use restore_original_block ANTES e depois aplique o pedido por cima. Não reconstrua visuais do zero.
- Se a identidade traz um ATENÇÃO (a página atual está ilegível por edições anteriores) ou o usuário pede para voltar ao original, use restore_original_page. É drástico: descarta todas as edições; não use por conta própria em outros casos.
- Se a primeira mensagem avisa FORMATO ANTIGO DA CLONAGEM, o responsivo do original não pode ser recuperado por edições: diga isso ao usuário (clonar de novo resolve) em vez de tentar e piorar a página.
- Preserve a posição e a orientação das partes (o que era fileira horizontal acima do cartão continua assim). Pense como um designer: pergunte-se se o resultado ficaria igual ao original no que o pedido não mudou.
- A primeira mensagem traz SKILLS DE FRONTEND relevantes ao pedido; siga-as. As outras estão em get_design_skill, que você pode consultar quando o pedido tocar nesses temas. Skills disponíveis:
${skillIndex()}

Interatividade (o site clonado perdeu os scripts originais, então carrosséis, sliders e abas ficam parados):
- Os carrosséis detectados vêm na primeira mensagem, com o id do contêiner e o estado. Para fazer um carrossel funcionar use SEMPRE make_carousel nesse contêiner. NUNCA escreva keyframes ou CSS de carrossel à mão.
- Nunca diga que um carrossel funciona sem ter visto "gira" em check_motion (o make_carousel já devolve essa verificação). Se não girou, leia o motivo e corrija.
- Se o pedido for sobre algo que precisa de script de verdade (calculadora, formulário que calcula, busca) e não houver ferramenta para isso, diga com clareza o que não dá para fazer aqui, em vez de simular.

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
    await chargeBonusCredits(workspace, creditsFor(turn.inTok, turn.outTok)).catch(() => {})
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
