'use client'
import { Plus } from 'lucide-react'

/** The first tile of the grid: brings the person back to the field at the top (the clone starts there). */
export function NewCloneCard() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('vai:focus-clone'))}
      className="group flex min-h-[110px] flex-col sm:min-h-[260px] items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.015] text-gray-400 transition duration-300 hover:border-violet-400/50 hover:bg-violet-500/[0.05] hover:text-white"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06] transition group-hover:bg-violet-500/20 group-hover:text-violet-200"><Plus className="h-5 w-5" /></span>
      <span className="text-sm font-medium">Clonar outra página</span>
    </button>
  )
}
