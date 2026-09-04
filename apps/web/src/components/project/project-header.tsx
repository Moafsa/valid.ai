'use client'

import { ArrowLeft, ExternalLink, Share2 } from 'lucide-react'
import Link from 'next/link'

const TYPE_LABELS: Record<string, string> = {
  LP: 'Landing Page',
  QUIZ: 'Quiz Funil',
  VSL: 'VSL',
  CHECKOUT: 'Checkout',
  FUNNEL: 'Funil'
}

export function ProjectHeader({ project }: { project: any }) {
  return (
    <div className="flex items-center gap-4">
      <Link
        href="/dashboard"
        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div className="flex-1 min-w-0">
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
      {project.status === 'READY' && (
        <button className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <Share2 className="h-4 w-4" />
          Publicar
        </button>
      )}
    </div>
  )
}
