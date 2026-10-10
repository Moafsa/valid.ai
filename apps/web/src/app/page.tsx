import Link from 'next/link'
import {
  Sparkles, Layers, Globe2, ShieldCheck, CheckCircle2, ArrowRight,
  Zap, Search, Camera, LayoutDashboard, FolderOpen, BarChart3, Users, Settings,
  TrendingUp, PlayCircle, Link2, MonitorPlay, Image as ImageIcon,
  Video, Type, Globe, Wifi, GitCompare, Pencil, Filter, Percent, Smartphone, Target,
} from 'lucide-react'
import { FaqAccordion } from '@/components/landing/faq-accordion'
import { PricingSection } from '@/components/landing/pricing-section'

// the pricing cards read the plans the administrator edits
export const dynamic = 'force-dynamic'

const STEPS = [
  { icon: Link2, title: 'Cola o link da página', desc: 'A que você quer usar de referência. A gente importa a estrutura pra você.' },
  { icon: Pencil, title: 'Edita do seu jeito', desc: 'Muda texto, imagem, botão, link, seção. Do jeito que você quiser.' },
  { icon: MonitorPlay, title: 'Publica sua página', desc: 'Terminou? Publica na hora e ajusta sempre que precisar.' },
]

const TRUST_POINTS = [
  { icon: Zap, text: 'Clone pronto em minutos' },
  { icon: ShieldCheck, text: 'Seus dados só seus' },
  { icon: CheckCircle2, text: 'Cancele quando quiser' },
]

const DEEP_FEATURES = [
  { icon: Layers, title: 'Clonagem completa de funis', desc: 'Clone páginas, etapas, quizzes e caminhos de navegação em uma única estrutura editável.' },
  { icon: Sparkles, title: 'Inteligência Artificial integrada', desc: 'Traduza, reescreva e adapte textos e elementos da sua página com inteligência artificial.' },
  { icon: Smartphone, title: 'Design responsivo', desc: 'Visualize e edite suas páginas para diferentes dispositivos, com adaptação para celular, tablet e computador.' },
  { icon: Video, title: 'Player de vídeo e VSL', desc: 'Integre vídeos com carregamento otimizado para proporcionar uma experiência mais rápida e fluida.' },
  { icon: BarChart3, title: 'Métricas e análise de comportamento', desc: 'Acompanhe visitas, cliques, rolagem, mapas de calor e gravações de sessões para identificar oportunidades de melhoria.' },
  { icon: Target, title: 'Integração de pixels e eventos', desc: 'Configure Meta Pixel, Google Analytics, Google Ads, TikTok Pixel e outras ferramentas de rastreamento.' },
]

export default function LandingPage() {
  return (
    <div className="landing relative min-h-screen overflow-x-hidden bg-[#07050f] text-white">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="vai-aurora absolute -top-40 left-1/2 h-[620px] w-[1000px] -translate-x-1/2 rounded-full bg-gradient-to-r from-violet-600/30 via-fuchsia-500/20 to-blue-500/25 blur-[130px]" />
        <div className="absolute top-[30%] -left-40 h-[420px] w-[420px] rounded-full bg-blue-600/15 blur-[110px]" />
        <div className="absolute bottom-0 right-0 h-[480px] w-[480px] rounded-full bg-indigo-600/15 blur-[130px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Nav */}
        <nav className="sticky top-0 z-20 border-b border-white/5 bg-[#07050f]/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="be-Vallid" className="h-6 w-auto sm:h-8" />
            </div>
            <div className="hidden items-center gap-8 text-sm font-medium text-gray-400 md:flex">
              <Link href="#features" className="transition-colors hover:text-white">Recursos</Link>
              <Link href="#showcase" className="transition-colors hover:text-white">Como funciona</Link>
              <Link href="#faq" className="transition-colors hover:text-white">Dúvidas</Link>
              <Link href="#pricing" className="transition-colors hover:text-white">Preços</Link>
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              <Link href="/sign-in" className="text-sm font-medium text-gray-400 transition-colors hover:text-white">
                Entrar
              </Link>
              <Link
                href="/sign-up"
                className="whitespace-nowrap rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition-all hover:from-violet-500 hover:to-blue-500 sm:px-5 sm:py-2.5"
              >
                Começar grátis
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section className="relative mx-auto max-w-5xl px-6 pb-16 pt-24 text-center sm:pt-32">
          <div
            className="pointer-events-none absolute left-1/2 top-0 h-[320px] w-[720px] -translate-x-1/2"
            style={{ background: 'radial-gradient(ellipse 50% 50% at 50% 0%, rgba(139,92,246,0.28), transparent 70%)' }}
          />
          <div className="relative mx-auto inline-flex max-w-[90vw] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-violet-300 backdrop-blur-sm sm:max-w-none">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span className="text-left sm:whitespace-nowrap">Captura real. Nada de IA chutando.</span>
          </div>
          <h1 className="relative mb-6 mt-6 text-5xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-8xl">
            Página? É pouco.
            <br />
            <span className="vai-shine bg-gradient-to-r from-violet-300 via-fuchsia-300 to-blue-300 bg-clip-text text-transparent">
              Clone o funil inteiro.
            </span>
          </h1>
          <p className="relative mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-gray-300 sm:text-xl">
            Capture toda a jornada. Tenha o funil completo nas suas mãos: páginas, etapas, caminhos, elementos e métricas. Pegue o que já funciona, adapte do seu jeito e coloque sua versão no ar sem começar do zero.
          </p>
          <div className="relative flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/sign-up"
              className="vai-glow group flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 px-9 py-4 text-base font-semibold text-white shadow-xl shadow-violet-600/40 transition-all hover:-translate-y-0.5 hover:brightness-110"
            >
              <span>Começar grátis</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="#showcase"
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.02] px-8 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10"
            >
              <PlayCircle className="h-4 w-4" />
              <span>Ver como funciona</span>
            </Link>
          </div>
          <div className="relative mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-gray-500">
            {TRUST_POINTS.map(t => (
              <span key={t.text} className="flex items-center gap-1.5">
                <t.icon className="h-3.5 w-3.5 text-violet-400" />
                {t.text}
              </span>
            ))}
          </div>
        </section>

        {/* Demo visual */}
        <section className="relative mx-auto max-w-5xl px-6 pb-24">
          <div className="pointer-events-none absolute -top-10 left-10 h-64 w-64 rounded-full bg-violet-600/25 blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-10 right-10 h-64 w-64 rounded-full bg-blue-600/25 blur-[100px]" />
          <div className="relative rounded-2xl bg-gradient-to-b from-white/15 to-white/0 p-px shadow-2xl shadow-violet-900/20">
            <div className="rounded-2xl bg-[#0a0814]/90 p-6 text-center backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500/80" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                  <div className="h-3 w-3 rounded-full bg-green-500/80" />
                </div>
                <div className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-left font-mono text-xs text-gray-400">
                  https://exemplo.com/lp-produto-x
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs font-medium sm:grid-cols-4">
                <div className="flex items-center justify-center gap-1.5 rounded-lg border border-white/5 bg-white/5 p-3 text-gray-300">
                  <Search className="h-3.5 w-3.5" /> Abrindo página...
                </div>
                <div className="flex items-center justify-center gap-1.5 rounded-lg border border-white/5 bg-white/5 p-3 text-gray-300">
                  <Camera className="h-3.5 w-3.5" /> Capturando DOM/CSS
                </div>
                <div className="flex items-center justify-center gap-1.5 rounded-lg border border-white/5 bg-white/5 p-3 text-gray-300">
                  <ImageIcon className="h-3.5 w-3.5" /> Baixando assets
                </div>
                <div className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-950/60 p-3 text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Pronto!
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="relative mx-auto max-w-5xl px-6 py-16">
          <div className="mb-14 text-center">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-semibold text-violet-300">
              Recursos
            </span>
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">Você fica no controle de tudo</h2>
            <p className="mt-3 text-gray-400">Editar, hospedar e publicar, tudo no mesmo lugar</p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Editor visual */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-all hover:border-violet-500/40">
              <div className="p-6 pb-0">
                <h3 className="mb-1.5 text-base font-bold text-white">Editor visual completo</h3>
                <p className="text-sm leading-relaxed text-gray-400">Arraste blocos, mude texto, link e cor sem tocar em código.</p>
              </div>
              <div className="p-4 pt-5">
                <div className="flex overflow-hidden rounded-xl border border-white/10 bg-[#0a0814]">
                  <div className="w-16 shrink-0 space-y-1.5 border-r border-white/10 p-2">
                    {['Título', 'Texto', 'Botão', 'Imagem'].map(b => (
                      <div key={b} className="rounded-md bg-white/5 px-1.5 py-1 text-center text-[8px] font-medium text-gray-400">{b}</div>
                    ))}
                  </div>
                  <div className="relative flex-1 space-y-1.5 p-2.5">
                    <div className="h-2.5 w-2/3 rounded bg-white/10" />
                    <div className="h-2.5 w-1/2 rounded bg-white/10" />
                    <div className="h-6 w-3/4 rounded-md border border-dashed border-violet-500/50 bg-violet-500/10" />
                    <MonitorPlay className="absolute bottom-1 right-1 h-5 w-5 rotate-12 text-violet-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Captura real */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-all hover:border-violet-500/40">
              <div className="p-6 pb-0">
                <h3 className="mb-1.5 text-base font-bold text-white">Captura 100% real</h3>
                <p className="text-sm leading-relaxed text-gray-400">Nada de IA chutando. É o HTML e CSS de verdade, pixel a pixel.</p>
              </div>
              <div className="flex items-center gap-2 p-4 pt-5">
                <div className="flex-1 space-y-1.5 rounded-xl border border-white/10 bg-[#0a0814] p-3">
                  <p className="mb-1 text-[8px] font-semibold text-gray-500">ORIGINAL</p>
                  <div className="h-2 w-3/4 rounded bg-white/15" />
                  <div className="h-2 w-1/2 rounded bg-white/15" />
                  <div className="h-8 w-full rounded bg-gradient-to-br from-violet-600/30 to-blue-600/30" />
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-violet-400" />
                <div className="flex-1 space-y-1.5 rounded-xl border border-violet-500/40 bg-[#0a0814] p-3">
                  <p className="mb-1 text-[8px] font-semibold text-violet-400">SEU CLONE</p>
                  <div className="h-2 w-3/4 rounded bg-white/15" />
                  <div className="h-2 w-1/2 rounded bg-white/15" />
                  <div className="h-8 w-full rounded bg-gradient-to-br from-violet-600/30 to-blue-600/30" />
                </div>
              </div>
            </div>

            {/* IA na edição */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-all hover:border-violet-500/40">
              <div className="p-6 pb-0">
                <h3 className="mb-1.5 text-base font-bold text-white">Inteligência artificial integrada</h3>
                <p className="text-sm leading-relaxed text-gray-400">Traduz, reescreve e adapta o texto da sua página com IA.</p>
              </div>
              <div className="flex items-center gap-2 p-4 pt-5">
                <div className="flex-1 space-y-1.5 rounded-xl border border-white/10 bg-[#0a0814] p-3">
                  <p className="mb-1 text-[8px] font-semibold text-gray-500">TEXTO ORIGINAL</p>
                  <div className="h-2 w-full rounded bg-white/15" />
                  <div className="h-2 w-2/3 rounded bg-white/15" />
                </div>
                <Sparkles className="h-4 w-4 shrink-0 text-violet-400" />
                <div className="flex-1 space-y-1.5 rounded-xl border border-violet-500/40 bg-[#0a0814] p-3">
                  <p className="mb-1 text-[8px] font-semibold text-violet-400">COM IA</p>
                  <div className="h-2 w-full rounded bg-gradient-to-r from-violet-500/40 to-blue-400/40" />
                  <div className="h-2 w-2/3 rounded bg-gradient-to-r from-violet-500/40 to-blue-400/40" />
                </div>
              </div>
            </div>

            {/* Hospedagem + domínio */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-all hover:border-violet-500/40">
              <div className="p-6 pb-0">
                <h3 className="mb-1.5 text-base font-bold text-white">Hospedagem e domínio inclusos</h3>
                <p className="text-sm leading-relaxed text-gray-400">Imagem, vídeo e fonte moram com a gente. E você publica seu site com um clique.</p>
              </div>
              <div className="space-y-2 p-4 pt-5">
                <div className="grid grid-cols-4 gap-1.5">
                  {[ImageIcon, Video, Type, ImageIcon].map((Icon, i) => (
                    <div key={i} className="flex aspect-square items-center justify-center rounded-lg border border-white/10 bg-[#0a0814] text-violet-400">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0a0814] px-2.5 py-1.5 text-[10px] text-gray-400">
                  <Globe className="h-3 w-3 shrink-0 text-violet-400" />
                  <span className="truncate">seusite.be-vallid.com</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 py-1.5 text-[10px] font-semibold text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Publicado
                </div>
              </div>
            </div>
          </div>

          {/* Quick extras */}
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {[
              { icon: Video, text: 'Vídeo e VSL hospedados junto' },
              { icon: Type, text: 'Fonte, ícone e hover preservados' },
              { icon: ShieldCheck, text: 'Seus dados, sua conta' },
            ].map(x => (
              <span key={x.text} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-3.5 py-1.5 text-xs text-gray-400">
                <x.icon className="h-3.5 w-3.5 text-violet-400" />
                {x.text}
              </span>
            ))}
          </div>
        </section>

        {/* Como funciona: 3 passos */}
        <section id="showcase" className="relative mx-auto max-w-5xl px-6 py-16">
          <div className="mb-14 text-center">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-semibold text-violet-300">
              Como funciona
            </span>
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">Do link ao controle total, em 3 passos</h2>
          </div>
          <div className="relative grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div className="pointer-events-none absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent sm:block" />
            {STEPS.map((step, i) => (
              <div key={step.title} className="relative text-center">
                <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-500/30 bg-[#0a0814] shadow-lg shadow-violet-950/40">
                  <step.icon className="h-6 w-6 text-violet-300" />
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mb-1 text-base font-bold text-white">{step.title}</h3>
                <p className="text-sm text-gray-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Além do clone */}
        <section className="relative mx-auto max-w-5xl px-6 py-16">
          <div className="mb-12 text-center">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-semibold text-violet-300">
              Muito além do clone
            </span>
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">Do clone ao resultado, no mesmo lugar</h2>
            <p className="mt-3 text-gray-400">Clonou? Agora edite, publique, meça e melhore com dados reais</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DEEP_FEATURES.map(f => (
              <div key={f.title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-all hover:border-violet-500/40">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600/40 to-blue-500/30">
                  <f.icon className="h-5 w-5 text-violet-200" />
                </div>
                <h3 className="mb-1.5 text-sm font-bold text-white">{f.title}</h3>
                <p className="text-[13px] leading-relaxed text-gray-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Seu painel */}
        <section className="relative mx-auto max-w-5xl px-6 py-24">
          <div className="mb-14 text-center">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-semibold text-violet-300">
              Seu painel
            </span>
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
              Todos os seus clones, num painel só
            </h2>
            <p className="mt-3 text-gray-400">Status de cada página, visitantes e conversão, tudo sem sair do be-Vallid</p>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute -top-16 left-1/4 h-72 w-72 rounded-full bg-violet-600/20 blur-[110px]" />
            <div className="pointer-events-none absolute -bottom-16 right-1/4 h-72 w-72 rounded-full bg-blue-600/20 blur-[110px]" />

            <div className="relative rounded-2xl bg-gradient-to-b from-white/15 to-white/0 p-px shadow-2xl shadow-violet-900/20">
              <div className="overflow-hidden rounded-2xl bg-[#0a0814]/90 backdrop-blur-xl">
                <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                    <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                    <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
                  </div>
                  <div className="flex-1 text-center font-mono text-[11px] text-gray-500">app.be-vallid.com/dashboard</div>
                </div>
                <div className="flex">
                  <div className="hidden w-14 flex-col items-center gap-5 border-r border-white/10 py-6 sm:flex">
                    {[LayoutDashboard, FolderOpen, BarChart3, Users, Settings].map((Icon, i) => (
                      <Icon key={i} className={`h-4 w-4 ${i === 0 ? 'text-violet-400' : 'text-gray-600'}`} />
                    ))}
                  </div>
                  <div className="flex-1 p-6 text-left">
                    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: 'Projetos', value: '4', icon: FolderOpen },
                        { label: 'Publicados', value: '3', icon: Globe2 },
                        { label: 'Assets salvos', value: '512', icon: ImageIcon },
                        { label: 'Créditos de IA', value: '212/300', icon: Zap },
                      ].map(s => (
                        <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <div className="mb-1.5 flex items-center gap-1.5 text-gray-500">
                            <s.icon className="h-3 w-3" />
                            <span className="text-[10px] font-medium">{s.label}</span>
                          </div>
                          <p className="text-lg font-bold text-white">{s.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {[
                        { name: 'Quiz Emagrecimento', status: 'Publicado' },
                        { name: 'VSL Curso Trader', status: 'Pronto' },
                        { name: 'LP Suplemento X', status: 'Analisando' },
                      ].map(p => (
                        <div key={p.name} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                          <div className="flex h-16 items-center justify-center bg-gradient-to-br from-violet-600/20 to-blue-600/20">
                            <Layers className="h-6 w-6 text-violet-400/60" strokeWidth={1.5} />
                          </div>
                          <div className="p-2.5">
                            <p className="truncate text-xs font-semibold text-gray-200">{p.name}</p>
                            <p className="mt-0.5 text-[10px] text-gray-500">{p.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating chips */}
            <div className="absolute -left-10 -top-8 hidden -rotate-3 items-center gap-2 rounded-xl border border-white/10 bg-[#0a0814]/95 px-3.5 py-2.5 shadow-xl backdrop-blur-xl sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-[10px] text-gray-500">Teste A/B</p>
                <p className="text-xs font-bold text-white">Variação B na frente</p>
              </div>
            </div>
            <div className="absolute -right-10 -bottom-8 hidden rotate-3 items-center gap-2 rounded-xl border border-white/10 bg-[#0a0814]/95 px-3.5 py-2.5 shadow-xl backdrop-blur-xl sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                <Layers className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-[10px] text-gray-500">Pixel da Meta</p>
                <p className="text-xs font-bold text-white">Evento enviado</p>
              </div>
            </div>
          </div>

          {/* Métricas da página */}
          <div className="relative mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0814]/90 p-4 backdrop-blur-xl sm:p-5">
            <h3 className="text-base font-bold text-white">Métricas da página</h3>
            <p className="mt-1 text-sm text-gray-500">Visitantes, conversões e desempenho de cada clone <span className="text-gray-600">· números de exemplo</span></p>

            <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[180px_1fr]">
              <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-1">
                {[
                  { icon: Users, label: 'Visitantes', value: '12.4K', delta: '+14%' },
                  { icon: Filter, label: 'Conversões', value: '1.2K', delta: '+22%' },
                  { icon: Percent, label: 'Taxa de conversão', value: '9.7%', delta: '+6%' },
                ].map(m => (
                  <div key={m.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                    <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                      <m.icon className="h-3.5 w-3.5" />
                    </div>
                    <p className="text-[10px] text-gray-500">{m.label}</p>
                    <p className="text-base font-bold text-white">{m.value}</p>
                    <p className="text-[10px] font-medium text-emerald-400">↑ {m.delta} vs. período anterior</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-white">Visitantes da página</p>
                    <p className="text-[10px] text-gray-500">Desempenho ao longo do tempo</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[9px] text-gray-400">Últimos 30 dias</span>
                    <span className="rounded-md bg-violet-600 px-2 py-1 text-[9px] font-semibold text-white">Visitantes</span>
                  </div>
                </div>

                <div className="relative flex gap-2">
                  <div className="flex h-32 flex-col justify-between py-0.5 text-[9px] text-gray-600">
                    <span>15K</span>
                    <span>10K</span>
                    <span>5K</span>
                    <span>0</span>
                  </div>
                  <div className="flex h-32 flex-1 items-end gap-1 border-l border-white/10 pl-2">
                    {[24, 32, 40, 48, 56, 64, 72, 80, 88, 113, 104].map((px, i) => (
                      <div key={i} className="relative flex-1">
                        {i === 9 && (
                          <div className="absolute bottom-full left-1/2 mb-2 w-max -translate-x-1/2 rounded-lg border border-violet-500/30 bg-[#0a0814] px-2.5 py-1.5 text-[9px] shadow-lg">
                            <p className="text-gray-500">28 de Mai</p>
                            <p className="font-bold text-white">14.2K visitantes</p>
                            <p className="text-emerald-400">↑ 18% vs. dia anterior</p>
                          </div>
                        )}
                        <div
                          className={`w-full rounded-t-sm ${i === 9 ? 'bg-gradient-to-t from-violet-600 to-blue-400' : 'bg-white/10'}`}
                          style={{ height: `${px}px` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-1.5 flex justify-between pl-7 text-[9px] text-gray-600">
                  {['1 Mai', '7 Mai', '13 Mai', '19 Mai', '25 Mai', '30 Mai'].map(d => <span key={d}>{d}</span>)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Detector de cloaker */}
        <section className="relative mx-auto max-w-5xl px-6 py-16">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-violet-600/[0.07] to-transparent p-6 sm:p-10">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-600/20 blur-[110px]" />
            <div className="relative">
              <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-violet-300">
                <Search className="h-3.5 w-3.5" /> Detector de cloaker
              </span>
              <h2 className="mb-4 max-w-2xl text-3xl font-extrabold text-white sm:text-4xl">
                Se existe uma versão, a gente encontra.
              </h2>
              <p className="mb-8 max-w-2xl text-sm leading-relaxed text-gray-300 sm:text-base">
                Cloaker muda a oferta por região, VPN, navegador ou dispositivo: alguns sites escondem páginas, ofertas e conteúdos diferentes para cada visitante. A gente testa os cenários e revela o que realmente está por trás do link.
              </p>

              <div className="mb-8 grid gap-3 sm:grid-cols-3">
                {[
                  { icon: GitCompare, title: 'Compara as versões' },
                  { icon: Search, title: 'Acha a oferta' },
                  { icon: Layers, title: 'Clona o que importa' },
                ].map(c => (
                  <div key={c.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600/40 to-blue-500/30">
                      <c.icon className="h-4 w-4 text-violet-200" />
                    </div>
                    <p className="text-sm font-semibold text-white">{c.title}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { icon: Globe, t: 'Região' },
                  { icon: Wifi, t: 'VPN' },
                  { icon: MonitorPlay, t: 'Navegador' },
                  { icon: Camera, t: 'Dispositivo' },
                  { icon: Sparkles, t: 'e muito mais…' },
                ].map(x => (
                  <span key={x.t} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-gray-300">
                    <x.icon className="h-3.5 w-3.5 text-violet-400" /> {x.t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="relative mx-auto max-w-5xl px-6 py-16">
          <div className="mb-14 text-center">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-semibold text-violet-300">
              Dúvidas
            </span>
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">Perguntas frequentes</h2>
            <p className="mt-3 text-gray-400">As perguntas que mais recebemos sobre o be-Vallid</p>
          </div>
          <FaqAccordion />
        </section>

        {/* Pricing */}
        <PricingSection />

        {/* CTA final */}
        <section className="relative mx-auto max-w-5xl px-6 py-16">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-16 text-center backdrop-blur-sm">
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(ellipse 60% 80% at 50% 100%, rgba(59,130,246,0.18), transparent 70%)' }}
            />
            <div className="relative">
              <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">Pronto para começar?</h2>
              <p className="mb-8 text-gray-400">Cola o link da sua primeira página e veja o clone com seus próprios olhos</p>
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-10 py-4 text-base font-bold text-white shadow-2xl shadow-violet-600/30 transition-all hover:-translate-y-0.5 hover:from-violet-500 hover:to-blue-500"
              >
                <span>Criar conta grátis</span>
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 px-6 py-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-sm text-gray-500 sm:flex-row">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.png" alt="" className="h-5 w-auto opacity-90" />
              <p>© 2026 be-Vallid. Todos os direitos reservados.</p>
            </div>
            <div className="flex gap-6">
              <Link href="/terms" className="transition-colors hover:text-gray-300">Termos</Link>
              <Link href="/privacy" className="transition-colors hover:text-gray-300">Privacidade</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
