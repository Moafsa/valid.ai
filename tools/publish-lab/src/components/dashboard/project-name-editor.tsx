'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'

export function ProjectNameEditor({ projectId, initialName }: { projectId: string; initialName: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const startEditing = () => {
    setValue(initialName)
    setEditing(true)
    // Focus happens after the input mounts — a plain requestAnimationFrame
    // is enough since there's no async data fetch gating the render.
    requestAnimationFrame(() => inputRef.current?.select())
  }

  const commit = async () => {
    const trimmed = value.trim()
    if (!trimmed || trimmed === initialName) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) throw new Error('Falha ao renomear')
      setEditing(false)
      router.refresh()
    } catch {
      toast.error('Erro ao renomear o projeto')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        disabled={saving}
        className="rounded-lg border border-violet-500/40 bg-white/5 px-2 py-0.5 text-lg font-semibold text-white focus:outline-none disabled:opacity-60"
      />
    )
  }

  return (
    <button
      onClick={startEditing}
      title="Renomear projeto"
      className="group/name flex items-center gap-1.5 text-left"
    >
      <h1 className="text-lg font-semibold text-white">{initialName}</h1>
      <Pencil className="h-3.5 w-3.5 shrink-0 text-gray-600 opacity-0 transition-opacity group-hover/name:opacity-100" />
    </button>
  )
}
