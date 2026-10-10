'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const FAQS = [
  {
    q: 'Preciso saber programar para usar?',
    a: 'Não precisa. Você cola o link, a gente clona a estrutura real (HTML, CSS, imagens, vídeos) e entrega tudo pronto pra você editar arrastando e clicando.',
  },
  {
    q: 'O clone fica idêntico à página original?',
    a: 'Fica. A gente captura o DOM e o CSS real, do jeito que o navegador mostra, não uma recriação chutada por IA. Cor, fonte, espaço e imagem saem exatamente como no original.',
  },
  {
    q: 'Depois de clonar, eu consigo editar a página?',
    a: 'Consegue. Tem um editor visual completo: arrasta blocos novos, muda texto, cor, link, layout. A página é sua e o controle também.',
  },
  {
    q: 'O que acontece com imagens, vídeos e fontes?',
    a: 'Tudo é baixado e guardado na nossa própria infraestrutura. Seu clone não fica dependendo do site original continuar no ar.',
  },
  {
    q: 'Consigo clonar um funil inteiro, com várias etapas?',
    a: 'Consegue. A gente percorre o funil, captura cada etapa (páginas, quizzes, botões que aparecem com atraso ou conforme o vídeo) e entrega tudo ligado e editável. A grande maioria das páginas de vendas e landing pages funciona bem. Sites que bloqueiam acesso automático podem falhar, e você pode nos avisar pelo painel.',
  },
  {
    q: 'Como funciona a IA do editor?',
    a: 'Você escreve o que quer em português, por exemplo "deixe essa seção mais moderna", e o assistente altera a página de verdade. Dá para desfazer com um clique. Cada plano inclui créditos de IA por mês, e você acompanha quantos restam dentro do próprio editor.',
  },
  {
    q: 'Dá para medir os resultados e usar meus pixels?',
    a: 'Dá. Cada página publicada tem métricas de visitas, origem, cliques, rolagem, vídeo, mapas de calor, gravações e testes A/B. E você conecta Meta, Google Analytics, Google Ads, TikTok ou Tag Manager na aba Pixels e Eventos, que mostra se cada evento saiu de verdade (recurso dos planos pagos).',
  },
  {
    q: 'Como publico a página?',
    a: 'Num clique. A publicação congela a versão que está no ar, então você pode seguir editando sem mexer no site publicado. Quando quiser atualizar, publica de novo, e se precisar pode tirar do ar a qualquer momento.',
  },
  {
    q: 'A página funciona bem no celular?',
    a: 'Sim. A gente confere a versão de celular durante a clonagem, e no editor você alterna entre computador e celular, ajusta cada um e escolhe o que mostrar em cada aparelho.',
  },
  {
    q: 'Meus dados ficam isolados dos de outras contas?',
    a: 'Ficam. Cada conta tem seu próprio espaço, seus projetos e seus dados, sem misturar com o de mais ninguém.',
  },
]

export function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div className="mx-auto max-w-2xl divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.02]">
      {FAQS.map((item, i) => (
        <div key={item.q}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-white"
          >
            {item.q}
            <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open === i ? 'rotate-180' : ''}`} />
          </button>
          {open === i && (
            <p className="px-5 pb-4 text-sm leading-relaxed text-gray-400">{item.a}</p>
          )}
        </div>
      ))}
    </div>
  )
}
