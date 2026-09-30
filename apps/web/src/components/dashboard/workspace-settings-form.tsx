'use client'

import { useState } from 'react'
import { Building2, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function WorkspaceSettingsForm({ name: initialName }: { name: string }) {
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      toast.success('Configurações salvas')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-3 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-200">Workspace</h3>
      </div>
      <label className="mb-1.5 block text-xs text-gray-500">Nome</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 focus:border-violet-500 focus:outline-none"
        />
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:from-violet-500 hover:to-blue-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </button>
      </div>
    </div>
  )
}
