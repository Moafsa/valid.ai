'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function DeleteProjectButton({
  projectId,
  redirectTo,
  overlay = true,
}: {
  projectId: string
  /** Where to navigate after deleting — omit to just router.refresh() (e.g. removing a card from a grid in place). */
  redirectTo?: string
  /** true (default): absolute-positioned, hover-revealed — for overlaying a thumbnail inside a `group` container. false: a plain inline button. */
  overlay?: boolean
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  // A same-button two-click "arm, then confirm" pattern (what this used to
  // be) is fragile on a 32px hover-revealed target: any state tracking
  // between the two clicks (a timeout, onMouseLeave, anything) is a window
  // where a real click can silently land as the wrong one, with no
  // feedback — reported more than once as "clico e não exclui nada". A
  // native confirm() has none of that: it's modal, blocks everything else,
  // and there is no second click to mistime or miss.
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (deleting) return
    if (!window.confirm('Excluir este projeto? Essa ação não pode ser desfeita.')) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Falha ao excluir')
      if (redirectTo) router.push(redirectTo)
      else router.refresh()
    } catch {
      toast.error('Erro ao excluir projeto')
      setDeleting(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      title="Excluir"
      className={`flex h-8 w-8 items-center justify-center rounded-lg backdrop-blur transition bg-black/50 text-gray-300 hover:bg-black/70 hover:text-red-400 ${
        overlay ? 'absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100' : ''
      }`}
    >
      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  )
}
