'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Info, Loader2, ShieldCheck, XCircle } from 'lucide-react'

export interface CloneReview {
  ok: boolean
  warnings: number
  at?: string
  items: { status: 'ok' | 'warn' | 'bad' | 'info'; title: string; detail: string }[]
}

const LOOK = {
  ok: { icon: CheckCircle2, color: 'text-emerald-300', dot: 'bg-emerald-400/15' },
  warn: { icon: AlertTriangle, color: 'text-amber-300', dot: 'bg-amber-400/15' },
  bad: { icon: XCircle, color: 'text-rose-300', dot: 'bg-rose-400/15' },
  info: { icon: Info, color: 'text-sky-300', dot: 'bg-sky-400/15' },
} as const

/**
 * What the automatic review found when it opened the original and the clone side by side. While it is
 * still running (a minute or so after the clone finishes) the card says so and checks back by itself.
 */
export function CloneReviewCard({ review, waiting }: { review: CloneReview | null; waiting: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (review || !waiting) return
    const t = setInterval(() => router.refresh(), 7000)
    const stop = setTimeout(() => clearInterval(t), 4 * 60_000)
    return () => { clearInterval(t); clearTimeout(stop) }
  }, [review, waiting, router])

  if (!review && !waiting) return null
  if (!review) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm text-zinc-300">
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
        Conferindo o clone com o original, no computador e no celular...
      </div>
    )
  }
  const bad = review.items.filter(i => i.status === 'bad').length
  return (
    <div className={`rounded-2xl border p-4 ${bad ? 'border-rose-400/25 bg-rose-400/[0.05]' : review.warnings ? 'border-amber-400/20 bg-amber-400/[0.04]' : 'border-emerald-400/20 bg-emerald-400/[0.04]'}`}>
      <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-white">
        <ShieldCheck className={`h-4 w-4 ${bad ? 'text-rose-300' : review.warnings ? 'text-amber-300' : 'text-emerald-300'}`} />
        Conferência automática
        <span className="text-xs font-normal text-zinc-500">{bad ? 'tem coisa pra arrumar' : review.warnings ? 'quase tudo certo' : 'tudo certo'}</span>
      </div>
      <ul className="space-y-2">
        {review.items.map((i, k) => {
          const L = LOOK[i.status]
          return (
            <li key={k} className="flex items-start gap-2.5">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${L.dot}`}><L.icon className={`h-3 w-3 ${L.color}`} /></span>
              <div className="min-w-0">
                <p className={`text-sm font-medium ${L.color}`}>{i.title}</p>
                <p className="text-xs leading-relaxed text-zinc-400">{i.detail}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
