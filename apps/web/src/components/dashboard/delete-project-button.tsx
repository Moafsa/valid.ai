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
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!confirming) {
      setConfirming(true)
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Falha ao excluir')
      if (redirectTo) router.push(redirectTo)
      else router.refresh()
    } catch {
      toast.error('Erro ao excluir projeto')
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      onMouseLeave={() => setConfirming(false)}
      title={confirming ? 'Clique de novo para confirmar' : 'Excluir'}
      className={`flex h-8 w-8 items-center justify-center rounded-lg backdrop-blur transition ${
        overlay ? 'absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100' : ''
      } ${confirming ? 'bg-red-600 text-white opacity-100' : 'bg-black/50 text-gray-300 hover:bg-black/70 hover:text-red-400'}`}
    >
      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  )
}
