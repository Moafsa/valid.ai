'use client'

import { useState } from 'react'
import { ShieldAlert, Loader2, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'

interface CloakerResult {
  detected: boolean
  similarity_ratio: number
  version_a_length: number
  version_b_length: number
  ai_analysis?: string | null
}

export function CloakerCheckButton() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CloakerResult | null>(null)

  const reset = () => {
    setOpen(false)
    setUrl('')
    setResult(null)
  }

  const handleCheck = async () => {
    if (!url.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/scan/detect-cloaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro na análise')
      setResult(data)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <ShieldAlert className="h-4 w-4" />
        Verificar Cloaker
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Verificar Cloaker</h2>
              <p className="text-xs text-gray-500">Compara o que um bot vê com o que tráfego pago vê</p>
            </div>
          </div>
          <button onClick={reset} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex gap-2">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://exemplo.com/lp"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
          <button
            onClick={handleCheck}
            disabled={loading || !url.trim()}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
            Analisar
          </button>
        </div>

        {result && (
          <div className="mt-5 space-y-3">
            {result.detected ? (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                <ShieldAlert className="h-5 w-5 text-red-600 flex-shrink-0" />
                <p className="text-sm font-semibold text-red-700">⚠️ Possível cloaking detectado</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0" />
                <p className="text-sm font-semibold text-green-700">Nenhuma divergência significativa encontrada</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs text-gray-400 mb-1">Similaridade A × B</p>
                <p className="font-mono font-semibold text-gray-800">
                  {(result.similarity_ratio * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs text-gray-400 mb-1">Tamanho HTML (A / B)</p>
                <p className="font-mono font-semibold text-gray-800">
                  {result.version_a_length.toLocaleString('pt-BR')} / {result.version_b_length.toLocaleString('pt-BR')}
                </p>
              </div>
            </div>

            {result.ai_analysis && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">Análise da IA</p>
                <p className="text-sm text-gray-700">{result.ai_analysis}</p>
              </div>
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-gray-400">
          Versão A: acesso sem UTM (simula bot/revisor). Versão B: acesso com UTM + fbclid (simula tráfego pago real).
        </p>
      </div>
    </div>
  )
}
