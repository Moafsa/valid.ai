'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wand2, Loader2, ArrowRight, Link2 } from 'lucide-react'
import { toast } from 'sonner'

// If the scanner ever goes silent mid-job — its container gets redeployed,
// it crashes, the network drops — nothing tells this component that
// happened; the SSE connection either hangs open with nothing coming
// through it, or the job is simply gone with no one left to report an
// error. Without a watchdog, the UI is stuck showing "Criando projeto..."
// forever, looking exactly like an infinite loop even though nothing is
// actually looping. Reset on every real progress event; 90s of total
// silence is generous for a slow multi-page crawl but still bounds the
// worst case.
const STALL_TIMEOUT_MS = 90_000

type Phase = 'idle' | 'creating' | 'scanning' | 'save-failed'

/**
 * POSTs to /api/scan/finalize with retries — a transient blip (this app's
 * own web container getting redeployed mid-request during active
 * development, a brief network hiccup) previously meant an immediate
 * "Clone processado, mas falhou ao salvar" with zero server-side log line
 * at all (the request never reached the route handler to log anything).
 * Retrying a few times before giving up absorbs exactly that class of
 * failure silently; a REAL failure (bad payload, a genuine DB error) will
 * still fail on every attempt and get reported for real afterward.
 */
async function finalizeWithRetry(payload: object, attempts = 3): Promise<{ ok: boolean; error?: string }> {
  let lastError = 'Falha ao salvar'
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch('/api/scan/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) return { ok: true }
      const data = await res.json().catch(() => ({}))
      lastError = data.error || `Falha ao salvar (HTTP ${res.status})`
    } catch (e: any) {
      lastError = e.message || 'Falha de rede ao salvar'
    }
    if (i < attempts - 1) await new Promise(r => setTimeout(r, 1500))
  }
  return { ok: false, error: lastError }
}

/**
 * The one thing this dashboard does: paste a URL, clone it. Real DOM+CSS
 * capture happens in the scanner service — this component just kicks it
 * off and shows live progress (via SSE) until it's done, then jumps
 * straight to the cloned project.
 */
export function CloneHero({ initialUrl = '', persona, heading, subheading, variant = 'card' }: { initialUrl?: string; persona?: string; heading?: string; subheading?: string; variant?: 'card' | 'workspace' } = {}) {
  const router = useRouter()
  const [url, setUrl] = useState(initialUrl)
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [step, setStep] = useState('')
  const [crawlStats, setCrawlStats] = useState<{ found: number; processed: number; completed: number; failed: number } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Kept so a failed SAVE never throws away a clone that already finished
  // successfully in the scanner — retrying means POSTing this again, not
  // re-running the whole (potentially slow) clone from scratch.
  const pendingSave = useRef<{ jobId: string; projectId: string; result: any } | null>(null)
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const urlInput = useRef<HTMLInputElement>(null)
  const [editingName, setEditingName] = useState(false)

  // "Clonar outra página" in the project grid brings the person back here
  useEffect(() => {
    const focus = () => { urlInput.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => urlInput.current?.focus(), 350) }
    window.addEventListener('vai:focus-clone', focus)
    return () => window.removeEventListener('vai:focus-clone', focus)
  }, [])

  const clearStallTimer = () => {
    if (stallTimer.current) clearTimeout(stallTimer.current)
    stallTimer.current = null
  }

  const handleClone = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    let normalized = trimmed
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`

    setPhase('creating')
    setProgress(0)
    setStep('Criando projeto...')
    setCrawlStats(null)

    try {
      const projectRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl: normalized, name: name.trim() || undefined }),
      })
      const project = await projectRes.json()
      if (!projectRes.ok) throw new Error(project.error ?? 'Erro ao criar projeto')

      const startRes = await fetch('/api/scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, url: normalized, ...(persona ? { persona } : {}) }),
      })
      const startData = await startRes.json()
      if (!startRes.ok) throw new Error(startData.error ?? 'Erro ao iniciar clonagem')

      setPhase('scanning')

      const es = new EventSource(`/api/scan/progress/${startData.jobId}`)

      // The stream going quiet does not mean the scan died: the scanner saves
      // the finished clone itself, so ask the database. Only a clone that is
      // truly gone (nothing happening for a very long time) is reported.
      const watchDatabase = () => {
        es.close()
        setStep('Ainda trabalhando no seu clone...')
        const startedAt = Date.now()
        const poll = async () => {
          if (Date.now() - startedAt > 45 * 60_000) {
            const message = 'O scanner demorou demais para responder.'
            await fetch('/api/scan/finalize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId: startData.jobId, projectId: project.id, error: message }),
            }).catch(() => {})
            toast.error(message)
            setPhase('idle')
            return
          }
          try {
            const res = await fetch(`/api/scan/status/${project.id}`)
            const st = await res.json()
            if (st.status === 'READY' || st.status === 'PUBLISHED') {
              router.push(`/projects/${project.id}`)
              return
            }
            if (st.status === 'ERROR') {
              toast.error(st.error || 'Erro ao clonar a página')
              setPhase('idle')
              return
            }
          } catch {
            /* a blip: try again */
          }
          stallTimer.current = setTimeout(poll, 4000)
        }
        poll()
      }

      const armStallTimer = () => {
        clearStallTimer()
        stallTimer.current = setTimeout(watchDatabase, STALL_TIMEOUT_MS)
      }
      armStallTimer()

      es.onmessage = async (ev) => {
        // Previously unguarded — any throw here (a malformed SSE line, a
        // dropped finalize fetch) was an unhandled rejection: no toast, no
        // phase reset, the progress bar just froze forever with zero
        // feedback. Every failure path in here must now report something.
        try {
          armStallTimer()
          const data = JSON.parse(ev.data)
          setProgress(data.progress ?? 0)
          setStep(data.currentStep ?? '')
          if (data.crawl_stats) setCrawlStats(data.crawl_stats)

          if (data.status === 'done') {
            clearStallTimer()
            es.close()
            // The scanner normally saves the clone itself (server to server):
            // nothing left to do but open it.
            if (data.delivered) {
              router.push(`/projects/${project.id}`)
              return
            }
            const savePayload = { jobId: startData.jobId, projectId: project.id, result: data.result }
            const outcome = await finalizeWithRetry(savePayload)
            if (!outcome.ok) {
              pendingSave.current = savePayload
              setSaveError(outcome.error ?? 'Falha ao salvar')
              setPhase('save-failed')
              return
            }
            router.push(`/projects/${project.id}`)
          }

          if (data.status === 'error') {
            clearStallTimer()
            es.close()
            toast.error(data.error ?? 'Erro ao clonar a página')
            setPhase('idle')
          }
        } catch (e: any) {
          clearStallTimer()
          es.close()
          toast.error(e.message ?? 'Erro inesperado ao processar o clone')
          setPhase('idle')
        }
      }
      es.onerror = () => {
        // A dropped connection is retried by the browser on its own and picks
        // up where it left off (the scanner numbers its events). Only a
        // connection that is really closed is a failure; the silence timer
        // above still catches a scanner that is truly gone.
        if (es.readyState === EventSource.CLOSED) {
          clearStallTimer()
          toast.error('Conexão com o scanner perdida')
          setPhase('idle')
        } else {
          setStep('Reconectando...')
        }
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao clonar')
      setPhase('idle')
    }
  }

  const handleRetrySave = async () => {
    if (!pendingSave.current) return
    setPhase('scanning')
    setStep('Salvando o clone...')
    const outcome = await finalizeWithRetry(pendingSave.current)
    if (!outcome.ok) {
      setSaveError(outcome.error ?? 'Falha ao salvar')
      setPhase('save-failed')
      return
    }
    router.push(`/projects/${pendingSave.current.projectId}`)
  }

  const cancelSave = async () => {
    // Without this, canceling here just resets the local UI: the project/scanJob stay in SCANNING in the DB forever, since the
    // clone genuinely did finish, it just never got persisted. Best-effort: if even this fails, the project is stuck either way.
    if (pendingSave.current) {
      await fetch('/api/scan/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: pendingSave.current.jobId, projectId: pendingSave.current.projectId, error: 'Usuário cancelou após falha ao salvar.' }),
      }).catch(() => {})
    }
    pendingSave.current = null
    setSaveError(null)
    setPhase('idle')
  }

  const busy = phase !== 'idle' && phase !== 'save-failed'

  // Shown as a placeholder (not written into `name`) so a keystroke in the
  // URL field never silently overwrites something the user already typed
  // here — leaving the field untouched sends name: undefined, and the
  // server falls back to this exact same "Clone de {host}" string anyway.
  const namePlaceholder = (() => {
    const trimmed = url.trim()
    if (!trimmed) return 'Nome do projeto'
    try {
      const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
      return `Clone de ${new URL(withProto).hostname}`
    } catch {
      return 'Nome do projeto'
    }
  })()

  if (variant === 'workspace') {
    const host = (() => { try { return new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`).hostname.replace(/^www\./, '') } catch { return '' } })()
    return (
      <section className="relative isolate overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0818]/70 px-5 py-12 shadow-2xl shadow-violet-950/30 sm:px-12 sm:py-16">
        {/* the room: a soft light from above and a fading grid, nothing that competes with the field */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-80 w-[760px] -translate-x-1/2 rounded-full bg-violet-600/25 blur-[110px]" />
          <div className="absolute -bottom-40 right-[-8%] h-72 w-72 rounded-full bg-blue-600/15 blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)', backgroundSize: '44px 44px', maskImage: 'radial-gradient(ellipse 70% 80% at 50% 30%, black 20%, transparent 75%)', WebkitMaskImage: 'radial-gradient(ellipse 70% 80% at 50% 30%, black 20%, transparent 75%)' }} />
        </div>

        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 to-blue-500 shadow-lg shadow-violet-600/40 ring-1 ring-white/20">
            <Wand2 className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {heading ?? <>Clone qualquer <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-blue-300 bg-clip-text text-transparent">página</span></>}
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-pretty text-base text-gray-400">
            {subheading ?? 'Cole o link de uma página e a gente clona ela de verdade: visual, textos e imagens reais.'}
          </p>

          <div className="mx-auto mt-10 max-w-2xl text-left">
            {phase === 'save-failed' ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
                <p className="mb-1 text-sm font-medium text-red-400">O clone terminou, mas salvar falhou</p>
                <p className="mb-4 text-xs text-red-400/70">{saveError}</p>
                <div className="flex gap-2">
                  <button onClick={handleRetrySave} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:from-violet-500 hover:to-blue-500">Tentar salvar de novo</button>
                  <button onClick={cancelSave} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-400 hover:text-white">Cancelar</button>
                </div>
              </div>
            ) : !busy ? (
              <>
                <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-black/35 p-2 shadow-xl shadow-black/30 backdrop-blur transition focus-within:border-violet-400/60 focus-within:shadow-[0_0_0_4px_rgba(139,92,246,0.16)]">
                  <Link2 className="ml-3 hidden h-5 w-5 shrink-0 text-gray-500 sm:block" />
                  <input
                    ref={urlInput}
                    type="text"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleClone()}
                    placeholder="https://exemplo.com/pagina-de-vendas"
                    aria-label="Endereço da página para clonar"
                    className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base text-white placeholder:text-gray-500 focus:outline-none"
                    autoFocus={!initialUrl}
                  />
                  <button
                    onClick={handleClone}
                    disabled={!url.trim()}
                    className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:from-violet-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-40 sm:px-7"
                  >
                    Clonar
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 min-h-[24px] px-2 text-sm text-gray-500">
                  {url.trim() && !editingName && (
                    <p>O projeto vai se chamar <span className="text-gray-300">{name.trim() || namePlaceholder}</span> <button onClick={() => setEditingName(true)} className="ml-1 text-violet-300 underline-offset-2 hover:underline">mudar o nome</button></p>
                  )}
                  {url.trim() && editingName && (
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
                      <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleClone()} placeholder={namePlaceholder} aria-label="Nome do projeto" className="min-w-0 flex-1 bg-transparent py-1 text-sm text-white placeholder:text-gray-500 focus:outline-none" />
                    </div>
                  )}
                  {url.trim() && editingName && <p className="mt-2 text-xs text-gray-600">É só o nome no seu painel. O endereço do site você escolhe depois, na hora de publicar.</p>}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/35 p-6 backdrop-blur">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15"><Loader2 className="h-4 w-4 animate-spin text-violet-300" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{step || 'Processando...'}</p>
                    {host && <p className="truncate text-xs text-gray-500">{host}</p>}
                  </div>
                  <span className="ml-auto text-sm tabular-nums text-gray-400">{Math.round(progress)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-300" style={{ width: `${Math.max(4, progress)}%` }} />
                </div>
                {crawlStats && (
                  <p className="mt-3 text-xs text-gray-500">
                    {crawlStats.found} página(s) encontrada(s) · {crawlStats.completed} clonada(s)
                    {crawlStats.failed > 0 ? ` · ${crawlStats.failed} falhou/falharam` : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-10 text-center shadow-2xl shadow-violet-950/40">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[500px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[100px]" />
      <div className="relative">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 to-blue-500 shadow-lg shadow-violet-600/40">
          <Wand2 className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{heading ?? 'Clone qualquer página'}</h1>
        <p className="mx-auto mt-2 max-w-md px-2 text-sm text-gray-400">
          {subheading ?? 'Cole o link de uma página e a gente clona ela de verdade: visual, textos e imagens reais.'}
        </p>

        <div className="mx-auto mt-8 max-w-xl px-2">
          {phase === 'save-failed' ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-left">
              <p className="mb-1 text-sm font-medium text-red-400">O clone terminou, mas salvar falhou</p>
              <p className="mb-4 text-xs text-red-400/70">{saveError}</p>
              <div className="flex gap-2">
                <button
                  onClick={handleRetrySave}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:from-violet-500 hover:to-blue-500"
                >
                  Tentar salvar de novo
                </button>
                <button
                  onClick={cancelSave}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : !busy ? (
            <div className="space-y-2">
              <div className="flex flex-col items-stretch gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 shadow-inner sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleClone()}
                  placeholder="https://exemplo.com/pagina-de-vendas"
                  className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none"
                  autoFocus={!initialUrl}
                />
                <button
                  onClick={handleClone}
                  disabled={!url.trim()}
                  className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:from-violet-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clonar
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 shadow-inner">
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleClone()}
                  placeholder={namePlaceholder}
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none"
                />
              </div>
              <p className="px-2 text-left text-[11px] text-gray-500">
                Esse é só o nome do projeto no seu painel — o endereço do site (domínio) você escolhe depois, na hora de publicar.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-200">
                <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                {step || 'Processando...'}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-300"
                  style={{ width: `${Math.max(4, progress)}%` }}
                />
              </div>
              {crawlStats && (
                <p className="mt-3 text-xs text-gray-500">
                  {crawlStats.found} página(s) encontrada(s) · {crawlStats.completed} clonada(s)
                  {crawlStats.failed > 0 ? ` · ${crawlStats.failed} falhou/falharam` : ''}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
