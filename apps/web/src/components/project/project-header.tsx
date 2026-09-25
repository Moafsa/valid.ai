'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink, Share2, Globe, Loader2, CheckCircle2, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { TranslationModal } from '@/components/editor/translation-modal'
import { DeleteProjectModal } from './delete-project-modal'

const TYPE_LABELS: Record<string, string> = {
  LP: 'Landing Page',
  QUIZ: 'Quiz Funil',
  VSL: 'VSL',
  CHECKOUT: 'Checkout',
  FUNNEL: 'Funil'
}

export function ProjectHeader({ project }: { project: any }) {
  const [translateOpen, setTranslateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null)
  const router = useRouter()

  const isPublished = project.status === 'PUBLISHED' || !!publishedUrl
  const homePage = project.pages?.find((p: any) => p.slug === 'home') ?? project.pages?.[0]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const effectiveUrl = publishedUrl ?? (homePage?.publishedUrl ? `${appUrl}${homePage.publishedUrl}` : null)

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const res = await fetch(`/api/projects/${project.id}/publish`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao publicar')
      setPublishedUrl(data.url)
      toast.success('Funil publicado!')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Link
        href="/dashboard"
        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div className="flex-1 min-w-[160px]">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900 truncate">{project.name}</h1>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {TYPE_LABELS[project.type] ?? project.type}
          </span>
        </div>
        <a
          href={project.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-400 hover:text-brand-600 flex items-center gap-1 mt-0.5"
        >
          {project.sourceUrl}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {(project.status === 'READY' || isPublished) && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTranslateOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Globe className="h-4 w-4" />
            Traduzir
          </button>
          {isPublished && (
            <a
              href={effectiveUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
            >
              <CheckCircle2 className="h-4 w-4" />
              Ver publicado
            </a>
          )}
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            {isPublished ? 'Republicar' : 'Publicar'}
          </button>
        </div>
      )}

      <button
        onClick={() => setDeleteOpen(true)}
        title="Excluir projeto"
        className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <TranslationModal
        isOpen={translateOpen}
        onClose={() => setTranslateOpen(false)}
        projectId={project.id}
        onTranslated={(newProjectId) => router.push(`/projects/${newProjectId}`)}
      />
      <DeleteProjectModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        projectId={project.id}
        projectName={project.name}
      />
    </div>
  )
}
