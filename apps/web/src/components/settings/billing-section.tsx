'use client'
import { useState } from 'react'
import { Zap } from 'lucide-react'

const PLANS = [
  {
    id: 'BASIC',
    name: 'Basic',
    price: 'R$ 97/mês',
    color: 'bg-blue-600 text-white',
    features: [
      '2 sites/funis clonados salvos',
      '100 créditos de IA/mês',
      'Subdomínio valid.ai grátis',
      'Captura de leads e estatísticas',
    ],
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: 'R$ 247/mês',
    color: 'bg-brand-600 text-white',
    features: [
      '5 sites/funis clonados salvos',
      '300 créditos de IA/mês',
      '3 domínios próprios customizados',
      'Anti-Cloaker scanner',
      'Tradução cultural por IA',
    ],
    highlight: true,
  },
  {
    id: 'SCALE',
    name: 'Scale',
    price: 'R$ 597/mês',
    color: 'bg-purple-600 text-white',
    features: [
      'Funis e sites clonados ILIMITADOS',
      '1.000 créditos de IA/mês',
      'Domínios próprios ilimitados',
      'Traduções & Quizzes ilimitados',
      'Suporte VIP prioritário',
    ],
  },
]

export function BillingSection({ workspace }: { workspace: any }) {
  const currentPlan = workspace?.plan ?? 'FREE'

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Plano e Cobrança</h2>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
          <Zap className="h-4 w-4 text-yellow-600" />
          <span className="text-sm text-yellow-800">
            Créditos disponíveis: <strong>{workspace?.aiCredits ?? 50}</strong> créditos IA
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {PLANS.map(plan => (
            <div
              key={plan.id}
              className={`rounded-xl p-4 border-2 ${
                currentPlan === plan.id ? 'border-brand-500' : 'border-gray-200'
              }`}
            >
              <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mb-2 ${plan.color}`}>
                {plan.name}
              </div>
              <p className="text-lg font-bold text-gray-900">{plan.price}</p>
              <ul className="mt-3 space-y-1">
                {plan.features.map(f => (
                  <li key={f} className="text-xs text-gray-500 flex items-center gap-1">
                    <span className="text-green-500">✓</span> {f}
                  </li>
                ))}
              </ul>
              {currentPlan === plan.id ? (
                <div className="mt-4 text-xs text-brand-600 font-semibold text-center">Plano atual</div>
              ) : (
                <button className="mt-4 w-full py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700">
                  Fazer upgrade
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
