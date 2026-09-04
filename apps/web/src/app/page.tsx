import Link from 'next/link'
import { Sparkles, Layers, Cpu, Globe2, ShieldCheck, HelpCircle, CheckCircle2, ArrowRight, Lock, Zap } from 'lucide-react'

const FEATURES = [
  { icon: Layers, title: 'Clone qualquer funil', desc: 'Cole uma URL e o scanner IA analisa e reconstrói o funil completo em componentes editáveis.' },
  { icon: Cpu, title: 'Screenshot → Código', desc: 'Tecnologia screenshot-to-code converte cada seção em React+Tailwind fiel ao original.' },
  { icon: Sparkles, title: 'Analytics nativo', desc: 'Funil de conversão, heatmaps e timeline de leads — sem precisar de ferramentas externas.' },
  { icon: Globe2, title: 'Tradução cultural IA', desc: 'Adapta copy, CTAs e expressões para ES-MX, ES-CO, EN-US — não só traduz palavra por palavra.' },
  { icon: ShieldCheck, title: 'Anti-Cloaker', desc: 'Detecta automaticamente se a página tem cloaker e compara as duas versões com IA.' },
  { icon: HelpCircle, title: 'Quiz Engine própria', desc: 'Importa quizzes multi-etapa com lógica condicional nativa — sem depender do JS original.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-extrabold text-white tracking-tight">Valid<span className="text-brand-400">.ai</span></span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Entrar</Link>
          <Link href="/sign-up"
            className="rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-600/30 transition-all"
          >
            Começar grátis
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-950/80 text-brand-400 text-xs font-semibold px-4 py-1.5 rounded-full border border-brand-800/80 mb-6 backdrop-blur-sm">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Clone, edite e publique funis de vendas com IA</span>
        </div>
        <h1 className="text-5xl font-extrabold text-white leading-tight mb-6 tracking-tight sm:text-6xl">
          Clone qualquer funil de vendas<br />
          <span className="bg-gradient-to-r from-brand-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">em minutos com IA</span>
        </h1>
        <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto leading-relaxed">
          Cole um link. O Valid.ai analisa, reconstrói e disponibiliza o funil como componentes editáveis — LP, Quiz, VSL ou Checkout.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/sign-up"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-8 py-3.5 text-base font-semibold text-white hover:from-brand-500 hover:to-indigo-500 shadow-xl shadow-brand-600/30 transition-all transform hover:-translate-y-0.5"
          >
            <span>Começar grátis</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="#features" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
            Ver como funciona ↓
          </Link>
        </div>
        <p className="text-xs text-gray-500 mt-4">Sem cartão de crédito · 50 créditos grátis · Cancele quando quiser</p>
      </section>

      {/* Demo visual */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-6 text-center shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500/80" />
              <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
              <div className="h-3 w-3 rounded-full bg-green-500/80" />
            </div>
            <div className="flex-1 bg-gray-950/80 rounded-lg px-3 py-1.5 text-xs text-gray-400 text-left font-mono border border-gray-800">
              https://exemplo.com/lp-produto-x
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 text-xs font-medium">
            <div className="rounded-lg p-3 bg-gray-800/80 text-gray-300 flex items-center justify-center gap-1.5">🔍 Escaneando...</div>
            <div className="rounded-lg p-3 bg-gray-800/80 text-gray-300 flex items-center justify-center gap-1.5">📸 Screenshots</div>
            <div className="rounded-lg p-3 bg-gray-800/80 text-gray-300 flex items-center justify-center gap-1.5">🤖 Gerando código</div>
            <div className="rounded-lg p-3 bg-green-950/60 border border-green-800 text-green-400 flex items-center justify-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Pronto!</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-3">Tudo que você precisa</h2>
        <p className="text-gray-400 text-center mb-12">Em uma única plataforma, do clone à publicação</p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(f => {
            const Icon = f.icon
            return (
              <div key={f.title} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6 hover:border-gray-700 transition-all">
                <div className="h-11 w-11 rounded-xl bg-brand-950 border border-brand-800/80 flex items-center justify-center mb-4 text-brand-400 shadow-inner">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-white mb-2 text-base">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-3">Preços simples e transparentes</h2>
        <p className="text-gray-400 text-center mb-12">Escolha o plano ideal para alavancar suas vendas.</p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            { name: 'Basic', price: 'R$ 97', period: '/mês', cta: 'Assinar Basic', features: ['2 sites/funis salvos clonados', '100 créditos de IA/mês', 'Subdomínio valid.ai grátis', 'Captura de leads & estatísticas'] },
            { name: 'Pro', price: 'R$ 247', period: '/mês', cta: 'Assinar Pro', highlight: true, features: ['5 sites/funis salvos clonados', '300 créditos de IA/mês', '3 domínios próprios customizados', 'Anti-Cloaker scanner', 'Tradução cultural por IA'] },
            { name: 'Scale', price: 'R$ 597', period: '/mês', cta: 'Assinar Scale', features: ['Funis e sites clonados ILIMITADOS', '1.000 créditos de IA/mês', 'Domínios próprios ilimitados', 'Traduções & Quizzes ilimitados', 'Suporte VIP prioritário'] },
          ].map(plan => (
            <div key={plan.name}
              className={`rounded-2xl p-6 border transition-all ${plan.highlight ? 'border-brand-500 bg-brand-950/40 shadow-2xl shadow-brand-900/30' : 'border-gray-800 bg-gray-900/60'}`}
            >
              {plan.highlight && (
                <div className="inline-flex items-center gap-1 text-xs text-brand-400 font-bold mb-3 bg-brand-900/60 px-2.5 py-1 rounded-full border border-brand-700">
                  <Sparkles className="h-3 w-3" /> Mais popular
                </div>
              )}
              <h3 className="text-xl font-bold text-white">{plan.name}</h3>
              <div className="mt-2 mb-4">
                <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                <span className="text-gray-400 text-sm font-medium">{plan.period}</span>
              </div>
              <ul className="space-y-2.5 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="text-sm text-gray-300 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href="/sign-up"
                className={`block text-center rounded-xl py-3 text-sm font-bold transition-all ${
                  plan.highlight
                    ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-600/30'
                    : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">Pronto para começar?</h2>
        <p className="text-gray-400 mb-8">Junte-se a centenas de afiliados e infoprodutores que já usam o Valid.ai</p>
        <Link href="/sign-up"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-10 py-4 text-base font-bold text-white hover:from-brand-500 hover:to-indigo-500 shadow-2xl shadow-brand-600/30 transition-all transform hover:-translate-y-0.5"
        >
          <span>Criar conta grátis</span>
          <ArrowRight className="h-5 w-5" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/80 px-6 py-8 bg-gray-950">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-gray-500">
          <p>© 2026 Valid.ai. Todos os direitos reservados.</p>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-gray-300 transition-colors">Termos</Link>
            <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
