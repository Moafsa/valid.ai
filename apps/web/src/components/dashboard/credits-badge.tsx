'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'

interface State { used: number; limit: number | null; plan: string; bonus: number; remaining: number | null }

/** The signed-in account's AI credits (plan allowance left this month + extra credits), always visible in the top bar. */
export function CreditsBadge() {
  const [c, setC] = useState<State | null>(null)
  const load = useCallback(() => { fetch('/api/ai/credits', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => d && setC(d)).catch(() => {}) }, [])
  useEffect(() => {
    load()
    const again = () => { if (document.visibilityState === 'visible') load() }
    const timer = setInterval(again, 60_000)
    window.addEventListener('focus', again)
    return () => { clearInterval(timer); window.removeEventListener('focus', again) }
  }, [load])
  if (!c) return null
  const out = c.remaining !== null && c.remaining <= 0
  const label = c.remaining === null ? 'Ilimitado' : c.remaining.toLocaleString('pt-BR')
  const tip = c.remaining === null
    ? `Plano ${c.plan}: créditos de IA sem limite.`
    : `Plano ${c.plan}: ${Math.max(0, (c.limit ?? 0) - c.used).toLocaleString('pt-BR')} no mês${c.bonus > 0 ? ` + ${c.bonus.toLocaleString('pt-BR')} extras` : ''}.`
  return (
    <Link href="/settings" title={tip} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${out ? 'border-red-400/30 bg-red-500/10 text-red-300' : 'border-white/10 bg-white/[0.04] text-gray-200 hover:bg-white/10'}`}>
      <Sparkles className="h-3.5 w-3.5 text-violet-300" />
      <span>{label}</span>
      <span className="hidden font-normal text-gray-500 sm:inline">créditos de IA</span>
    </Link>
  )
}
