'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wand2, Loader2, ArrowRight } from 'lucide-react'
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
export function CloneHero() {
  const router = useRouter()
  const [url, setUrl] = useState('')
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
        body: JSON.stringify({ projectId: project.id, url: normalized }),
      })
      const startData = await startRes.json()
      if (!startRes.ok) throw new Error(startData.error ?? 'Erro ao iniciar clonagem')

      setPhase('scanning')

      const es = new EventSource(`/api/scan/progress/${startData.jobId}`)

      const armStallTimer = () => {
        clearStallTimer()
        stallTimer.current = setTimeout(async () => {
          es.close()
          const message = 'O scanner parou de responder (pode ter reiniciado ou travado).'
          // Reuses finalize's existing scanError branch — flips the
          // project/job to ERROR server-side too, so it doesn't sit
          // forever in SCANNING even if this tab is closed right after.
          await fetch('/api/scan/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: startData.jobId, projectId: project.id, error: message }),
          }).catch(() => {})
          toast.error(message)
          setPhase('idle')
        }, STALL_TIMEOUT_MS)
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
        clearStallTimer()
        es.close()
        toast.error('Conexão com o scanner perdida')
        setPhase('idle')
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

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-10 text-center shadow-2xl shadow-violet-950/40">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[500px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[100px]" />
      <div className="relative">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 to-blue-500 shadow-lg shadow-violet-600/40">
          <Wand2 className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Clone qualquer página</h1>
        <p className="mx-auto mt-2 max-w-md px-2 text-sm text-gray-400">
          Cole o link de uma página e a gente clona ela de verdade: visual, textos e imagens reais.
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
                  onClick={async () => {
                    // Without this, canceling here just resets the local
                    // UI — the project/scanJob stay in SCANNING in the DB
                    // forever, since the clone genuinely did finish, it
                    // just never got persisted. Best-effort: if even this
                    // fails, the project is stuck either way and there's
                    // nothing more to retry from this screen.
                    if (pendingSave.current) {
                      await fetch('/api/scan/finalize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          jobId: pendingSave.current.jobId,
                          projectId: pendingSave.current.projectId,
                          error: 'Usuário cancelou após falha ao salvar.',
                        }),
                      }).catch(() => {})
                    }
                    pendingSave.current = null
                    setSaveError(null)
                    setPhase('idle')
                  }}
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
                  autoFocus
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
