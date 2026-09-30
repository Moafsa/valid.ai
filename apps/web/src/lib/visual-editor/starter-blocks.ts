/**
 * Pre-built blocks a user can drag onto the canvas — the same idea as
 * ialendaria's block sidebar (Alerta, Depoimentos, Garantia, etc.), a
 * practical subset rather than a 1:1 copy of their full list. Plain HTML +
 * Tailwind utility classes (the canvas already loads the Tailwind CDN
 * script, same as the published page), neutral styling so it doesn't fight
 * whatever the rest of a cloned page already looks like.
 */
export const STARTER_BLOCKS = [
  {
    id: 'titulo',
    label: 'Título',
    content: `<section style="padding:32px 24px;text-align:center;">
      <h2 style="font-size:32px;font-weight:800;color:#111827;">Seu título aqui</h2>
    </section>`,
  },
  {
    id: 'texto',
    label: 'Texto',
    content: `<section style="padding:16px 24px;max-width:640px;margin:0 auto;">
      <p style="font-size:16px;line-height:1.6;color:#374151;">Escreva seu texto aqui. Clique duas vezes para editar.</p>
    </section>`,
  },
  {
    id: 'botao',
    label: 'Botão',
    content: `<section style="padding:16px 24px;text-align:center;">
      <a href="#" style="display:inline-block;background:#7c3aed;color:#fff;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;">Clique aqui</a>
    </section>`,
  },
  {
    id: 'imagem',
    label: 'Imagem',
    content: `<section style="padding:16px 24px;">
      <img src="https://placehold.co/800x400?text=Sua+imagem" alt="" style="width:100%;border-radius:12px;display:block;" />
    </section>`,
  },
  {
    id: 'espaco',
    label: 'Espaço',
    content: `<div style="height:48px;"></div>`,
  },
  {
    id: 'alerta',
    label: 'Alerta',
    content: `<section style="padding:14px 20px;background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;margin:16px 24px;text-align:center;">
      <p style="color:#92400e;font-weight:600;font-size:14px;">⚠️ Sua mensagem de alerta aqui</p>
    </section>`,
  },
  {
    id: 'beneficios',
    label: 'Benefícios',
    content: `<section style="padding:32px 24px;">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:900px;margin:0 auto;">
        <div style="text-align:center;">
          <div style="font-size:28px;margin-bottom:8px;">✅</div>
          <h3 style="font-weight:700;color:#111827;margin-bottom:4px;">Benefício 1</h3>
          <p style="font-size:14px;color:#6b7280;">Descrição breve do benefício.</p>
        </div>
        <div style="text-align:center;">
          <div style="font-size:28px;margin-bottom:8px;">✅</div>
          <h3 style="font-weight:700;color:#111827;margin-bottom:4px;">Benefício 2</h3>
          <p style="font-size:14px;color:#6b7280;">Descrição breve do benefício.</p>
        </div>
        <div style="text-align:center;">
          <div style="font-size:28px;margin-bottom:8px;">✅</div>
          <h3 style="font-weight:700;color:#111827;margin-bottom:4px;">Benefício 3</h3>
          <p style="font-size:14px;color:#6b7280;">Descrição breve do benefício.</p>
        </div>
      </div>
    </section>`,
  },
  {
    id: 'depoimentos',
    label: 'Depoimentos',
    content: `<section style="padding:32px 24px;background:#f9fafb;">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 1px 6px rgba(0,0,0,.08);text-align:center;">
        <p style="font-size:15px;color:#374151;font-style:italic;margin-bottom:14px;">"Depoimento incrível de um cliente satisfeito vai aqui."</p>
        <p style="font-weight:700;color:#111827;font-size:14px;">Nome do Cliente</p>
      </div>
    </section>`,
  },
  {
    id: 'garantia',
    label: 'Garantia',
    content: `<section style="padding:32px 24px;text-align:center;background:#ecfdf5;">
      <div style="font-size:40px;margin-bottom:8px;">🛡️</div>
      <h3 style="font-weight:800;color:#065f46;font-size:20px;margin-bottom:6px;">Garantia de 7 dias</h3>
      <p style="font-size:14px;color:#047857;max-width:440px;margin:0 auto;">Se não gostar, devolvemos seu dinheiro sem perguntas.</p>
    </section>`,
  },
  {
    id: 'preco',
    label: 'Preço',
    content: `<section style="padding:32px 24px;text-align:center;">
      <div style="max-width:320px;margin:0 auto;border:2px solid #7c3aed;border-radius:16px;padding:28px;">
        <p style="font-size:13px;font-weight:700;color:#7c3aed;text-transform:uppercase;">Oferta especial</p>
        <p style="font-size:40px;font-weight:800;color:#111827;margin:8px 0;">R$ 97</p>
        <a href="#" style="display:block;background:#7c3aed;color:#fff;font-weight:700;padding:12px;border-radius:10px;text-decoration:none;margin-top:16px;">Quero aproveitar</a>
      </div>
    </section>`,
  },
  {
    id: 'contagem',
    label: 'Contagem regressiva',
    content: `<section style="padding:24px;text-align:center;background:#111827;">
      <p style="color:#f3f4f6;font-size:13px;font-weight:600;margin-bottom:10px;">A oferta acaba em:</p>
      <div style="display:flex;justify-content:center;gap:12px;">
        <div style="background:#1f2937;border-radius:8px;padding:10px 14px;"><span style="color:#fff;font-size:22px;font-weight:800;">12</span><p style="color:#9ca3af;font-size:10px;">HORAS</p></div>
        <div style="background:#1f2937;border-radius:8px;padding:10px 14px;"><span style="color:#fff;font-size:22px;font-weight:800;">45</span><p style="color:#9ca3af;font-size:10px;">MIN</p></div>
        <div style="background:#1f2937;border-radius:8px;padding:10px 14px;"><span style="color:#fff;font-size:22px;font-weight:800;">30</span><p style="color:#9ca3af;font-size:10px;">SEG</p></div>
      </div>
    </section>`,
  },
  {
    id: 'faq',
    label: 'Perguntas frequentes',
    content: `<section style="padding:32px 24px;max-width:600px;margin:0 auto;">
      <h3 style="font-weight:800;font-size:22px;color:#111827;margin-bottom:16px;text-align:center;">Perguntas frequentes</h3>
      <div style="border-top:1px solid #e5e7eb;padding:14px 0;">
        <p style="font-weight:700;color:#111827;margin-bottom:4px;">Pergunta 1?</p>
        <p style="font-size:14px;color:#6b7280;">Resposta da pergunta 1.</p>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding:14px 0;">
        <p style="font-weight:700;color:#111827;margin-bottom:4px;">Pergunta 2?</p>
        <p style="font-size:14px;color:#6b7280;">Resposta da pergunta 2.</p>
      </div>
    </section>`,
  },
]
