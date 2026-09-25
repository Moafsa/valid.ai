'use client'

import { useState } from 'react'
import { Globe, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'

const COUNTRIES = [
  { id: 'ES-MX', flag: '🇲🇽', name: 'México (ES-MX)', currency: 'MXN' },
  { id: 'ES-CO', flag: '🇨🇴', name: 'Colômbia (ES-CO)', currency: 'COP' },
  { id: 'ES-AR', flag: '🇦🇷', name: 'Argentina (ES-AR)', currency: 'ARS' },
  { id: 'ES-ES', flag: '🇪🇸', name: 'Espanha (ES-ES)', currency: 'EUR' },
  { id: 'EN-US', flag: '🇺🇸', name: 'Estados Unidos (EN-US)', currency: 'USD' },
  { id: 'EN-GB', flag: '🇬🇧', name: 'Reino Unido (EN-GB)', currency: 'GBP' },
]

export function TranslationModal({
  isOpen,
  onClose,
  projectId,
  onTranslated,
}: {
  isOpen: boolean
  onClose: () => void
  projectId: string
  onTranslated?: (newProjectId: string) => void
}) {
  const [selectedCountry, setSelectedCountry] = useState('ES-MX')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleTranslate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/editor/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, targetCountry: selectedCountry }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Erro na tradução')
      }

      toast.success('Tradução cultural concluída! Abrindo o novo projeto...')
      onTranslated?.(data.projectId)
      onClose()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-brand-100 flex items-center justify-center">
            <Globe className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Tradutor Cultural IA</h3>
            <p className="text-xs text-gray-500">Cria uma cópia do projeto adaptada a outro país — o original não é alterado</p>
          </div>
        </div>

        <div className="space-y-2 mb-6">
          {COUNTRIES.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCountry(c.id)}
              className={`w-full flex items-center justify-between rounded-xl border p-3 text-sm font-medium transition-all ${
                selectedCountry === c.id
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{c.flag}</span>
                <span>{c.name}</span>
              </div>
              {selectedCountry === c.id && <Check className="h-4 w-4 text-brand-600" />}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleTranslate}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            {loading ? 'Traduzindo...' : 'Criar Versão Traduzida'}
          </button>
        </div>
      </div>
    </div>
  )
}
