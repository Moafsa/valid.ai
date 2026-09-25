/**
 * Starter sections for "criar nova seção" in the visual editor. Plain
 * Tailwind HTML — no build step needed since the canvas iframe loads the
 * Tailwind CDN script at runtime, same as AI-generated section HTML.
 */
export interface StarterBlock {
  id: string
  label: string
  content: string
}

export const STARTER_BLOCKS: StarterBlock[] = [
  {
    id: 'starter-hero',
    label: 'Hero',
    content: `
      <section class="px-6 py-20 text-center bg-gray-50">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">Seu título principal aqui</h1>
        <p class="text-lg text-gray-600 mb-8 max-w-xl mx-auto">Uma frase de apoio explicando a promessa da sua oferta.</p>
        <a href="#" class="inline-block bg-blue-600 text-white font-semibold px-8 py-3 rounded-lg">Quero começar</a>
      </section>`,
  },
  {
    id: 'starter-benefits',
    label: 'Benefícios',
    content: `
      <section class="px-6 py-16 bg-white">
        <h2 class="text-2xl font-bold text-center text-gray-900 mb-10">Por que escolher?</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div class="text-center"><h3 class="font-semibold text-gray-900 mb-2">Benefício 1</h3><p class="text-sm text-gray-500">Descrição curta do benefício.</p></div>
          <div class="text-center"><h3 class="font-semibold text-gray-900 mb-2">Benefício 2</h3><p class="text-sm text-gray-500">Descrição curta do benefício.</p></div>
          <div class="text-center"><h3 class="font-semibold text-gray-900 mb-2">Benefício 3</h3><p class="text-sm text-gray-500">Descrição curta do benefício.</p></div>
        </div>
      </section>`,
  },
  {
    id: 'starter-testimonial',
    label: 'Depoimento',
    content: `
      <section class="px-6 py-16 bg-gray-50 text-center">
        <p class="text-xl italic text-gray-700 max-w-2xl mx-auto mb-4">"Depoimento de um cliente satisfeito vai aqui."</p>
        <p class="font-semibold text-gray-900">Nome do Cliente</p>
      </section>`,
  },
  {
    id: 'starter-cta',
    label: 'CTA',
    content: `
      <section class="px-6 py-16 bg-blue-600 text-center">
        <h2 class="text-3xl font-bold text-white mb-6">Pronto para começar?</h2>
        <a href="#" class="inline-block bg-white text-blue-600 font-semibold px-8 py-3 rounded-lg">Quero garantir a minha vaga</a>
      </section>`,
  },
  {
    id: 'starter-faq',
    label: 'FAQ',
    content: `
      <section class="px-6 py-16 bg-white max-w-2xl mx-auto">
        <h2 class="text-2xl font-bold text-gray-900 mb-8 text-center">Perguntas frequentes</h2>
        <div class="space-y-4">
          <div><h3 class="font-semibold text-gray-900">Pergunta 1?</h3><p class="text-sm text-gray-500">Resposta da pergunta.</p></div>
          <div><h3 class="font-semibold text-gray-900">Pergunta 2?</h3><p class="text-sm text-gray-500">Resposta da pergunta.</p></div>
        </div>
      </section>`,
  },
  {
    id: 'starter-footer',
    label: 'Footer',
    content: `
      <section class="px-6 py-8 bg-gray-900 text-center">
        <p class="text-sm text-gray-400">© 2026 Sua Empresa. Todos os direitos reservados.</p>
      </section>`,
  },
]
