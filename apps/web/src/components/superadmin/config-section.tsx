'use client'
import { useState } from 'react'
import { Eye, EyeOff, Save, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Field {
  readonly key: string
  readonly label: string
  readonly description?: string
  readonly isSecret?: boolean
}

interface ConfigSectionProps {
  category: { id: string; label: string; description: string }
  fields: readonly Field[]
  savedMap: Record<string, any>
}

export function ConfigSection({ category, fields, savedMap }: ConfigSectionProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setResult(null)
    try {
      const payload = Object.entries(values)
        .filter(([, v]) => v.trim() !== '')
        .map(([key, value]) => {
          const field = fields.find(f => f.key === key)
          return { key, value, label: field?.label ?? key, category: category.id, isSecret: field?.isSecret !== false }
        })

      if (payload.length === 0) {
        setSaving(false)
        return
      }

      const res = await fetch('/api/superadmin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: payload }),
      })
      setResult(res.ok ? 'success' : 'error')
    } catch {
      setResult('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50">
        <h3 className="font-semibold text-white">{category.label}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{category.description}</p>
      </div>

      <div className="p-6 space-y-4">
        {fields.map(field => {
          const isSaved = !!savedMap[field.key]
          const isVisible = visible[field.key]
          const isSecret = field.isSecret !== false

          return (
            <div key={field.key}>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-sm font-medium text-gray-300">{field.label}</label>
                {isSaved && (
                  <span className="text-xs bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded-full">
                    configurado
                  </span>
                )}
              </div>
              {field.description && (
                <p className="text-xs text-gray-500 mb-1.5">{field.description}</p>
              )}
              <div className="relative">
                <input
                  type={isSecret && !isVisible ? 'password' : 'text'}
                  placeholder={isSaved ? '••••••••••••••••' : `Digite ${field.label}`}
                  value={values[field.key] ?? ''}
                  onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 font-mono"
                />
                {isSecret && (
                  <button
                    type="button"
                    onClick={() => setVisible(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
              </div>
            </div>
          )
        })}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
          {result === 'success' && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <CheckCircle className="h-3.5 w-3.5" /> Salvo com sucesso
            </span>
          )}
          {result === 'error' && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5" /> Erro ao salvar
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
