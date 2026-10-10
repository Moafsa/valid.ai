'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const FAQS = [
  {
    q: 'Preciso saber programar para usar?',
    a: 'Não precisa. Você cola o link, a gente clona a estrutura real (HTML, CSS, imagens, vídeos) e entrega tudo pronto pra você usar.',
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
    q: 'Consigo clonar qualquer página?',
    a: 'A grande maioria de páginas de vendas, landing pages e sites institucionais funciona bem. Por enquanto clonamos uma página por vez, clonar o site inteiro de uma vez já tá no radar.',
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
