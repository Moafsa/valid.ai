'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import { Layers, Eye, Code2, Smartphone, Monitor, Sparkles, PlayCircle, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PromptEditModal } from '@/components/editor/prompt-edit-modal'
import { toast } from 'sonner'

/**
 * Same per-block HTML the public page (src/app/f/[projectId]/[slug]/page.tsx)
 * would render, but as a plain string — Preview needs one self-contained
 * document to hand an <iframe srcDoc>, not JSX. Kept in one place so a
 * preview that "looks right" here isn't lying about what publishing does.
 */
function blockToPreviewHtml(block: any): string {
  if (block.type === 'quiz-step') {
    const answers = (block.answers ?? [])
      .map((a: any) => `<div style="border:1px solid #e5e7eb;border-radius:0.5rem;padding:0.625rem 1rem;font-size:0.875rem;color:#374151;margin-bottom:0.5rem;">${a.text ?? ''}</div>`)
      .join('')
    return `
      <div style="max-width:28rem;margin:0 auto;padding:2rem;">
        <div style="height:0.375rem;width:100%;border-radius:9999px;background:#e5e7eb;margin-bottom:1rem;overflow:hidden;">
          <div style="height:100%;border-radius:9999px;background:#2f54fc;width:${block.progressPercent ?? 0}%;"></div>
        </div>
        <h3 style="font-size:1.125rem;font-weight:700;color:#111827;text-align:center;margin-bottom:0.25rem;">${block.question ?? 'Pergunta não identificada'}</h3>
        ${block.subtitle ? `<p style="font-size:0.875rem;color:#6b7280;text-align:center;margin-bottom:1rem;">${block.subtitle}</p>` : ''}
        <div>${answers}</div>
      </div>`
  }
  if (block.type === 'vsl' && block.videoUrl) {
    return block.videoType === 'native'
      ? `<video src="${block.videoUrl}" poster="${block.screenshot ?? ''}" controls playsinline style="width:100%;display:block;background:#000;"></video>`
      : `<div style="position:relative;padding-top:56.25%;background:#000;"><iframe src="${block.videoUrl}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0;"></iframe></div>`
  }
  if (block.generatedHtml) return block.generatedHtml
  if (block.screenshot) return `<img src="${block.screenshot}" alt="" style="width:100%;display:block;" />`
  return ''
}

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
  // Local copy of each page's blocks so a prompt-edit shows up immediately,
  // without waiting on a full server round-trip.
  const [pagesBlocks, setPagesBlocks] = useState<Record<number, any[]>>({})
  const [editingBlock, setEditingBlock] = useState<{ id: string; code: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const activePage = project.pages[activePageIndex]
  const blocks: any[] = pagesBlocks[activePageIndex] ?? activePage?.blocks ?? []

  const previewSrcDoc = useMemo(() => {
    const sorted = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const body = sorted.map(blockToPreviewHtml).join('\n')
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"></script></head><body>${body || '<p style="padding:2rem;color:#9ca3af;font-family:sans-serif;">Nenhum bloco para pré-visualizar.</p>'}</body></html>`
  }, [blocks])

  const handleBlockUpdated = async (newCode: string) => {
    if (!editingBlock || !activePage) return
    const blockId = editingBlock.id
    const updated = blocks.map((b: any) => (b.id === blockId ? { ...b, generatedHtml: newCode } : b))
    setPagesBlocks(prev => ({ ...prev, [activePageIndex]: updated }))
    setSaving(true)
    try {
      const res = await fetch('/api/scan/save-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: activePage.id, blockId, generatedHtml: newCode }),
      })
      if (!res.ok) throw new Error('Falha ao salvar')
    } catch {
      toast.error('A edição apareceu na tela, mas não foi salva. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Blocks' generated HTML carries Tailwind utility classes that only
          exist as strings in the DB — this app's own compiled CSS never
          scanned them, so without the CDN build re-scanning the live DOM,
          every block renders as unstyled semantic HTML. Same fix as the
          published page (src/app/f/[projectId]/[slug]/page.tsx). */}
      <Script src="https://cdn.tailwindcss.com" strategy="afterInteractive" />
      {/* Page/step tabs — an LP has a single page, a quiz has one per step */}
      {project.pages.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-gray-200 bg-gray-50 px-3 py-2">
          {project.pages.map((p: any, i: number) => (
            <button
              key={p.id}
              onClick={() => setActivePageIndex(i)}
              className={cn(
                'flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                i === activePageIndex
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Editor Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-semibold text-gray-900">Editor de Blocos</span>
          <span className="text-xs text-gray-400 ml-1">{blocks.length} seções</span>
        </div>

        <div className="flex items-center gap-2">
          {activePage && (
            <Link
              href={`/projects/${project.id}/visual-editor/${activePage.id}`}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Editor Visual
            </Link>
          )}
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

      <div className="flex flex-col md:flex-row" style={{ minHeight: '500px' }}>
        {/* Left: Block List */}
        <div className="w-full md:w-64 flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-200 bg-gray-50 p-3 space-y-2 max-h-48 md:max-h-none overflow-y-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-3">Seções</p>
          {blocks.map((block: any, index: number) => (
            <div
              key={block.id}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 cursor-pointer hover:border-brand-300 hover:shadow-sm transition-all"
            >
              <span className="text-base">{BLOCK_TYPE_ICONS[block.type] ?? '📦'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">
                  {block.type === 'quiz-step' ? (block.question || 'Pergunta') : block.type}
                </p>
                <p className="text-xs text-gray-400">
                  {block.type === 'quiz-step' ? `${block.answers?.length ?? 0} opções` : `Seção ${index + 1}`}
                </p>
              </div>
            </div>
          ))}

          {blocks.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">Nenhum bloco encontrado</p>
          )}
        </div>

        {/* Right: Preview / Code */}
        <div className="flex-1 min-w-0 bg-gray-100 p-4 overflow-auto">
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
                    <button
                      onClick={() => setEditingBlock({ id: block.id, code: block.generatedHtml ?? '' })}
                      className="absolute top-2 right-2 z-10 hidden group-hover:flex items-center gap-1 bg-purple-600 text-white text-xs px-2 py-1 rounded-md hover:bg-purple-700"
                    >
                      <Sparkles className="h-3 w-3" />
                      Editar com IA
                    </button>
                    {block.type === 'quiz-step' ? (
                      <div className="p-8">
                        <div className="h-1.5 w-full rounded-full bg-gray-200 mb-4 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-brand-500"
                            style={{ width: `${block.progressPercent ?? 0}%` }}
                          />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 text-center mb-1">
                          {block.question || 'Pergunta não identificada'}
                        </h3>
                        {block.subtitle && (
                          <p className="text-sm text-gray-500 text-center mb-4">{block.subtitle}</p>
                        )}
                        <div className="space-y-2 max-w-sm mx-auto">
                          {(block.answers ?? []).map((a: any) => (
                            <div key={a.id} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700">
                              {a.text}
                            </div>
                          ))}
                          {(block.answers ?? []).length === 0 && !block.hasLeadCapture && (
                            <p className="text-xs text-gray-400 text-center">Nenhuma opção identificada</p>
                          )}
                          {block.hasLeadCapture && (
                            <p className="text-xs text-gray-400 text-center">📧 Formulário de captura de lead</p>
                          )}
                        </div>
                      </div>
                    ) : block.type === 'vsl' && block.videoUrl ? (
                      <div className="relative bg-gray-900" style={{ paddingTop: '56.25%' }}>
                        {block.screenshot && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={block.screenshot} alt="Capa do vídeo" className="absolute inset-0 w-full h-full object-cover opacity-70" />
                        )}
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                          <PlayCircle className="h-14 w-14 text-white drop-shadow-lg" />
                          <span className="text-xs text-white bg-black/50 px-2 py-1 rounded-full uppercase tracking-wide">
                            VSL · {block.videoType}{block.videoDuration ? ` · ${Math.round(block.videoDuration / 60)}min` : ''}
                          </span>
                        </div>
                      </div>
                    ) : block.generatedHtml ? (
                      <div dangerouslySetInnerHTML={{ __html: block.generatedHtml }} />
                    ) : block.screenshot ? (
                      // Código por IA ainda não disponível — mostra o screenshot original capturado no scan.
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={block.screenshot}
                          alt={`Seção ${block.type}`}
                          className="w-full block"
                        />
                        <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">
                          📸 Screenshot (aguardando geração por IA)
                        </span>
                      </div>
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

          {viewMode === 'preview' && (
            <div className={cn(
              'mx-auto bg-white shadow-lg transition-all h-[70vh]',
              device === 'mobile' ? 'max-w-sm' : 'max-w-full'
            )}>
              <iframe
                srcDoc={previewSrcDoc}
                title="Pré-visualização"
                className="h-full w-full border-0"
                sandbox="allow-scripts"
              />
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

      {editingBlock && (
        <PromptEditModal
          isOpen={!!editingBlock}
          onClose={() => setEditingBlock(null)}
          blockId={editingBlock.id}
          currentCode={editingBlock.code}
          onUpdated={handleBlockUpdated}
        />
      )}
      {saving && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 text-white text-xs px-3 py-2 shadow-lg">
          Salvando alteração...
        </div>
      )}
    </div>
  )
}
