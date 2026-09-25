'use client'

import { useState } from 'react'
import { Radio, Plus, Trash2, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

const TYPE_LABELS: Record<string, string> = {
  META_PIXEL: 'Meta Pixel',
  TIKTOK_PIXEL: 'TikTok Pixel',
  GOOGLE_TAG: 'Google Tag',
  GOOGLE_ANALYTICS: 'Google Analytics',
  GTM: 'Google Tag Manager',
  CUSTOM: 'Personalizado',
}

interface Tracking {
  id: string
  type: string
  pixelId: string | null
  isActive: boolean
  isNew?: boolean
}

export function TrackingPanel({
  projectId,
  initialTrackings,
}: {
  projectId: string
  initialTrackings: Tracking[]
}) {
  const [trackings, setTrackings] = useState<Tracking[]>(initialTrackings)
  const [saving, setSaving] = useState(false)

  const update = (id: string, patch: Partial<Tracking>) => {
    setTrackings(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
  }

  const remove = (id: string) => {
    setTrackings(prev => prev.filter(t => t.id !== id))
  }

  const addNew = () => {
    setTrackings(prev => [
      ...prev,
      { id: `new_${Date.now()}`, type: 'META_PIXEL', pixelId: '', isActive: true, isNew: true },
    ])
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/trackings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackings: trackings
            .filter(t => t.pixelId?.trim())
            .map(t => ({ type: t.type, pixelId: t.pixelId, isActive: t.isActive })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar')
      setTrackings(data.trackings)
      toast.success('Rastreamentos salvos! Já valem para a próxima publicação.')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-brand-600" />
          <h2 className="font-semibold text-gray-900 text-sm">Rastreamentos</h2>
          <span className="text-xs text-gray-400">{trackings.length} configurado(s)</span>
        </div>
        <button
          onClick={addNew}
          className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar
        </button>
      </div>

      <div className="p-5 space-y-3">
        {trackings.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            Nenhum pixel detectado no scan. Adicione manualmente se quiser rastrear conversões.
          </p>
        )}

        {trackings.map(t => (
          <div key={t.id} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2.5">
            <select
              value={t.type}
              onChange={e => update(t.id, { type: e.target.value })}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 focus:border-brand-500 focus:outline-none"
            >
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input
              value={t.pixelId ?? ''}
              onChange={e => update(t.id, { pixelId: e.target.value })}
              placeholder="ID do pixel"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-mono focus:border-brand-500 focus:outline-none"
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={t.isActive}
                onChange={e => update(t.id, { isActive: e.target.checked })}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Ativo
            </label>
            <button
              onClick={() => remove(t.id)}
              className="text-gray-300 hover:text-red-500 p-1"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 mt-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Salvando...' : 'Salvar rastreamentos'}
        </button>
        <p className="text-xs text-gray-400 text-center">
          Só rastreamentos <strong>ativos</strong> com ID preenchido são injetados na página publicada.
        </p>
      </div>
    </div>
  )
}
