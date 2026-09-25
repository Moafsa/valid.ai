'use client'

import { useState } from 'react'
import { Plus, Link as LinkIcon, Loader2, Search, ImageIcon, MousePointerClick, FileText, ShieldAlert, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

const PAGE_TYPE_LABELS: Record<string, string> = {
  LP: 'Landing Page',
  QUIZ: 'Quiz Funil',
  VSL: 'VSL',
  CHECKOUT: 'Checkout',
}

interface Summary {
  page_type: string
  images_count: number
  videos_count: number
  forms_count: number
  buttons_count: number
  links_count: number
  scripts_count: number
  pixels: { type: string; id: string }[]
  possible_cloaking: boolean
  cloaking_similarity: number | null
}

type Step = 'closed' | 'url' | 'summary'

export function NewProjectButton() {
  const [step, setStep] = useState<Step>('closed')
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const router = useRouter()

  const reset = () => {
    setStep('closed')
    setUrl('')
    setName('')
    setSummary(null)
    setError('')
  }

  const handleAnalyze = async () => {
    setError('')
    try {
      new URL(url)
    } catch {
      setError('Por favor insira uma URL válida (ex: https://exemplo.com)')
      return
    }

    setAnalyzing(true)
    try {
      const res = await fetch('/api/scan/quick-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Não foi possível analisar essa URL')
      setSummary(data)
      setStep('summary')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleCreate = async () => {
    if (name.trim().length < 2) {
      setError('Dê um nome ao projeto (ao menos 2 caracteres)')
      return
    }
    setError('')
    setCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erro ao criar projeto')
      }

      const project = await res.json()
      toast.success('Projeto criado! Iniciando clonagem...')
      reset()
      router.push(`/projects/${project.id}`)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreating(false)
    }
  }

  if (step === 'closed') {
    return (
      <button
        onClick={() => setStep('url')}
        className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Novo Projeto
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        {step === 'url' && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Novo Projeto</h2>
            <p className="text-sm text-gray-500 mb-6">Cole a URL do funil que você quer clonar. Antes de clonar, mostramos o que encontramos na página.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL do Funil</label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                    placeholder="https://exemplo.com/lp"
                    autoFocus
                    className="w-full rounded-lg border border-gray-300 pl-9 pr-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={reset}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing || !url.trim()}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {analyzing ? 'Analisando...' : 'Analisar'}
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'summary' && summary && (
          <>
            <button
              onClick={() => setStep('url')}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-3"
            >
              <ArrowLeft className="h-3 w-3" />
              Trocar URL
            </button>

            <h2 className="text-lg font-bold text-gray-900 mb-1">
              Encontramos {PAGE_TYPE_LABELS[summary.page_type] ?? summary.page_type.toLowerCase()}
            </h2>
            <p className="text-sm text-gray-500 mb-4 truncate">{url}</p>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="rounded-lg border border-gray-200 p-2.5 text-center">
                <ImageIcon className="h-4 w-4 text-gray-400 mx-auto mb-1" />
                <p className="text-sm font-bold text-gray-900">{summary.images_count}</p>
                <p className="text-[10px] text-gray-400">imagens</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-2.5 text-center">
                <MousePointerClick className="h-4 w-4 text-gray-400 mx-auto mb-1" />
                <p className="text-sm font-bold text-gray-900">{summary.buttons_count}</p>
                <p className="text-[10px] text-gray-400">botões</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-2.5 text-center">
                <FileText className="h-4 w-4 text-gray-400 mx-auto mb-1" />
                <p className="text-sm font-bold text-gray-900">{summary.forms_count}</p>
                <p className="text-[10px] text-gray-400">formulários</p>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              {summary.videos_count > 0 && `${summary.videos_count} vídeo(s), `}
              {summary.links_count} links, {summary.scripts_count} scripts externos
              {summary.pixels.length > 0 && `, ${summary.pixels.length} pixel(s) de rastreamento (${summary.pixels.map(p => p.type).join(', ')})`}.
            </p>

            {summary.possible_cloaking && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-4">
                <ShieldAlert className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  ⚠️ Possível mecanismo de entrega diferenciada (cloaking) detectado
                  {summary.cloaking_similarity != null && ` — ${(summary.cloaking_similarity * 100).toFixed(0)}% de similaridade entre acessos`}.
                  Vamos clonar a versão real capturada.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Projeto</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="ex: LP Principal - Produto X"
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={reset}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creating ? 'Criando...' : 'Clonar Funil'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
