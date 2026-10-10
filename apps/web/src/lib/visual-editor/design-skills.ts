/**
 * Frontend "skills" for the editor's AI: short, practical rules a good front-end designer applies without thinking, written so a
 * model applies them too. The ones that match the request are put in front of the model in its first message; any other can be
 * loaded with get_design_skill. They never override the SITE: the site's own look (from get_site_style and the original) always wins.
 */

export interface DesignSkill { id: string; title: string; when: string; body: string }

export const DESIGN_SKILLS: DesignSkill[] = [
  {
    id: 'fidelidade-ao-original',
    title: 'Fidelidade ao site original',
    when: 'SEMPRE que mexer em algo que já existe, e quando algo "perdeu a cara do site"',
    body: `O site original é a referência de design. Não é preciso inventar nada: já existe um visual pronto.
1. Antes de refazer ou mexer no layout de uma seção, veja como ela era: get_original_html(id).
2. Se a seção atual perdeu o visual do original (cartão sem borda e fundo, botões diferentes, fonte trocada, fileira que virou coluna, etiqueta solta), use restore_original_block(id) e só DEPOIS aplique o pedido por cima. Consertar sem restaurar costuma piorar.
3. Reaproveite as classes e a estrutura do original. Não recrie o visual do zero com estilos inline novos.
4. Preserve posição, orientação e proporção das partes: o que era uma fileira horizontal acima do cartão continua sendo; o que tinha cartão continua tendo cartão.
5. Só mude cor, fonte, raio ou espaçamento se o pedido pedir. O resultado deve ser indistinguível do original, exceto no que foi pedido.`,
  },
  {
    id: 'carrossel-e-sliders',
    title: 'Carrossel e slider',
    when: 'pedido de carrossel, slider, depoimentos que trocam, "fazer funcionar"',
    body: `- Use SEMPRE make_carousel no contêiner dos slides (find_widgets mostra qual). Não escreva keyframes nem CSS de carrossel.
- Mantenha o desenho original: o cartão do slide, as bolinhas na MESMA posição e orientação (fileira horizontal pequena), as cores do site. make_carousel religa as bolinhas que já existem; se vierem em coluna ou fora de lugar, é sinal de que a seção foi estragada: restore_original_block primeiro.
- Sem bolinhas no original: centralizadas embaixo, 8 a 10px, a ativa na cor de destaque.
- Intervalo de 5 a 7s para ler 1 ou 2 frases; pausa com o mouse em cima; sem setas (precisam de script).
- No celular: um slide por vez, largura total, texto de 15px ou mais. Confira com check_page viewport mobile.
- Só diga que funciona depois de check_motion dizer "gira".`,
  },
  {
    id: 'cartoes-e-depoimentos',
    title: 'Cartões e depoimentos',
    when: 'criar ou mexer em cartão, depoimento, card de recurso, prova social',
    body: `- Um cartão tem: fundo de superfície do site, borda de 1px discreta, raio do site, padding de 20 a 28px, conteúdo com espaçamento uniforme.
- Depoimento: a frase (no estilo do original, geralmente em itálico), o autor em destaque pequeno (caixa alta ou negrito na cor de destaque), cargo/cidade em cor apagada, etiqueta opcional em pílula. Tudo DENTRO do mesmo cartão.
- Linhas de 45 a 70 caracteres; não passe disso.
- Nunca invente pessoas reais, números ou resultados: se for preciso exemplo, escreva texto claramente de exemplo.
- Cartões de uma mesma linha têm a mesma altura e o mesmo padding.`,
  },
  {
    id: 'hero-e-chamadas',
    title: 'Topo (hero) e chamadas',
    when: 'mexer no topo da página, título principal, banner',
    body: `- Hierarquia: um título principal (h1), uma frase de apoio, UM botão principal e no máximo um secundário.
- O botão principal usa exatamente o estilo dos botões do site.
- Título com 2 a 3 linhas no desktop; frase de apoio curta, cor apagada.
- A imagem ou o visual de apoio fica ao lado (desktop) ou embaixo (celular), nunca cobrindo o texto.
- Contraste mínimo de 4.5:1 entre texto e fundo. Se há imagem de fundo, garanta um véu escuro ou claro por trás do texto.`,
  },
  {
    id: 'botoes-e-cta',
    title: 'Botões e chamadas para ação',
    when: 'criar ou alterar botão, CTA, link de ação',
    body: `- Copie o botão principal do site (fundo, texto, raio, peso, padding). Secundário: contorno na cor de destaque, sem fundo.
- Altura mínima de 44px; texto com verbo ("Criar conta", "Quero participar"), curto.
- Um único botão principal por tela; os demais são secundários ou links.
- Estado de hover: leve escurecimento ou elevação, com transição de 150 a 250ms.
- Nunca troque o destino (href) de um botão sem o pedido pedir.`,
  },
  {
    id: 'faq-e-acordeao',
    title: 'Perguntas frequentes e acordeão',
    when: 'FAQ, acordeão, itens que abrem e fecham',
    body: `- Sem JavaScript: use <details><summary> (abre e fecha nativamente). Estilize o summary como o resto do site e gire o ícone com details[open] em CSS.
- Pergunta em destaque, resposta em 1 a 3 frases, cor apagada.
- Separador de 1px discreto entre itens; padding vertical de 16 a 20px; área clicável é a linha inteira.
- Use o texto que já existe na página; não invente perguntas nem respostas sobre preço, prazo ou garantia.`,
  },
  {
    id: 'precos-e-planos',
    title: 'Preços e planos',
    when: 'tabela de preços, planos, assinatura, oferta',
    body: `- Cartões de plano com a mesma altura; o plano recomendado se destaca com borda na cor de destaque e uma etiqueta.
- Preço grande (a maior fonte do cartão), período pequeno ao lado; lista de benefícios com ícone de check; um botão por cartão.
- No celular os cartões empilham, o recomendado primeiro.
- Use SOMENTE os preços e benefícios que o usuário informou ou que já existem. Nunca invente valores.`,
  },
  {
    id: 'formulario-e-captura',
    title: 'Formulário e captura de leads',
    when: 'formulário, campos, cadastro, captura',
    body: `- Cada campo com rótulo visível, altura mínima de 44px, espaçamento de 12 a 16px entre campos.
- Uma coluna no celular; botão de envio largura total, no estilo do botão principal.
- Preserve action, method e names dos campos existentes: o envio depende deles.
- Estado de foco visível (contorno na cor de destaque). Mensagem de privacidade curta embaixo, em cor apagada.`,
  },
  {
    id: 'responsivo-e-mobile',
    title: 'Layout responsivo',
    when: 'qualquer HTML novo, ajuste de layout, pedido sobre celular ou tablet',
    body: `- Larguras com % e max-width, nunca px fixos maiores que a tela. Imagens com max-width:100%.
- Grades com repeat(auto-fit,minmax(240px,1fr)); filhos de flex e grid com min-width:0 para o texto quebrar.
- Tamanhos de fonte com clamp() (ex.: clamp(28px,5vw,48px) para títulos).
- No celular: uma coluna, padding lateral de 16 a 20px, áreas de toque de 44px, ordem natural de leitura.
- Depois de mexer em layout, chame check_page com viewport mobile e corrija o que passar da largura.
- Páginas de FORMATO ANTIGO (a primeira mensagem avisa): o responsivo do original não existe nelas e nenhuma edição o recupera. Diga isso ao usuário e recomende clonar de novo; não prometa nem simule.
- Regras de layout (display, position, largura, colunas) escritas sem @media valem TAMBÉM no celular e sobrepõem o responsivo que a página já tem. check_page avisa quando uma mudança sua deixou o celular diferente do que era: desfaça (undo_last_change) ou limite a regra à tela grande (@media (min-width: 1025px)).
- Mudar uma propriedade de layout na tela Desktop pode quebrar o celular: antes de mudar display, position, largura ou colunas, pergunte-se o que a página faz no celular.`,
  },
  {
    id: 'tipografia-e-hierarquia',
    title: 'Tipografia e hierarquia',
    when: 'trocar texto, tamanho, fonte, título; criar seção com textos',
    body: `- Use as fontes do site (get_site_style). Não adicione outra família.
- Escala de referência: h1 40 a 64px, h2 28 a 40px, h3 20 a 24px, texto 16 a 18px. Siga a proporção que o site já usa.
- Altura de linha: títulos 1.1 a 1.25, texto 1.5 a 1.7. Respeite o espaçamento entre letras do original.
- Contraste de peso entre título e texto (ex.: 800 e 400). Nunca mais de 3 níveis de tamanho numa seção.`,
  },
  {
    id: 'cores-e-contraste',
    title: 'Cores e contraste',
    when: 'mudar cores, tema, escuro/claro, deixar premium ou moderno',
    body: `- Use SÓ a paleta do site. A cor de destaque vale para botões, links e realces (poucos pontos), não para grandes áreas.
- Texto sobre fundo com contraste de pelo menos 4.5:1 (3:1 só para texto grande).
- Tema escuro: as superfícies (cartões) são um pouco mais claras que o fundo da página; tema claro: o contrário, com sombra suave.
- "Premium" e "moderno" se alcançam com espaçamento, tipografia e contraste, não com cores novas.
- Se o pedido pedir uma cor específica, use-a só no que foi pedido e avise que foge da paleta.`,
  },
  {
    id: 'espacamento-e-ritmo',
    title: 'Espaçamento e ritmo',
    when: 'criar seção, ajustar respiro, margens, padding',
    body: `- Siga o padding vertical de seção do site (veja a identidade) e a largura máxima de conteúdo.
- Escala de 8px (8, 16, 24, 32, 48, 64, 96). Itens relacionados ficam mais perto entre si do que de outros grupos.
- Mesmo espaçamento entre cartões da mesma linha; alinhamento à esquerda consistente.
- Seções nunca coladas: o respiro entre seções é no mínimo o padding de uma seção do site.`,
  },
  {
    id: 'animacoes-e-movimento',
    title: 'Animações e movimento',
    when: 'efeitos, animações, aparecer ao rolar, hover',
    body: `- Só CSS (transition, @keyframes). Nunca script.
- Hover e foco: 150 a 250ms; entrada de elementos: 400 a 700ms; nada rápido demais nem em loop chamativo.
- Anime apenas opacity e transform. Respeite @media (prefers-reduced-motion: reduce).
- Autoplay não troca mais rápido que a cada 4s e pausa com o mouse em cima.
- Efeitos que dependem de scroll ou de script do site original não existem mais: avise em vez de simular.`,
  },
]

const KEYWORDS: [RegExp, string[]][] = [
  [/carross|slider|depoiment|testemunho|slide|bolinha|passa sozinho|troca sozinho/i, ['carrossel-e-sliders', 'cartoes-e-depoimentos']],
  [/hero|topo|banner|cabe[cç]alho|t[ií]tulo principal/i, ['hero-e-chamadas', 'tipografia-e-hierarquia']],
  [/bot[aã]o|cta|chamada|link de a[cç][aã]o/i, ['botoes-e-cta']],
  [/faq|pergunta|acorde[aã]o|sanfona|abre e fecha/i, ['faq-e-acordeao']],
  [/pre[cç]o|plano|assinatura|oferta|pacote/i, ['precos-e-planos']],
  [/formul[aá]rio|cadastro|captura|campo|lead|inscri/i, ['formulario-e-captura']],
  [/mobile|celular|responsiv|tablet|telinha/i, ['responsivo-e-mobile']],
  [/fonte|tipografia|letra|tamanho do texto|t[ií]tulo|texto/i, ['tipografia-e-hierarquia']],
  [/cor|cores|tema|escuro|claro|contraste|premium|moderno|bonito/i, ['cores-e-contraste', 'espacamento-e-ritmo']],
  [/espa[cç]|margem|padding|respiro|apertado/i, ['espacamento-e-ritmo']],
  [/anima|movimento|efeito|aparec|hover|transi/i, ['animacoes-e-movimento']],
  [/se[cç][aã]o nova|criar uma se[cç][aã]o|nova se[cç][aã]o|adicione|crie /i, ['responsivo-e-mobile', 'espacamento-e-ritmo']],
]

/** The skills worth putting in front of the model for this request: fidelity always, then up to two that match the words. */
export function pickSkills(instruction: string): DesignSkill[] {
  const ids = ['fidelidade-ao-original']
  for (const [re, list] of KEYWORDS) if (re.test(instruction)) for (const id of list) if (!ids.includes(id)) ids.push(id)
  return ids.slice(0, 3).map(id => DESIGN_SKILLS.find(s => s.id === id)!).filter(Boolean)
}

export const skillIndex = () => DESIGN_SKILLS.map(s => `- ${s.id}: ${s.when}`).join('\n')

export function skillText(names: unknown): string {
  const list = Array.isArray(names) ? names : typeof names === 'string' ? [names] : []
  if (!list.length) return `Skills de frontend disponíveis (peça com names):\n${skillIndex()}`
  const found = list.slice(0, 4).map(n => DESIGN_SKILLS.find(s => s.id === String(n))).filter((s): s is DesignSkill => !!s)
  if (!found.length) return `Nenhuma skill com esse nome. Disponíveis:\n${skillIndex()}`
  return found.map(s => `## ${s.title} (${s.id})\n${s.body}`).join('\n\n')
}
