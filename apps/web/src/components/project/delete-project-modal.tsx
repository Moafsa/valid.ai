'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

export function DeleteProjectModal({
  isOpen,
  onClose,
  projectId,
  projectName,
}: {
  isOpen: boolean
  onClose: () => void
  projectId: string
  projectName: string
}) {
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  if (!isOpen) return null

  const canDelete = confirmText.trim() === projectName

  const handleDelete = async () => {
    if (!canDelete) return
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erro ao excluir projeto')
      }
      toast.success('Projeto excluído')
      router.push('/dashboard')
    } catch (e: any) {
      toast.error(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Excluir projeto</h3>
            <p className="text-xs text-gray-500">Essa ação não pode ser desfeita</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Isso apaga permanentemente <strong>{projectName}</strong>, todas as suas páginas, leads e
          histórico de uso de IA.
        </p>

        <label className="block text-xs font-medium text-gray-500 mb-1.5">
          Digite <strong>{projectName}</strong> para confirmar
        </label>
        <input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 mb-4"
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={loading || !canDelete}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {loading ? 'Excluindo...' : 'Excluir permanentemente'}
          </button>
        </div>
      </div>
    </div>
  )
}
