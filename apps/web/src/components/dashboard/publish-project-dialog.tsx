'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { Globe2, Loader2, Copy, Check, X } from 'lucide-react'
import { toast } from 'sonner'

export function PublishProjectDialog({
  projectId,
  currentSlug,
}: {
  projectId: string
  currentSlug: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [slug, setSlug] = useState(currentSlug ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const publishedLink = currentSlug ? `be-vallid.com/s/${currentSlug}` : null

  const handlePublish = async () => {
    const trimmed = slug.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao publicar')
      toast.success('Projeto publicado!')
      setOpen(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Erro ao publicar')
    } finally {
      setSaving(false)
    }
  }

  const copyLink = () => {
    if (!publishedLink) return
    navigator.clipboard.writeText(`https://${publishedLink}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-gray-200 hover:border-violet-500/40 hover:bg-white/10">
          <Globe2 className="h-3.5 w-3.5 text-violet-400" />
          {currentSlug ? 'Editar publicação' : 'Publicar'}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-[#0e0a1a] p-6 shadow-2xl shadow-black/50">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold text-white">Publicar projeto</Dialog.Title>
            <Dialog.Close className="rounded-lg p-1 text-gray-500 hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-4 text-xs text-gray-400">
            Escolha um domínio para esse projeto. Esse link já funciona agora — o domínio próprio de verdade
            (<span className="text-gray-300">seudominio.be-vallid.com</span>) é a próxima etapa e depende de uma
            configuração de DNS que ainda vamos fazer juntos.
          </Dialog.Description>

          <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2 shadow-inner">
            <span className="shrink-0 pl-2 text-sm text-gray-500">be-vallid.com/s/</span>
            <input
              type="text"
              value={slug}
              onChange={e => setSlug(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePublish()}
              placeholder="meu-projeto"
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none"
            />
          </div>
          {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

          {publishedLink && (
            <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
              <span className="truncate">{publishedLink}</span>
              <button onClick={copyLink} className="flex shrink-0 items-center gap-1 text-emerald-400 hover:text-emerald-200">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          )}

          <button
            onClick={handlePublish}
            disabled={saving || !slug.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 hover:from-violet-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
            {currentSlug ? 'Atualizar domínio' : 'Publicar'}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
