'use client'

import { useState } from 'react'
import { Layers, Eye, Code2, Smartphone, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'

const BLOCK_TYPE_ICONS: Record<string, string> = {
  hero: '🦸',
  benefits: '✅',
  testimonials: '⭐',
  vsl: '🎬',
  offer: '🏷️',
  faq: '❓',
  cta: '👆',
  footer: '🔗',
  text: '📝',
  image: '🖼️',
  countdown: '⏰',
  'lead-capture': '📧',
  'quiz-step': '❓',
  'quiz-result': '🎯',
  'custom-html': '💻',
}

export function BlockEditor({ project }: { project: any }) {
  const [activePageIndex, setActivePageIndex] = useState(0)
  const [viewMode, setViewMode] = useState<'preview' | 'blocks' | 'code'>('blocks')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')

  const activePage = project.pages[activePageIndex]
  const blocks: any[] = activePage?.blocks ?? []

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Editor Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-semibold text-gray-900">Editor de Blocos</span>
          <span className="text-xs text-gray-400 ml-1">{blocks.length} seções</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Device Toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setDevice('desktop')}
              className={cn('p-2', device === 'desktop' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:text-gray-600')}
            >
              <Monitor className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDevice('mobile')}
              className={cn('p-2 border-l border-gray-200', device === 'mobile' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:text-gray-600')}
            >
              <Smartphone className="h-4 w-4" />
            </button>
          </div>

          {/* View Mode */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['blocks', 'preview', 'code'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  'px-3 py-2 text-xs font-medium capitalize border-r border-gray-200 last:border-0',
                  viewMode === mode ? 'bg-brand-50 text-brand-600' : 'text-gray-500 hover:bg-gray-50'
                )}
              >
                {mode === 'blocks' ? <Layers className="h-3.5 w-3.5" /> :
                 mode === 'preview' ? <Eye className="h-3.5 w-3.5" /> :
                 <Code2 className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex" style={{ minHeight: '500px' }}>
        {/* Left: Block List */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-gray-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-3">Seções</p>
          {blocks.map((block: any, index: number) => (
            <div
              key={block.id}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 cursor-pointer hover:border-brand-300 hover:shadow-sm transition-all"
            >
              <span className="text-base">{BLOCK_TYPE_ICONS[block.type] ?? '📦'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 capitalize">{block.type}</p>
                <p className="text-xs text-gray-400">Seção {index + 1}</p>
              </div>
            </div>
          ))}

          {blocks.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">Nenhum bloco encontrado</p>
          )}
        </div>

        {/* Right: Preview / Code */}
        <div className="flex-1 bg-gray-100 p-4 overflow-auto">
          {viewMode === 'blocks' && (
            <div className={cn(
              'mx-auto bg-white shadow-lg transition-all',
              device === 'mobile' ? 'max-w-sm' : 'max-w-full'
            )}>
              {blocks.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-gray-400">
                  <div className="text-center">
                    <p className="text-4xl mb-2">🎨</p>
                    <p className="text-sm">Seus blocos aparecerão aqui após o scan</p>
                  </div>
                </div>
              ) : (
                blocks.map((block: any) => (
                  <div
                    key={block.id}
                    className="relative border-2 border-transparent hover:border-brand-400 transition-colors group"
                  >
                    <div className="absolute top-2 left-2 z-10 hidden group-hover:flex items-center gap-1 bg-brand-600 text-white text-xs px-2 py-1 rounded-md">
                      <span>{BLOCK_TYPE_ICONS[block.type] ?? '📦'}</span>
                      <span className="capitalize">{block.type}</span>
                    </div>
                    {block.generatedHtml ? (
                      <div dangerouslySetInnerHTML={{ __html: block.generatedHtml }} />
                    ) : (
                      <div className="h-24 bg-gradient-to-r from-gray-100 to-gray-50 flex items-center justify-center">
                        <span className="text-gray-400 text-sm">{block.type}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {viewMode === 'code' && (
            <div className="space-y-4">
              {blocks.map((block: any) => (
                <div key={block.id} className="rounded-lg bg-gray-900 text-gray-100 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
                    <span className="text-xs font-mono text-gray-400">{block.type}.tsx</span>
                  </div>
                  <pre className="p-4 text-xs overflow-x-auto">
                    <code>{block.generatedHtml ?? '// Código não disponível'}</code>
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
