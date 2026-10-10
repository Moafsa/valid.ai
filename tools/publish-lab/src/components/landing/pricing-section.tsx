import Link from 'next/link'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { brlCents, planCardLines } from '@/lib/plans-shared'
import { publicPlans } from '@/lib/plans'

/** The pricing cards of the landing page. What they say comes from the plans the administrator sets up: the limits and features write their own lines. */
export async function PricingSection() {
  const plans = await publicPlans()
  const cols = plans.length >= 4 ? 'lg:grid-cols-4' : plans.length === 2 ? 'sm:grid-cols-2 sm:mx-auto sm:max-w-3xl' : 'sm:grid-cols-3'
  return (
    <section id="pricing" className="relative mx-auto max-w-5xl px-6 py-24">
      <div className="mb-14 text-center">
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-semibold text-violet-300">
          Preços
        </span>
        <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">Preços simples e transparentes</h2>
        <p className="mt-3 text-gray-400">Escolha o plano que faz sentido pro seu momento</p>
      </div>
      <div className={`grid grid-cols-1 items-stretch gap-6 ${cols}`}>
        {plans.map(plan => (
          <div key={plan.key} className={plan.highlight ? 'rounded-2xl bg-gradient-to-b from-violet-500 to-blue-600 p-px shadow-2xl shadow-violet-900/40 sm:-translate-y-2' : ''}>
            <div className={`flex h-full flex-col rounded-2xl border p-6 ${plan.highlight ? 'border-transparent bg-[#0a0814]' : 'border-white/10 bg-white/[0.02]'}`}>
              {plan.highlight && (
                <div className="mb-3 inline-flex w-fit items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-bold text-violet-300">
                  <Sparkles className="h-3 w-3" /> Recomendado
                </div>
              )}
              <h3 className="text-xl font-bold text-white">{plan.name}</h3>
              {plan.description && <p className="mt-1 text-sm text-gray-500">{plan.description}</p>}
              <div className="mb-5 mt-2">
                <span className="text-4xl font-extrabold text-white">{brlCents(plan.priceCents).replace(/\s/g, ' ')}</span>
                <span className="text-sm font-medium text-gray-400">{plan.interval === 'year' ? '/ano' : '/mês'}</span>
              </div>
              <ul className="mb-6 flex-1 space-y-2.5">
                {planCardLines(plan).map(line => (
                  <li key={line} className="flex items-start gap-2 text-sm text-gray-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className={`block rounded-xl py-3 text-center text-sm font-bold transition-all ${
                  plan.highlight
                    ? 'bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-lg shadow-violet-600/30 hover:from-violet-500 hover:to-blue-500'
                    : 'bg-white/10 text-gray-200 hover:bg-white/15'
                }`}
              >
                {plan.ctaLabel || `Assinar ${plan.name}`}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
