/**
 * The element library of the visual editor: ready-made blocks a person drags (or clicks) onto the page.
 *
 * Plain HTML with inline styles only, so a block looks the same inside any cloned page (a clone carries
 * its own CSS and has no utility-class framework). Colors are neutral (graphite + one blue accent) and the
 * font is inherited from the page, so a new block does not fight the design around it. Grids use
 * auto-fit columns: they stack on a phone without needing media queries.
 *
 * `category` groups the cards in the library; `keywords` feed the search box.
 */

// One consistent outline icon set (stroke = currentColor, so it follows the card's text color).
const icon = (paths: string) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`

export interface StarterBlock {
  id: string
  label: string
  category: string
  media: string
  keywords?: string
  content: string
}

export const BLOCK_CATEGORIES = ['Básico', 'Seções', 'Conversão', 'Mídia'] as const

const INK = '#111827'
const MUTED = '#6b7280'
const LINE = '#e5e7eb'
const SOFT = '#f9fafb'
const ACCENT = '#2563eb'
const font = 'font-family:inherit;'

const btn = (label: string, extra = '') =>
  `<a href="#" style="display:inline-block;background:${INK};color:#fff;font-weight:600;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;${font}${extra}">${label}</a>`

export const STARTER_BLOCKS: StarterBlock[] = [
  // ── Básico ───────────────────────────────────────────────────────────────
  {
    id: 'titulo', label: 'Título', category: 'Básico', keywords: 'heading h1 h2 cabeçalho',
    media: icon('<path d="M5 5v14M19 5v14M5 12h14"/>'),
    content: `<section style="padding:32px 24px;text-align:center;${font}"><h2 style="margin:0;font-size:34px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:${INK};">Seu título aqui</h2></section>`,
  },
  {
    id: 'subtitulo', label: 'Título e subtítulo', category: 'Básico', keywords: 'heading subtitle chamada',
    media: icon('<path d="M4 7h16M4 12h10M4 17h13"/>'),
    content: `<section style="padding:32px 24px;text-align:center;max-width:720px;margin:0 auto;${font}"><h2 style="margin:0 0 12px;font-size:34px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:${INK};">Uma frase que chama atenção</h2><p style="margin:0;font-size:18px;line-height:1.6;color:${MUTED};">Explique em uma ou duas linhas por que isso importa pra quem está lendo.</p></section>`,
  },
  {
    id: 'texto', label: 'Texto', category: 'Básico', keywords: 'paragraph parágrafo',
    media: icon('<path d="M4 6h16M4 11h16M4 16h10"/>'),
    content: `<section style="padding:16px 24px;max-width:680px;margin:0 auto;${font}"><p style="margin:0;font-size:17px;line-height:1.7;color:#374151;">Escreva seu texto aqui. Clique duas vezes para editar.</p></section>`,
  },
  {
    id: 'botao', label: 'Botão', category: 'Básico', keywords: 'button cta link',
    media: icon('<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M9 12h6"/>'),
    content: `<section style="padding:20px 24px;text-align:center;">${btn('Quero começar agora')}</section>`,
  },
  {
    id: 'imagem', label: 'Imagem', category: 'Básico', keywords: 'image foto picture',
    media: icon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 20"/>'),
    content: `<section style="padding:16px 24px;max-width:960px;margin:0 auto;"><img src="https://placehold.co/960x480/f3f4f6/9ca3af?text=Sua+imagem" alt="" style="width:100%;height:auto;border-radius:16px;display:block;" /></section>`,
  },
  {
    id: 'divisor', label: 'Divisor', category: 'Básico', keywords: 'divider linha hr',
    media: icon('<path d="M4 12h16"/>'),
    content: `<section style="padding:12px 24px;max-width:960px;margin:0 auto;"><hr style="border:0;border-top:1px solid ${LINE};margin:0;" /></section>`,
  },
  {
    id: 'espaco', label: 'Espaço', category: 'Básico', keywords: 'spacer espaçamento',
    media: icon('<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>'),
    content: `<div style="height:56px;"></div>`,
  },
  {
    id: 'lista', label: 'Lista com ícones', category: 'Básico', keywords: 'list checklist itens',
    media: icon('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
    content: `<section style="padding:24px;max-width:560px;margin:0 auto;${font}">${['Primeiro ponto importante', 'Segundo ponto importante', 'Terceiro ponto importante']
      .map(t => `<div style="display:flex;gap:12px;align-items:flex-start;padding:8px 0;"><span style="flex:none;width:22px;height:22px;border-radius:50%;background:#dcfce7;color:#16a34a;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">✓</span><span style="font-size:16px;line-height:1.5;color:#374151;">${t}</span></div>`)
      .join('')}</section>`,
  },
  {
    id: 'citacao', label: 'Citação', category: 'Básico', keywords: 'quote destaque',
    media: icon('<path d="M7 8c-2 0-3 1.5-3 3.5S5 15 7 15v3l3-3c2 0 3-1.5 3-3.5S9 8 7 8zM17 8c-2 0-3 1.5-3 3.5s1 3.5 3 3.5v3l3-3c2 0 3-1.5 3-3.5S19 8 17 8z"/>'),
    content: `<section style="padding:32px 24px;max-width:680px;margin:0 auto;${font}"><blockquote style="margin:0;padding:4px 0 4px 20px;border-left:3px solid ${INK};font-size:22px;line-height:1.5;font-weight:500;color:${INK};">“Uma frase marcante que resume a ideia da página.”</blockquote></section>`,
  },

  // ── Seções ───────────────────────────────────────────────────────────────
  {
    id: 'hero', label: 'Topo (hero)', category: 'Seções', keywords: 'hero banner capa principal',
    media: icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 10h10M7 14h6"/>'),
    content: `<section style="padding:72px 24px;text-align:center;background:${SOFT};${font}"><div style="max-width:760px;margin:0 auto;"><p style="margin:0 0 14px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${ACCENT};">Novidade</p><h1 style="margin:0 0 16px;font-size:48px;line-height:1.08;font-weight:800;letter-spacing:-0.03em;color:${INK};">A promessa principal da sua página, em uma frase</h1><p style="margin:0 0 28px;font-size:19px;line-height:1.6;color:${MUTED};">Um complemento curto que explica pra quem é e o que a pessoa ganha.</p>${btn('Quero começar agora')}</div></section>`,
  },
  {
    id: 'beneficios', label: 'Benefícios', category: 'Seções', keywords: 'benefits vantagens colunas',
    media: icon('<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>'),
    content: `<section style="padding:48px 24px;${font}"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px;max-width:960px;margin:0 auto;">${[1, 2, 3]
      .map(n => `<div style="text-align:center;padding:8px;"><div style="width:48px;height:48px;margin:0 auto 14px;border-radius:14px;background:#eff6ff;color:${ACCENT};display:flex;align-items:center;justify-content:center;font-size:22px;">✓</div><h3 style="margin:0 0 6px;font-size:18px;font-weight:700;color:${INK};">Benefício ${n}</h3><p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">Descrição curta do que a pessoa ganha com isso.</p></div>`)
      .join('')}</div></section>`,
  },
  {
    id: 'recursos', label: 'Recursos em cartões', category: 'Seções', keywords: 'features cards grid',
    media: icon('<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>'),
    content: `<section style="padding:48px 24px;${font}"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;max-width:960px;margin:0 auto;">${['Rápido', 'Simples', 'Seguro', 'Completo']
      .map(t => `<div style="padding:24px;border:1px solid ${LINE};border-radius:16px;background:#fff;"><h3 style="margin:0 0 6px;font-size:17px;font-weight:700;color:${INK};">${t}</h3><p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">Explique em uma linha como isso ajuda no dia a dia.</p></div>`)
      .join('')}</div></section>`,
  },
  {
    id: 'passos', label: 'Passo a passo', category: 'Seções', keywords: 'steps como funciona etapas',
    media: icon('<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M6 8.5v7M11 7h9M11 17h9"/>'),
    content: `<section style="padding:48px 24px;max-width:720px;margin:0 auto;${font}"><h2 style="margin:0 0 24px;text-align:center;font-size:28px;font-weight:800;letter-spacing:-0.02em;color:${INK};">Como funciona</h2>${['Faça seu cadastro', 'Escolha o que precisa', 'Receba o resultado']
      .map((t, i) => `<div style="display:flex;gap:16px;padding:14px 0;border-top:1px solid ${LINE};"><span style="flex:none;width:34px;height:34px;border-radius:50%;background:${INK};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;">${i + 1}</span><div><p style="margin:0 0 2px;font-size:17px;font-weight:700;color:${INK};">${t}</p><p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">Uma linha explicando esse passo.</p></div></div>`)
      .join('')}</section>`,
  },
  {
    id: 'numeros', label: 'Números', category: 'Seções', keywords: 'stats estatísticas métricas',
    media: icon('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
    content: `<section style="padding:40px 24px;${font}"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;max-width:900px;margin:0 auto;text-align:center;">${[['+10 mil', 'clientes'], ['98%', 'satisfação'], ['24h', 'suporte'], ['15 anos', 'de mercado']]
      .map(([n, l]) => `<div><p style="margin:0;font-size:38px;font-weight:800;letter-spacing:-0.02em;color:${INK};">${n}</p><p style="margin:4px 0 0;font-size:14px;color:${MUTED};">${l}</p></div>`)
      .join('')}</div></section>`,
  },
  {
    id: 'depoimentos', label: 'Depoimentos', category: 'Seções', keywords: 'testimonials reviews avaliações clientes',
    media: icon('<path d="M7 8c-2 0-3 1.5-3 3.5S5 15 7 15v3l3-3c2 0 3-1.5 3-3.5S9 8 7 8z"/><path d="M17 8c-2 0-3 1.5-3 3.5s1 3.5 3 3.5v3l3-3c2 0 3-1.5 3-3.5S19 8 17 8z"/>'),
    content: `<section style="padding:48px 24px;background:${SOFT};${font}"><h2 style="margin:0 0 28px;text-align:center;font-size:28px;font-weight:800;letter-spacing:-0.02em;color:${INK};">O que dizem nossos clientes</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;max-width:960px;margin:0 auto;">${[['Mariana S.', 'Mudou a forma como eu trabalho. Recomendo de olhos fechados.'], ['Carlos P.', 'Simples de usar e o resultado apareceu já na primeira semana.'], ['Ana L.', 'Atendimento excelente e entrega acima do que eu esperava.']]
      .map(([n, t]) => `<div style="background:#fff;border:1px solid ${LINE};border-radius:16px;padding:22px;"><p style="margin:0 0 6px;color:#f59e0b;letter-spacing:2px;">★★★★★</p><p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">“${t}”</p><p style="margin:0;font-size:14px;font-weight:700;color:${INK};">${n}</p></div>`)
      .join('')}</div></section>`,
  },
  {
    id: 'logos', label: 'Logos de clientes', category: 'Seções', keywords: 'brands marcas parceiros clientes',
    media: icon('<rect x="3" y="8" width="5" height="8" rx="1"/><rect x="10" y="8" width="5" height="8" rx="1"/><rect x="17" y="8" width="4" height="8" rx="1"/>'),
    content: `<section style="padding:32px 24px;text-align:center;${font}"><p style="margin:0 0 16px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;">Quem já usa</p><div style="display:flex;flex-wrap:wrap;gap:12px 36px;justify-content:center;max-width:860px;margin:0 auto;">${['Marca 1', 'Marca 2', 'Marca 3', 'Marca 4', 'Marca 5']
      .map(t => `<span style="font-size:20px;font-weight:800;color:#c4c8d0;letter-spacing:-0.01em;">${t}</span>`)
      .join('')}</div></section>`,
  },
  {
    id: 'sobre', label: 'Sobre (imagem e texto)', category: 'Seções', keywords: 'about autor equipe quem somos duas colunas',
    media: icon('<rect x="3" y="5" width="8" height="14" rx="2"/><path d="M14 8h7M14 12h7M14 16h5"/>'),
    content: `<section style="padding:48px 24px;${font}"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:32px;align-items:center;max-width:960px;margin:0 auto;"><img src="https://placehold.co/600x480/f3f4f6/9ca3af?text=Foto" alt="" style="width:100%;height:auto;border-radius:20px;display:block;" /><div><h2 style="margin:0 0 12px;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:${INK};">Quem está por trás</h2><p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:${MUTED};">Conte em poucas linhas a sua história e por que as pessoas podem confiar em você.</p>${btn('Saiba mais')}</div></div></section>`,
  },
  {
    id: 'cta', label: 'Chamada final', category: 'Seções', keywords: 'call to action fechamento banner',
    media: icon('<path d="M4 12h12M12 6l6 6-6 6"/>'),
    content: `<section style="padding:56px 24px;text-align:center;background:${INK};${font}"><h2 style="margin:0 0 10px;font-size:32px;font-weight:800;letter-spacing:-0.02em;color:#fff;">Pronto para começar?</h2><p style="margin:0 0 24px;font-size:17px;color:#d1d5db;">Garanta sua vaga hoje e comece ainda esta semana.</p><a href="#" style="display:inline-block;background:#fff;color:${INK};font-weight:700;font-size:15px;padding:14px 30px;border-radius:12px;text-decoration:none;">Quero participar</a></section>`,
  },
  {
    id: 'cabecalho', label: 'Cabeçalho', category: 'Seções', keywords: 'header menu navbar topo logo',
    media: icon('<rect x="3" y="4" width="18" height="6" rx="2"/><path d="M7 7h2M12 7h2"/>'),
    content: `<header style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px;border-bottom:1px solid ${LINE};background:#fff;${font}"><span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${INK};">Sua marca</span><nav style="display:flex;gap:22px;font-size:15px;"><a href="#" style="color:#374151;text-decoration:none;">Início</a><a href="#" style="color:#374151;text-decoration:none;">Sobre</a><a href="#" style="color:#374151;text-decoration:none;">Contato</a></nav>${btn('Começar', 'padding:10px 20px;font-size:14px;')}</header>`,
  },
  {
    id: 'rodape', label: 'Rodapé', category: 'Seções', keywords: 'footer final copyright',
    media: icon('<rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 17h4"/>'),
    content: `<footer style="padding:32px 24px;text-align:center;border-top:1px solid ${LINE};background:${SOFT};${font}"><p style="margin:0 0 6px;font-size:15px;font-weight:700;color:${INK};">Sua marca</p><p style="margin:0;font-size:13px;color:#9ca3af;">© 2026 Todos os direitos reservados · Política de privacidade · Termos de uso</p></footer>`,
  },

  // ── Conversão ────────────────────────────────────────────────────────────
  {
    id: 'preco', label: 'Preço', category: 'Conversão', keywords: 'price oferta valor plano',
    media: icon('<path d="M12 3H4v8l10 10 8-8L12 3z"/><circle cx="8" cy="7" r="1.5"/>'),
    content: `<section style="padding:40px 24px;text-align:center;${font}"><div style="max-width:340px;margin:0 auto;border:1px solid ${LINE};border-radius:20px;padding:32px;box-shadow:0 12px 32px rgba(17,24,39,.08);"><p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${ACCENT};">Oferta especial</p><p style="margin:10px 0 2px;font-size:46px;font-weight:800;letter-spacing:-0.03em;color:${INK};">R$ 97</p><p style="margin:0 0 20px;font-size:14px;color:${MUTED};">pagamento único</p>${btn('Quero aproveitar', 'display:block;')}</div></section>`,
  },
  {
    id: 'planos', label: 'Planos (3 colunas)', category: 'Conversão', keywords: 'pricing planos tabela assinatura',
    media: icon('<rect x="3" y="6" width="5" height="12" rx="1.5"/><rect x="9.5" y="4" width="5" height="16" rx="1.5"/><rect x="16" y="6" width="5" height="12" rx="1.5"/>'),
    content: `<section style="padding:48px 24px;${font}"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;max-width:960px;margin:0 auto;">${[['Básico', 'R$ 47', false], ['Pro', 'R$ 97', true], ['Completo', 'R$ 197', false]]
      .map(([n, p, hot]) => `<div style="padding:28px;border-radius:20px;border:${hot ? `2px solid ${INK}` : `1px solid ${LINE}`};background:#fff;${hot ? 'box-shadow:0 14px 36px rgba(17,24,39,.10);' : ''}"><p style="margin:0;font-size:15px;font-weight:700;color:${INK};">${n}</p><p style="margin:8px 0 16px;font-size:36px;font-weight:800;letter-spacing:-0.02em;color:${INK};">${p}<span style="font-size:14px;font-weight:500;color:${MUTED};"> /mês</span></p><p style="margin:0 0 6px;font-size:14px;color:#374151;">✓ Recurso incluído</p><p style="margin:0 0 6px;font-size:14px;color:#374151;">✓ Outro recurso</p><p style="margin:0 0 20px;font-size:14px;color:#374151;">✓ Mais um recurso</p>${btn('Escolher', 'display:block;text-align:center;')}</div>`)
      .join('')}</div></section>`,
  },
  {
    id: 'garantia', label: 'Garantia', category: 'Conversão', keywords: 'guarantee reembolso selo confiança',
    media: icon('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>'),
    content: `<section style="padding:40px 24px;text-align:center;background:#f0fdf4;${font}"><div style="font-size:38px;margin-bottom:8px;">🛡️</div><h3 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#14532d;">Garantia de 7 dias</h3><p style="margin:0 auto;font-size:15px;line-height:1.6;color:#166534;max-width:440px;">Se não gostar, devolvemos o seu dinheiro. Sem perguntas e sem burocracia.</p></section>`,
  },
  {
    id: 'contagem', label: 'Contagem regressiva', category: 'Conversão', keywords: 'countdown timer urgência relógio',
    media: icon('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>'),
    content: `<section style="padding:28px 24px;text-align:center;background:${INK};${font}"><p style="margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#d1d5db;">A oferta termina em</p><div style="display:flex;justify-content:center;gap:12px;">${[['12', 'horas'], ['45', 'min'], ['30', 'seg']]
      .map(([n, l]) => `<div style="background:#1f2937;border-radius:12px;padding:12px 18px;min-width:64px;"><span style="color:#fff;font-size:28px;font-weight:800;">${n}</span><p style="margin:2px 0 0;color:#9ca3af;font-size:11px;text-transform:uppercase;">${l}</p></div>`)
      .join('')}</div></section>`,
  },
  {
    id: 'alerta', label: 'Faixa de aviso', category: 'Conversão', keywords: 'alert barra topo aviso promoção',
    media: icon('<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 17h.01"/>'),
    content: `<section style="padding:12px 20px;background:#fffbeb;border-bottom:1px solid #fde68a;text-align:center;${font}"><p style="margin:0;font-size:14px;font-weight:600;color:#92400e;">Últimas vagas com desconto: garanta a sua hoje</p></section>`,
  },
  {
    id: 'formulario', label: 'Formulário de contato', category: 'Conversão', keywords: 'form lead captura email cadastro',
    media: icon('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>'),
    content: `<section style="padding:48px 24px;${font}"><form style="max-width:420px;margin:0 auto;display:grid;gap:12px;padding:28px;border:1px solid ${LINE};border-radius:20px;background:#fff;"><h3 style="margin:0 0 4px;font-size:22px;font-weight:800;color:${INK};">Receba novidades</h3><input type="text" name="nome" placeholder="Seu nome" style="padding:13px 14px;border:1px solid #d1d5db;border-radius:12px;font-size:15px;font-family:inherit;" /><input type="email" name="email" placeholder="Seu melhor e-mail" style="padding:13px 14px;border:1px solid #d1d5db;border-radius:12px;font-size:15px;font-family:inherit;" /><input type="tel" name="telefone" placeholder="WhatsApp" style="padding:13px 14px;border:1px solid #d1d5db;border-radius:12px;font-size:15px;font-family:inherit;" /><button type="submit" style="padding:14px;border:0;border-radius:12px;background:${INK};color:#fff;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit;">Quero receber</button></form></section>`,
  },
  {
    id: 'whatsapp', label: 'Botão de WhatsApp', category: 'Conversão', keywords: 'whatsapp zap contato chat',
    media: icon('<path d="M21 12a9 9 0 1 1-3.6-7.2L21 3l-1.2 3.6A9 9 0 0 1 21 12z"/><path d="M8.5 9.5c.5 2 2 3.5 4 4l1.2-1.2 2 1-.7 1.5c-3 .5-7-3-6.5-6.3z"/>'),
    content: `<section style="padding:20px 24px;text-align:center;"><a href="https://wa.me/5500000000000" style="display:inline-flex;align-items:center;gap:10px;background:#16a34a;color:#fff;font-weight:700;font-size:16px;padding:14px 26px;border-radius:999px;text-decoration:none;${font}">💬 Falar no WhatsApp</a></section>`,
  },
  {
    id: 'faq', label: 'Perguntas frequentes', category: 'Conversão', keywords: 'faq dúvidas perguntas respostas',
    media: icon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .8-1 1.7M12 17h.01"/>'),
    content: `<section style="padding:48px 24px;max-width:680px;margin:0 auto;${font}"><h2 style="margin:0 0 20px;text-align:center;font-size:28px;font-weight:800;letter-spacing:-0.02em;color:${INK};">Perguntas frequentes</h2>${['Como funciona?', 'Em quanto tempo vejo resultado?', 'Posso cancelar quando quiser?']
      .map(q => `<div style="border-top:1px solid ${LINE};padding:16px 0;"><p style="margin:0 0 6px;font-size:16px;font-weight:700;color:${INK};">${q}</p><p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">Escreva aqui a resposta, de forma direta e sem enrolação.</p></div>`)
      .join('')}</section>`,
  },
  {
    id: 'bonus', label: 'Bônus', category: 'Conversão', keywords: 'bonus presente brinde extra',
    media: icon('<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8v12M3 12h18M12 8c-2-4-6-3-5 0 1 1 5 0 5 0zM12 8c2-4 6-3 5 0-1 1-5 0-5 0z"/>'),
    content: `<section style="padding:40px 24px;${font}"><div style="max-width:720px;margin:0 auto;padding:24px;border:2px dashed #d1d5db;border-radius:20px;display:flex;gap:18px;align-items:center;flex-wrap:wrap;"><div style="font-size:40px;">🎁</div><div style="flex:1;min-width:220px;"><p style="margin:0 0 2px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${ACCENT};">Bônus exclusivo</p><p style="margin:0 0 4px;font-size:18px;font-weight:800;color:${INK};">Nome do seu bônus</p><p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">Uma frase dizendo o que a pessoa leva a mais ao comprar hoje.</p></div></div></section>`,
  },

  // ── Mídia ────────────────────────────────────────────────────────────────
  {
    id: 'video', label: 'Vídeo', category: 'Mídia', keywords: 'video player youtube vsl',
    media: icon('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5l5 2.5-5 2.5v-5z"/>'),
    content: `<section style="padding:24px;max-width:860px;margin:0 auto;"><div data-vai-player='{"embed":"https://www.youtube.com/embed/dQw4w9WgXcQ","start":"click","bar":"none","pause":"free","resume":false,"ratio":56.25}' style="position:relative;display:block;height:0;padding-top:56.25%;overflow:hidden;background:#000;border-radius:16px;"></div></section>`,
  },
  {
    id: 'galeria', label: 'Galeria de imagens', category: 'Mídia', keywords: 'gallery fotos grade portfólio',
    media: icon('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>'),
    content: `<section style="padding:32px 24px;"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;max-width:960px;margin:0 auto;">${[1, 2, 3, 4, 5, 6]
      .map(n => `<img src="https://placehold.co/480x360/f3f4f6/9ca3af?text=${n}" alt="" style="width:100%;height:auto;border-radius:12px;display:block;" />`)
      .join('')}</div></section>`,
  },
  {
    id: 'mapa', label: 'Mapa', category: 'Mídia', keywords: 'map localização endereço google',
    media: icon('<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    content: `<section style="padding:24px;max-width:960px;margin:0 auto;"><iframe src="https://www.google.com/maps?q=Avenida+Paulista,+S%C3%A3o+Paulo&output=embed" style="width:100%;height:340px;border:0;border-radius:16px;display:block;" loading="lazy"></iframe></section>`,
  },
]
