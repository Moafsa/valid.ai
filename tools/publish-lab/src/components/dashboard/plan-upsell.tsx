import Link from 'next/link'
import { Lock } from 'lucide-react'

/** What a person sees where their plan does not include something: why, and where to change it. */
export function PlanUpsell({ title, message, compact = false }: { title: string; message: string; compact?: boolean }) {
  return (
    <div className={`mx-auto flex max-w-xl flex-col items-center rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] text-center ${compact ? 'p-6' : 'p-10'}`}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300"><Lock className="h-5 w-5" /></div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-gray-400">{message}</p>
      <Link href="/settings" className="mt-5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 hover:from-violet-500 hover:to-blue-500">Ver meu plano</Link>
    </div>
  )
}
