'use client'

import { useState } from 'react'
import { Shield, Search, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'

export default function CloakerPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleScan = async () => {
    if (!url) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/scanner/detect-cloaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ error: 'Falha ao analisar a URL' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scanner Anti-Cloaker</h1>
        <p className="text-sm text-gray-500 mt-1">
          Verifique se uma URL exibe conteúdo diferente para robôs/revisores vs. tráfego pago real.
        </p>
      </div>

      {/* Input */}
      <div className="flex gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://exemplo.com/lp-suspeita"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleScan}
          disabled={loading || !url}
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
          {loading ? 'Analisando...' : 'Analisar Cloaker'}
        </button>
      </div>

      {/* Result Report */}
      {result && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-4">
            {result.detected ? (
              <div className="h-12 w-12 rounded-2xl bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            ) : (
              <div className="h-12 w-12 rounded-2xl bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {result.detected ? '⚠️ Cloaking Detectado!' : '✅ Nenhum Cloaking Detectado'}
              </h3>
              <p className="text-sm text-gray-500">
                Similaridade entre versão bot e usuário real: {((result.similarity_ratio ?? 1) * 100).toFixed(1)}%
              </p>
            </div>
          </div>

          {result.ai_analysis && (
            <div className="rounded-xl bg-gray-50 p-4 border border-gray-200">
              <p className="text-xs font-semibold text-gray-700 mb-1">Análise da IA:</p>
              <p className="text-sm text-gray-600 leading-relaxed">{result.ai_analysis}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
