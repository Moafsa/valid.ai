import Link from 'next/link'
import {
  Sparkles, Layers, Globe2, ShieldCheck, CheckCircle2, ArrowRight,
  Zap, Search, Camera, LayoutDashboard, FolderOpen, BarChart3, Users, Settings,
  TrendingUp, PlayCircle, Link2, MonitorPlay, Image as ImageIcon,
  Video, Type, Globe, Wifi, GitCompare, Pencil, Filter, Percent,
} from 'lucide-react'
import { FaqAccordion } from '@/components/landing/faq-accordion'

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

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#07050f] text-white">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[130px]" />
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
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-blue-500 shadow-lg shadow-violet-600/30">
                <Zap className="h-5 w-5 text-white" fill="currentColor" strokeWidth={0} />
              </div>
              <span className="text-xl font-extrabold tracking-tight text-white">
                be-Vallid
              </span>
            </div>
            <div className="hidden items-center gap-8 text-sm font-medium text-gray-400 md:flex">
              <Link href="#features" className="transition-colors hover:text-white">Recursos</Link>
              <Link href="#showcase" className="transition-colors hover:text-white">Como funciona</Link>
              <Link href="#faq" className="transition-colors hover:text-white">Dúvidas</Link>
              <Link href="#pricing" className="transition-colors hover:text-white">Preços</Link>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/sign-in" className="text-sm font-medium text-gray-400 transition-colors hover:text-white">
                Entrar
              </Link>
              <Link
                href="/sign-up"
                className="rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition-all hover:from-violet-500 hover:to-blue-500"
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
          <h1 className="relative mb-6 mt-6 text-5xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Não clone apenas a página.
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent">
              Assuma o controle dela.
            </span>
          </h1>
          <p className="relative mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-gray-400 sm:text-xl">
            Cola o link e a gente entra na página de verdade pra trazer tudo: HTML, CSS, imagens, fontes e vídeos. Nada de IA inventando como era o original. É o clone real, hospedado com a gente, pronto em minutos e seu pra sempre.
          </p>
          <div className="relative flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/sign-up"
              className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-xl shadow-violet-600/30 transition-all hover:-translate-y-0.5 hover:from-violet-500 hover:to-blue-500"
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

        {/* Showcase */}
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
                        { label: 'Uso do plano', value: '2/5', icon: Zap },
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
                <p className="text-[10px] text-gray-500">Conversão</p>
                <p className="text-xs font-bold text-white">+32% este mês</p>
              </div>
            </div>
            <div className="absolute -right-10 -bottom-8 hidden rotate-3 items-center gap-2 rounded-xl border border-white/10 bg-[#0a0814]/95 px-3.5 py-2.5 shadow-xl backdrop-blur-xl sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                <Layers className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-[10px] text-gray-500">Páginas clonadas</p>
                <p className="text-xs font-bold text-white">100% fiéis</p>
              </div>
            </div>
          </div>

          {/* Métricas da página */}
          <div className="relative mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0814]/90 p-4 backdrop-blur-xl sm:p-5">
            <h3 className="text-base font-bold text-white">Métricas da página</h3>
            <p className="mt-1 text-sm text-gray-500">Visitantes, conversões e desempenho de cada clone</p>

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
              <h2 className="mb-2 max-w-xl text-2xl font-bold text-white sm:text-3xl">
                A gente também acha a página escondida
              </h2>
              <p className="mb-8 max-w-xl text-sm leading-relaxed text-gray-400">
                Cloaker muda a oferta por região, VPN ou navegador. A gente testa de vários jeitos e te mostra a versão real.
              </p>

              <div className="flex flex-wrap gap-3">
                <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-gray-300">
                  <Globe className="h-3.5 w-3.5 text-violet-400" /> Por região
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-gray-300">
                  <Wifi className="h-3.5 w-3.5 text-violet-400" /> Com e sem VPN
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-gray-300">
                  <GitCompare className="h-3.5 w-3.5 text-violet-400" /> Compara as versões
                </span>
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
        <section id="pricing" className="relative mx-auto max-w-5xl px-6 py-24">
          <div className="mb-14 text-center">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-semibold text-violet-300">
              Preços
            </span>
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">Preços simples e transparentes</h2>
            <p className="mt-3 text-gray-400">Escolha o plano que faz sentido pro seu momento</p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              { name: 'Basic', price: 'R$ 97', period: '/mês', cta: 'Assinar Basic', features: ['2 páginas clonadas', 'Imagens, fontes e vídeos hospedados', 'Subdomínio be-vallid.com grátis', 'Suporte por e-mail'] },
              { name: 'Pro', price: 'R$ 247', period: '/mês', cta: 'Assinar Pro', highlight: true, features: ['10 páginas clonadas', 'Imagens, fontes e vídeos hospedados', '3 domínios próprios customizados', 'Suporte prioritário'] },
              { name: 'Scale', price: 'R$ 597', period: '/mês', cta: 'Assinar Scale', features: ['Páginas clonadas ILIMITADAS', 'Imagens, fontes e vídeos hospedados', 'Domínios próprios ilimitados', 'Suporte VIP prioritário'] },
            ].map(plan => (
              <div
                key={plan.name}
                className={
                  plan.highlight
                    ? 'rounded-2xl bg-gradient-to-b from-violet-500 to-blue-600 p-px shadow-2xl shadow-violet-900/40'
                    : ''
                }
              >
                <div
                  className={`h-full rounded-2xl border p-6 ${
                    plan.highlight
                      ? 'border-transparent bg-[#0a0814]'
                      : 'border-white/10 bg-white/[0.02]'
                  }`}
                >
                  {plan.highlight && (
                    <div className="mb-3 inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-bold text-violet-300">
                      <Sparkles className="h-3 w-3" /> Mais popular
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                  <div className="mb-4 mt-2">
                    <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                    <span className="text-sm font-medium text-gray-400">{plan.period}</span>
                  </div>
                  <ul className="mb-6 space-y-2.5">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                        <span>{f}</span>
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
                    {plan.cta}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

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
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-tr from-violet-600 to-blue-500">
                <Zap className="h-3.5 w-3.5 text-white" fill="currentColor" strokeWidth={0} />
              </div>
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
