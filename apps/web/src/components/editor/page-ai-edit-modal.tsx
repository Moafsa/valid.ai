'use client'

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface EditableBlock {
  id: string
  code: string
}

export function PageAiEditModal({
  isOpen,
  onClose,
  selectedBlock,
  allBlocks,
  onApplied,
}: {
  isOpen: boolean
  onClose: () => void
  selectedBlock: EditableBlock | null
  allBlocks: EditableBlock[]
  onApplied: (results: EditableBlock[]) => void
}) {
  const [scope, setScope] = useState<'section' | 'page'>(selectedBlock ? 'section' : 'page')
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')

  if (!isOpen) return null

  const targets = scope === 'section' && selectedBlock ? [selectedBlock] : allBlocks

  const handleApply = async () => {
    if (!instruction.trim() || targets.length === 0) return
    setLoading(true)
    let done = 0
    try {
      // Same single-block AI-edit endpoint used everywhere else in the
      // editor — "whole page" just means running it once per unlocked
      // section with the same instruction, instead of inventing a new
      // combined-HTML AI pipeline that could scramble block boundaries.
      const results = await Promise.all(
        targets.map(async (block) => {
          const res = await fetch('/api/editor/update-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blockId: block.id, currentCode: block.code, instruction }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error || `Erro ao editar seção ${block.id}`)
          }
          const data = await res.json()
          done += 1
          setProgress(`${done}/${targets.length} seções`)
          return { id: block.id, code: data.code as string }
        })
      )
      toast.success(
        targets.length > 1 ? `${targets.length} seções atualizadas via IA!` : 'Seção atualizada via IA!'
      )
      onApplied(results)
      onClose()
      setInstruction('')
    } catch (e: any) {
      toast.error(e.message || 'Erro ao aplicar com IA')
    } finally {
      setLoading(false)
      setProgress('')
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
            <h3 className="font-bold text-gray-900">Editar com IA</h3>
            <p className="text-xs text-gray-500">Descreva a alteração — escolha onde ela se aplica</p>
          </div>
        </div>

        <div className="flex gap-2 mb-1.5">
          <button
            type="button"
            onClick={() => setScope('section')}
            disabled={!selectedBlock}
            className={`flex-1 rounded-xl border py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
              scope === 'section'
                ? 'border-purple-600 bg-purple-50 text-purple-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Só a seção selecionada
          </button>
          <button
            type="button"
            onClick={() => setScope('page')}
            className={`flex-1 rounded-xl border py-2 text-sm font-medium ${
              scope === 'page'
                ? 'border-purple-600 bg-purple-50 text-purple-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Página inteira ({allBlocks.length} seções)
          </button>
        </div>
        {scope === 'section' && !selectedBlock && (
          <p className="text-xs text-amber-600 mb-3">Clique numa seção no canvas pra editar só ela.</p>
        )}
        {(scope !== 'section' || selectedBlock) && <div className="mb-3" />}

        <textarea
          rows={4}
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          placeholder="Ex: 'Troque a cor de fundo dos botões para verde vibrante'"
          className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 mb-4"
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
            onClick={handleApply}
            disabled={loading || !instruction.trim() || targets.length === 0}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? progress || 'Aplicando...' : 'Aplicar com IA'}
          </button>
        </div>
      </div>
    </div>
  )
}
