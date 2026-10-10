/**
 * The contract between the editor's AI agent (browser) and /api/editor/agent (server).
 *
 * The model runs on the server (the API key never reaches the browser), but the TOOLS run in the browser, against the live editor:
 * that is where the real page is. One request = one model turn. The browser keeps the loop: it executes the tools the model asked
 * for, appends their results and asks again, until the model answers without calling a tool.
 *
 * Messages use one neutral format (close to Anthropic's) that the server converts for Claude and for OpenAI-style providers.
 */
import { z } from 'zod'
import { KINDS, ThemeSchema } from './ai-types'

export type Block =
  | { type: 'text'; text: string }
  | { type: 'image'; media_type: string; data: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

/** `reasoning_content`: the model's own chain of thought, kept only so providers in thinking mode (DeepSeek) get it back untouched next turn */
export interface AgentMsg { role: 'user' | 'assistant'; content: Block[]; reasoning_content?: string }

export const BlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().max(60_000) }),
  z.object({ type: z.literal('image'), media_type: z.string().regex(/^image\/(png|jpe?g|webp)$/), data: z.string().max(2_200_000) }),
  z.object({ type: z.literal('tool_use'), id: z.string().min(1).max(120), name: z.string().min(1).max(60), input: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('tool_result'), tool_use_id: z.string().min(1).max(120), content: z.string().max(40_000), is_error: z.boolean().optional() }),
])
export const AgentMsgSchema = z.object({ role: z.enum(['user', 'assistant']), content: z.array(BlockSchema).min(1).max(40), reasoning_content: z.string().max(60_000).optional() })

export interface ToolDef { name: string; description: string; parameters: Record<string, unknown> }

const WHERE_PAGE = ['before', 'after', 'start', 'end', 'page-start', 'page-end']
const kindEnum = { type: 'string', enum: [...KINDS] }
const label = { type: 'string', description: 'O que esta mudança faz, em até 12 palavras, em português (o usuário vê).' }

/** What the model can do. Every one of these runs on the real editor (see lib/visual-editor/agent-session.ts). */
export const AGENT_TOOLS: ToolDef[] = [
  {
    name: 'get_page_outline',
    description: 'Lê a estrutura atual da página: seções (com id, título, altura, cor de fundo) e os elementos de cada uma (id, tipo, texto, cor, tamanho). Use para se orientar e de novo depois de mudanças grandes. Os ids são estáveis: valem em todas as outras ferramentas.',
    parameters: { type: 'object', properties: { section_id: { type: 'string', description: 'Se informado, devolve só essa seção, com mais detalhe.' } } },
  },
  {
    name: 'get_selection',
    description: 'Devolve o elemento que o usuário selecionou no editor (id, tipo, texto, estilos), ou null se não há seleção.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'inspect_element',
    description: 'Detalha UM elemento: tag, classes, texto, atributos (href, src, alt), tamanho na tela, estilos calculados relevantes, o pai e os filhos diretos (com ids). Use antes de mudar algo que você ainda não entende.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'find_elements',
    description: 'Procura elementos por tipo, trecho de texto, tag ou dentro de outro elemento. Devolve ids estáveis.',
    parameters: {
      type: 'object',
      properties: {
        kind: { ...kindEnum, description: 'section, heading, text, button, link, image, input ou video' },
        text_contains: { type: 'string' }, tag: { type: 'string', description: 'ex: div, h2, a' },
        within: { type: 'string', description: 'id de um elemento ou seção para limitar a busca' },
        limit: { type: 'integer', description: 'máximo de resultados (padrão 30)' },
      },
    },
  },
  {
    name: 'set_styles',
    description: 'Muda estilos CSS de elementos. Aponte com ids, ou com kind (todos de um tipo, opcionalmente dentro de "within" ou com "text_contains"), ou page:true (página toda: fundo, fonte). Devolve quantos elementos MUDARAM na tela de verdade; se zero, é erro e você precisa tentar de outro jeito.',
    parameters: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } },
        kind: kindEnum, within: { type: 'string' }, text_contains: { type: 'string' }, page: { type: 'boolean' },
        css: { type: 'object', additionalProperties: { type: 'string' }, description: 'propriedades em kebab-case com unidade: {"font-size":"48px","border-radius":"12px"}' },
        label,
      },
      required: ['css'],
    },
  },
  {
    name: 'apply_theme',
    description: 'Repagina a página inteira (ou só a seleção) numa direção visual: cores, cantos, sombras, espaçamento, peso dos títulos, estilo dos botões. O editor aplica em todos os títulos, textos, botões, imagens e seções de forma consistente. É o melhor primeiro passo para pedidos abertos (premium, moderno, escuro, claro).',
    parameters: { type: 'object', properties: { theme: themeJsonSchema(), label }, required: ['theme'] },
  },
  {
    name: 'set_text',
    description: 'Troca o texto de um elemento (o elemento e seu estilo continuam).',
    parameters: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' }, label }, required: ['id', 'text'] },
  },
  {
    name: 'set_attributes',
    description: 'Muda atributos de um elemento: href, src, alt, target, title... Use null para remover um atributo.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, attrs: { type: 'object', additionalProperties: { type: ['string', 'null'] } }, label }, required: ['id', 'attrs'] },
  },
  {
    name: 'insert_html',
    description: 'Insere UM elemento HTML novo (normalmente uma <section> completa), só com estilos inline, sem script. Devolve o id novo e o tamanho que ele ocupou. Para layout responsivo use grid com repeat(auto-fit,minmax(...,1fr)), max-width e padding.',
    parameters: {
      type: 'object',
      properties: { html: { type: 'string' }, where: { type: 'string', enum: WHERE_PAGE, description: 'padrão page-end' }, target_id: { type: 'string', description: 'obrigatório para before, after, start, end' }, label },
      required: ['html'],
    },
  },
  {
    name: 'add_block',
    description: 'Adiciona uma seção pronta da biblioteca do editor. Veja os ids disponíveis na descrição do sistema.',
    parameters: { type: 'object', properties: { block: { type: 'string' }, where: { type: 'string', enum: WHERE_PAGE }, target_id: { type: 'string' }, label }, required: ['block'] },
  },
  {
    name: 'replace_element',
    description: 'Refaz um elemento (ou uma seção inteira) trocando por um HTML novo. O resto da página não é tocado. Antes, leia o original com get_element_html para manter textos, links e imagens.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, html: { type: 'string' }, label }, required: ['id', 'html'] },
  },
  {
    name: 'remove_elements',
    description: 'Remove elementos da página (até 20).',
    parameters: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } }, label }, required: ['ids'] },
  },
  {
    name: 'move_element',
    description: 'Muda um elemento ou seção de lugar (reorganizar a página).',
    parameters: { type: 'object', properties: { id: { type: 'string' }, target_id: { type: 'string' }, where: { type: 'string', enum: ['before', 'after', 'start', 'end'] }, label }, required: ['id', 'target_id', 'where'] },
  },
  {
    name: 'get_element_html',
    description: 'Lê o HTML de um elemento e as regras de CSS que se aplicam diretamente a ele. Use antes de replace_element ou add_css.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, max_chars: { type: 'integer' } }, required: ['id'] },
  },
  {
    name: 'get_css_rules',
    description: 'Procura nas regras de CSS da página (as do site original e as do editor) por um trecho de seletor ou de valor. Use para entender por que um estilo não pega.',
    parameters: { type: 'object', properties: { contains: { type: 'string' }, limit: { type: 'integer' } } },
  },
  {
    name: 'add_css',
    description: 'Acrescenta regras de CSS à página (classes novas, @media, :hover, animações). Para a mudança valer sobre o CSS do site original, use seletor específico ou !important. O editor salva a página bloco a bloco: a regra só é guardada se algum elemento da página usa a classe/seletor (regras em body ou html não são salvas). Informe "verify" para conferir o efeito na hora.',
    parameters: {
      type: 'object',
      properties: {
        css: { type: 'string', description: 'regras completas: ".cartao{border-radius:16px}" ' },
        verify: { type: 'object', properties: { selector: { type: 'string' }, property: { type: 'string' } }, description: 'depois de aplicar, devolve o valor calculado dessa propriedade no primeiro elemento do seletor' },
        label,
      },
      required: ['css'],
    },
  },
  {
    name: 'get_site_style',
    description: 'Devolve a IDENTIDADE VISUAL medida do site clonado: tema, cores com seus papéis (fundo, texto, destaque, superfícies), fontes, estilo dos botões e cartões, ritmo de espaçamento e a paleta completa. É a mesma que veio na primeira mensagem. Tudo que você criar ou mudar deve usar esses valores.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'find_widgets',
    description: 'Lista os carrosséis e sliders da página (por exemplo depoimentos que trocam sozinhos) com o id do contêiner, quantos slides têm e o estado: parado, empilhado, já animado. O site clonado perdeu os scripts originais, então a maioria está parada. A lista inicial também vem na primeira mensagem.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'make_carousel',
    description: 'Faz um carrossel FUNCIONAR sem JavaScript: troca de slide automática (crossfade), pausa quando o mouse está em cima e bolinhas clicáveis, usando a identidade do site. Aponte o contêiner cujos filhos são os slides (o id vem de find_widgets). Chamar de novo no mesmo contêiner refaz com as novas opções. NÃO escreva keyframes à mão para isso. Depois chame check_motion.',
    parameters: {
      type: 'object',
      properties: {
        container_id: { type: 'string', description: 'id do contêiner dos slides (de find_widgets)' },
        interval_s: { type: 'number', description: 'segundos por slide, de 2 a 15 (padrão 5)' },
        dots: { type: 'boolean', description: 'bolinhas clicáveis embaixo (padrão true)' },
        pause_on_hover: { type: 'boolean', description: 'pausa com o mouse em cima (padrão true)' },
        label,
      },
      required: ['container_id'],
    },
  },
  {
    name: 'check_motion',
    description: 'Observa um carrossel no tempo, como um visitante: quais slides aparecem, amostra por amostra, e diz se ele gira, está parado ou está empilhado. É a única prova de que um carrossel funciona. "seconds" deve cobrir pelo menos um intervalo de troca (padrão: intervalo + 1,5s).',
    parameters: { type: 'object', properties: { container_id: { type: 'string' }, seconds: { type: 'number', description: 'de 2 a 10' } }, required: ['container_id'] },
  },
  {
    name: 'get_original_html',
    description: 'Lê o HTML de como a SEÇÃO era no site original, no momento da clonagem (antes de qualquer edição). Use para entender o visual, as classes e a estrutura que devem ser mantidos, e para ver o que foi estragado. Aponte qualquer elemento: vale a seção em que ele está.',
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'id de qualquer elemento da seção' }, around: { type: 'string', description: 'trecho a procurar (uma classe, ex. "tdots", ou um texto): devolve o HTML ao redor dele. Use quando a seção for grande.' }, max_chars: { type: 'integer', description: 'padrão 6000, máximo 12000' } }, required: ['id'] },
  },
  {
    name: 'restore_original_block',
    description: 'Devolve a SEÇÃO inteira ao visual e à estrutura do site original (como foi clonada), descartando as edições feitas nela. Use quando a seção perdeu a cara do site (cartão sem borda, botões ou fonte diferentes, fileira virou coluna) ANTES de aplicar o pedido por cima. Pode ser desfeito com undo_last_change.',
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'id de qualquer elemento da seção' }, label }, required: ['id'] },
  },
  {
    name: 'restore_original_page',
    description: 'Devolve a PÁGINA INTEIRA ao site original como foi clonada: todas as seções e o CSS voltam ao que eram, descartando TODAS as edições feitas na página (inclusive as do usuário). Use SÓ quando o usuário pediu para voltar ao original, ou quando a identidade do site traz um ATENÇÃO dizendo que a página atual está ilegível/quebrada por edições anteriores. Depois aplique o pedido por cima. Pode ser desfeito com undo_last_change.',
    parameters: { type: 'object', properties: { label }, required: [] },
  },
  {
    name: 'get_design_skill',
    description: 'Lê skills de frontend: regras práticas de design (carrossel, cartões e depoimentos, topo, botões, FAQ, preços, formulário, responsivo, tipografia, cores, espaçamento, animações, fidelidade ao original). Sem "names" lista as disponíveis. As mais relevantes ao pedido já vêm na primeira mensagem.',
    parameters: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' }, description: 'ids das skills (até 4)' } } },
  },
  {
    name: 'check_page',
    description: 'Verifica a página: erros de JavaScript, rolagem horizontal (elementos que passam da largura), texto ilegível (contraste), imagens quebradas e seções novas vazias. Use "viewport" para checar também no celular ou no tablet. Chame SEMPRE depois de alterar a página e corrija o que aparecer.',
    parameters: { type: 'object', properties: { viewport: { type: 'string', enum: ['desktop', 'tablet', 'mobile'] } } },
  },
  {
    name: 'undo_last_change',
    description: 'Desfaz a última ferramenta que alterou a página nesta tarefa (por exemplo, quando o resultado ficou pior). Pode ser chamada várias vezes.',
    parameters: { type: 'object', properties: {} },
  },
]

function themeJsonSchema() {
  return {
    type: 'object',
    properties: {
      mood: { type: 'string', enum: ['dark', 'light'], description: 'dark: fundo escuro e texto claro; light: o contrário. Omita para manter.' },
      accent: { type: 'string', description: 'cor de destaque dos botões e links, hex de 6 dígitos' },
      background: { type: 'string', description: 'fundo da página, hex de 6 dígitos' },
      radius: { type: 'number', description: 'arredondamento em px (0 a 40)' },
      shadow: { type: 'string', enum: ['none', 'soft', 'strong'] },
      density: { type: 'string', enum: ['compact', 'normal', 'airy'] },
      font: { type: 'string', enum: ['sans', 'serif', 'mono'] },
      headingWeight: { type: 'integer', description: '400 a 900' },
      buttons: { type: 'string', enum: ['solid', 'outline', 'pill'] },
    },
  }
}

export const TOOL_NAMES = new Set(AGENT_TOOLS.map(t => t.name))

/** Input checks for the tools that carry structured data (the rest is checked where it is used). */
export const ThemeInput = ThemeSchema
export const WHERE_VALUES = WHERE_PAGE
