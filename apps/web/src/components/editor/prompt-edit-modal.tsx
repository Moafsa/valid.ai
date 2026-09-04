'use client'

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function PromptEditModal({
  isOpen,
  onClose,
  blockId,
  currentCode,
  onUpdated,
}: {
  isOpen: boolean
  onClose: () => void
  blockId: string
  currentCode: string
  onUpdated?: (newCode: string) => void
}) {
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleUpdate = async () => {
    if (!instruction.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/editor/update-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId, currentCode, instruction }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erro na atualização')
      }

      const data = await res.json()
      toast.success('Bloco atualizado via IA!')
      onUpdated?.(data.code)
      onClose()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Editar Seção com IA</h3>
            <p className="text-xs text-gray-500">Descreva as alterações que você deseja fazer nesta seção</p>
          </div>
        </div>

        <textarea
          rows={4}
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          placeholder="Ex: 'Altere a cor do botão principal para verde vibrante, aumente o título para 3xl e adicione um selo de garantia de 7 dias ao lado do CTA'"
          className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 mb-4"
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleUpdate}
            disabled={loading || !instruction.trim()}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Aplicando...' : 'Aplicar com IA'}
          </button>
        </div>
      </div>
    </div>
  )
}
