'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import grapesjs, { Editor } from 'grapesjs'
import 'grapesjs/dist/css/grapes.min.css'
import { ArrowLeft, Save, Loader2, Undo2, Redo2, Monitor, Tablet, Smartphone, Link2, Image as ImageIcon, Upload, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { STARTER_BLOCKS } from '@/lib/visual-editor/starter-blocks'

interface Block {
  id: string
  type: string
  order: number
  generatedHtml?: string | null
  [key: string]: any
}

interface PageSummary {
  id: string
  slug: string
  name: string
  order: number
}

interface VisualEditorProps {
  projectId: string
  pageId: string
  blocks: Block[]
  pageCss: string | null
  pages: PageSummary[]
}

interface MediaItem {
  component: any
  src: string
  alt: string
}

// GrapesJS always includes this reset in editor.getCss(), even for a
// component with no rules of its own — strip it so we only re-embed a
// <style> tag when the block actually defines custom CSS.
const GJS_BASE_CSS = '* { box-sizing: border-box; } body {margin: 0;}'

// GrapesJS ships with a dark-gray chrome by default (block/style/layer
// panels), themed entirely through these CSS custom properties — so
// instead of overriding ~300 individual classes, we re-tint the palette
// itself to the site's violet/blue identity. Doubling the class selector
// bumps specificity above :root without needing !important or relying on
// stylesheet load order (grapes.min.css also defines these on :root).
const GJS_THEME_CSS = `
.vai-editor-shell.vai-editor-shell {
  --gjs-primary-color: #7c3aed;
  --gjs-secondary-color: #c4b5fd;
  --gjs-tertiary-color: #a78bfa;
  --gjs-quaternary-color: #ddd6fe;
  --gjs-font-color: #cbd5e1;
  --gjs-font-color-active: #ffffff;
  --gjs-main-color: #15101f;
  --gjs-main-dark-color: rgba(0, 0, 0, 0.35);
  --gjs-secondary-dark-color: rgba(0, 0, 0, 0.25);
  --gjs-main-light-color: rgba(255, 255, 255, 0.06);
  --gjs-secondary-light-color: rgba(255, 255, 255, 0.55);
  --gjs-soft-light-color: rgba(255, 255, 255, 0.03);
  --gjs-color-blue: #8b5cf6;
  --gjs-color-highlight: #a78bfa;
  --gjs-light-border: rgba(255, 255, 255, 0.08);
  --gjs-arrow-color: rgba(255, 255, 255, 0.5);
}
/* A few spots GrapesJS hardcodes for a light backdrop instead of using a
   variable (block borders/hover assume a white page behind them). */
.vai-editor-shell .gjs-block { border-color: rgba(255, 255, 255, 0.08); }
.vai-editor-shell .gjs-block:hover { background-color: rgba(255, 255, 255, 0.04); border-color: rgba(139, 92, 246, 0.4); box-shadow: none; }
.vai-editor-shell .gjs-category-title,
.vai-editor-shell .gjs-sm-sector-title,
.vai-editor-shell .gjs-layer-title { border-bottom-color: rgba(255, 255, 255, 0.06); }
.vai-editor-shell ::-webkit-scrollbar { width: 8px; height: 8px; }
.vai-editor-shell ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.12); border-radius: 4px; }
.vai-editor-shell ::-webkit-scrollbar-track { background: transparent; }
/* The color-picker popup (Spectrum) is appended straight to <body>, so it
   sits outside .vai-editor-shell and needs its own (page-global, but this
   is a standalone fullscreen route with nothing else on it) dark theme. */
.sp-container { background-color: #15101f; border: 1px solid rgba(255, 255, 255, 0.1); }
.sp-replacer { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.1); }
.sp-input { background: rgba(255, 255, 255, 0.05); color: #e5e7eb !important; border-color: rgba(255, 255, 255, 0.1); }
.sp-picker-container { border-left-color: rgba(255, 255, 255, 0.1); }
`

type RightTab = 'conteudo' | 'estilo' | 'layout' | 'midias'

export function VisualEditor({ projectId, pageId, blocks, pageCss, pages }: VisualEditorProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const blocksPanelRef = useRef<HTMLDivElement>(null)
  const styleManagerRef = useRef<HTMLDivElement>(null)
  const layerManagerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)

  const [saving, setSaving] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [rightTab, setRightTab] = useState<RightTab>('conteudo')
  const [blockSearch, setBlockSearch] = useState('')
  const [pageMenuOpen, setPageMenuOpen] = useState(false)
  const [selected, setSelected] = useState<{
    text: string
    href: string | null
    isLink: boolean
    isTextLeaf: boolean
    isImage: boolean
    src: string | null
  } | null>(null)
  const selectedComponentRef = useRef<any>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [mediaList, setMediaList] = useState<MediaItem[]>([])
  const [uploadingMediaIndex, setUploadingMediaIndex] = useState<number | null>(null)

  const sortedPages = [...pages].sort((a, b) => a.order - b.order)
  const pagePath = (p: PageSummary, i: number) => (i === 0 ? '/' : `/${p.slug}`)
  const currentPageIndex = sortedPages.findIndex(p => p.id === pageId)

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      fromElement: false,
      storageManager: false,
      panels: { defaults: [] },
      canvas: { scripts: ['https://cdn.tailwindcss.com'] },
      deviceManager: {
        devices: [
          { name: 'Desktop', width: '' },
          { name: 'Tablet', width: '768px', widthMedia: '992px' },
          { name: 'Mobile', width: '375px', widthMedia: '575px' },
        ],
      },
      blockManager: {
        appendTo: blocksPanelRef.current!,
        blocks: STARTER_BLOCKS.map(b => ({ id: b.id, label: b.label, content: b.content, category: 'Blocos' })),
      },
      styleManager: {
        appendTo: styleManagerRef.current!,
        sectors: [
          {
            name: 'Texto', open: true,
            properties: [
              { property: 'color', name: 'Cor do texto' },
              { property: 'font-family', name: 'Fonte' },
              { property: 'font-size', name: 'Tamanho' },
              { property: 'font-weight', name: 'Peso' },
              { property: 'line-height', name: 'Altura da linha' },
              { property: 'letter-spacing', name: 'Espaçamento' },
              { property: 'text-align', name: 'Alinhamento' },
              { property: 'text-decoration', name: 'Decoração' },
              { property: 'text-transform', name: 'Transformação' },
            ],
          },
          {
            name: 'Posição', open: false,
            properties: [
              { property: 'display', name: 'Display' },
              { property: 'flex-direction', name: 'Direção (flex)' },
              { property: 'justify-content', name: 'Justificar' },
              { property: 'align-items', name: 'Alinhar itens' },
              { property: 'gap', name: 'Espaço entre itens' },
              { property: 'position', name: 'Posição' },
              { property: 'top', name: 'Topo' },
              { property: 'right', name: 'Direita' },
              { property: 'bottom', name: 'Baixo' },
              { property: 'left', name: 'Esquerda' },
              { property: 'z-index', name: 'Camada (z-index)' },
            ],
          },
          {
            name: 'Dimensões e espaçamento', open: false,
            properties: [
              { property: 'width', name: 'Largura' },
              { property: 'height', name: 'Altura' },
              { property: 'max-width', name: 'Largura máx.' },
              { property: 'min-height', name: 'Altura mín.' },
              { id: 'margin', property: 'margin', name: 'Margem', type: 'composite' },
              { id: 'padding', property: 'padding', name: 'Preenchimento', type: 'composite' },
            ],
          },
          {
            name: 'Fundo e borda', open: false,
            properties: [
              { property: 'background-color', name: 'Cor de fundo' },
              { property: 'background-image', name: 'Imagem de fundo' },
              { property: 'background-size', name: 'Tamanho do fundo' },
              { property: 'background-position', name: 'Posição do fundo' },
              { property: 'border-radius', name: 'Borda arredondada' },
              { property: 'border-width', name: 'Espessura da borda' },
              { property: 'border-style', name: 'Estilo da borda' },
              { property: 'border-color', name: 'Cor da borda' },
              { property: 'box-shadow', name: 'Sombra' },
            ],
          },
          {
            name: 'Efeitos', open: false,
            properties: [
              { property: 'opacity', name: 'Opacidade' },
              { property: 'transform', name: 'Transformação' },
              { property: 'filter', name: 'Filtro' },
              { property: 'cursor', name: 'Cursor' },
              { property: 'overflow', name: 'Overflow' },
            ],
          },
        ],
      },
      layerManager: { appendTo: layerManagerRef.current! },
    })
    editorRef.current = editor
    if (typeof window !== 'undefined') (window as any).__vaiEditor = editor

    if (pageCss) {
      editor.on('load', () => {
        const doc = editor.Canvas.getDocument()
        if (!doc) return
        const styleTag = doc.createElement('style')
        styleTag.textContent = pageCss
        doc.head.appendChild(styleTag)
      })
    }

    editor.on('block:drag:stop', (component: any) => {
      if (!component || component.getAttributes?.()['data-vai-block-id']) return
      component.addAttributes({ 'data-vai-block-id': crypto.randomUUID() })
    })
    editor.on('component:clone', (component: any) => {
      const attrs = component.getAttributes?.() ?? {}
      if (attrs['data-vai-block-id']) component.addAttributes({ 'data-vai-block-id': crypto.randomUUID() })
    })

    const readSelection = (component: any) => {
      if (!component) {
        selectedComponentRef.current = null
        setSelected(null)
        return
      }
      selectedComponentRef.current = component
      const el = component.getEl?.()
      const tag = (el?.tagName || '').toLowerCase()
      const isLink = tag === 'a'
      const isImage = tag === 'img'
      // A container (a <section>/<div> wrapping several nested elements)
      // has more than one child component, or a child that isn't a plain
      // text node — editing "its text" via a single textarea would
      // collapse all of that nested markup into one flat string on the
      // first keystroke. Only offer free-text editing for genuine text
      // leaves (a heading, a paragraph, a button's label), matching what
      // the reference UI's "Texto" field is actually meant for.
      const children = component.components?.() ?? []
      const isTextLeaf = children.length === 0 || (children.length === 1 && children.at(0)?.get('type') === 'textnode')
      setSelected({
        text: el?.innerText ?? '',
        href: isLink ? component.getAttributes()['href'] ?? '' : null,
        isLink,
        isTextLeaf,
        isImage,
        src: isImage ? component.getAttributes()['src'] ?? '' : null,
      })
    }
    editor.on('component:selected', readSelection)
    editor.on('component:deselected', () => readSelection(null))

    const sorted = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    editor.setComponents(
      sorted
        .map(b => (b.generatedHtml ? `<section data-vai-block-id="${b.id}">${b.generatedHtml}</section>` : ''))
        .join('\n')
    )

    const updateUndoState = () => {
      setCanUndo(editor.UndoManager.hasUndo())
      setCanRedo(editor.UndoManager.hasRedo())
    }
    editor.on('component:add component:remove component:update component:styleUpdate rte:disable', updateUndoState)

    return () => {
      editor.destroy()
      editorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The Mídias tab lists every <img> in the page from a fresh walk of the
  // component tree (not raw DOM) so "Trocar" always has a real GrapesJS
  // component to call .set('src', ...) on, however deeply nested it is.
  const collectMedia = (collection: any, acc: MediaItem[]): MediaItem[] => {
    collection.forEach((c: any) => {
      const el = c.getEl?.()
      if (el?.tagName === 'IMG') {
        const attrs = c.getAttributes?.() ?? {}
        const src = attrs.src || el.getAttribute('src') || ''
        if (src) acc.push({ component: c, src, alt: attrs.alt || '' })
      }
      const children = c.components?.()
      if (children?.length) collectMedia(children, acc)
    })
    return acc
  }

  const refreshMediaList = () => {
    const editor = editorRef.current
    if (!editor) return
    setMediaList(collectMedia(editor.getWrapper()!.components(), []))
  }

  useEffect(() => {
    if (rightTab === 'midias') refreshMediaList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightTab])

  const applyTextEdit = (text: string) => {
    const comp = selectedComponentRef.current
    if (!comp) return
    comp.components(text)
    setSelected(prev => (prev ? { ...prev, text } : prev))
  }

  const applyHrefEdit = (href: string) => {
    const comp = selectedComponentRef.current
    if (!comp) return
    comp.addAttributes({ href })
    setSelected(prev => (prev ? { ...prev, href } : prev))
  }

  const applyImageUploadTo = async (comp: any, file: File, mediaIndex?: number) => {
    if (!comp) return
    if (mediaIndex !== undefined) setUploadingMediaIndex(mediaIndex)
    else setUploadingImage(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/editor/upload-image', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar imagem')
      // GrapesJS's built-in "image" component type keeps `src` as its own
      // model property (comp.get('src')), separate from the generic
      // attributes hash — toHTML()/export reads from that property, so
      // addAttributes() alone updates the DOM but silently doesn't
      // round-trip on save. Setting both keeps the two in sync.
      comp.set('src', data.url)
      comp.addAttributes({ src: data.url })
      if (comp === selectedComponentRef.current) {
        setSelected(prev => (prev ? { ...prev, src: data.url } : prev))
      }
      refreshMediaList()
      toast.success('Imagem atualizada!')
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar imagem')
    } finally {
      if (mediaIndex !== undefined) setUploadingMediaIndex(null)
      else setUploadingImage(false)
    }
  }

  const applyImageUpload = (file: File) => applyImageUploadTo(selectedComponentRef.current, file)

  const handleSave = async () => {
    const editor = editorRef.current
    if (!editor) return
    setSaving(true)
    try {
      const topLevel = editor.getWrapper()!.components()
      const outBlocks: Block[] = []
      const seenIds = new Set<string>()

      topLevel.forEach((comp: any, index: number) => {
        let attrs = comp.getAttributes()
        let id = attrs['data-vai-block-id']
        if (!id || seenIds.has(id)) {
          id = crypto.randomUUID()
          comp.addAttributes({ 'data-vai-block-id': id })
          attrs = comp.getAttributes()
        }
        seenIds.add(id)

        let scopedCss = (editor.getCss({ component: comp } as any) || '').trim()
        if (scopedCss.startsWith(GJS_BASE_CSS)) scopedCss = scopedCss.slice(GJS_BASE_CSS.length).trim()
        const innerHtml = comp.getInnerHTML ? comp.getInnerHTML() : comp.toHTML()

        outBlocks.push({
          id,
          type: 'custom-html',
          order: index,
          generatedHtml: scopedCss ? `<style>${scopedCss}</style>${innerHtml}` : innerHtml,
        })
      })

      const res = await fetch('/api/editor/save-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, blocks: outBlocks }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao salvar')
      }
      toast.success('Página salva!')
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const setDevice = (name: string) => editorRef.current?.setDevice(name)

  return (
    <div className="vai-editor-shell flex h-screen flex-col bg-[#07050f] text-white">
      <style>{GJS_THEME_CSS}</style>
      <div className="flex items-center justify-between border-b border-white/10 bg-[#0a0714] px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          {sortedPages.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setPageMenuOpen(v => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-gray-200 hover:border-violet-500/40 hover:bg-white/10"
              >
                {currentPageIndex >= 0 ? pagePath(sortedPages[currentPageIndex], currentPageIndex) : '/'}
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </button>
              {pageMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setPageMenuOpen(false)} />
                  <div className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#0e0a1a] py-1 shadow-2xl shadow-black/50">
                    {sortedPages.map((p, i) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setPageMenuOpen(false)
                          if (p.id !== pageId) router.push(`/projects/${projectId}/editor/${p.slug}`)
                        }}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm ${
                          p.id === pageId ? 'bg-violet-600/15 text-violet-300' : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        <span className="truncate">{p.name || pagePath(p, i)}</span>
                        <span className="shrink-0 text-xs text-gray-500">{pagePath(p, i)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
          <button onClick={() => setDevice('Desktop')} title="Desktop" className="rounded p-1.5 text-gray-400 hover:bg-white/10 hover:text-white">
            <Monitor className="h-4 w-4" />
          </button>
          <button onClick={() => setDevice('Tablet')} title="Tablet" className="rounded p-1.5 text-gray-400 hover:bg-white/10 hover:text-white">
            <Tablet className="h-4 w-4" />
          </button>
          <button onClick={() => setDevice('Mobile')} title="Celular" className="rounded p-1.5 text-gray-400 hover:bg-white/10 hover:text-white">
            <Smartphone className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => editorRef.current?.runCommand('core:undo')}
            disabled={!canUndo}
            title="Desfazer"
            className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => editorRef.current?.runCommand('core:redo')}
            disabled={!canRedo}
            title="Refazer"
            className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:from-violet-500 hover:to-blue-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: block library */}
        <div className="flex w-56 flex-shrink-0 flex-col border-r border-white/10 bg-[#0a0714]">
          <div className="border-b border-white/10 p-3">
            <input
              type="text"
              value={blockSearch}
              onChange={e => {
                setBlockSearch(e.target.value)
                const q = e.target.value.toLowerCase()
                blocksPanelRef.current?.querySelectorAll('.gjs-block').forEach(el => {
                  const label = el.textContent?.toLowerCase() ?? ''
                  ;(el as HTMLElement).style.display = label.includes(q) ? '' : 'none'
                })
              }}
              placeholder="Buscar blocos..."
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-violet-500 focus:outline-none"
            />
          </div>
          <div ref={blocksPanelRef} className="flex-1 overflow-y-auto p-2" />
        </div>

        {/* Center: canvas */}
        <div className="flex-1 min-h-0" ref={containerRef} />

        {/* Right: properties */}
        <div className="flex w-72 flex-shrink-0 flex-col border-l border-white/10 bg-[#0a0714]">
          <div className="flex border-b border-white/10 text-xs font-semibold">
            {([
              ['conteudo', 'Conteúdo'],
              ['estilo', 'Estilo'],
              ['layout', 'Camadas'],
              ['midias', 'Mídias'],
            ] as [RightTab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setRightTab(key)}
                className={`flex-1 px-2 py-2.5 ${rightTab === key ? 'border-b-2 border-violet-500 text-violet-400' : 'text-gray-500 hover:text-gray-200'}`}
              >
                {label}
              </button>
            ))}
            <button
              disabled
              title="Em breve"
              className="flex-1 cursor-not-allowed px-2 py-2.5 text-gray-600"
            >
              IA
            </button>
          </div>

          <div className={rightTab === 'conteudo' ? 'flex-1 overflow-y-auto p-4' : 'hidden'}>
            {selected ? (
              <div className="space-y-4">
                {selected.isImage ? null : selected.isTextLeaf ? (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">Texto (atualiza enquanto digita)</label>
                    <textarea
                      value={selected.text}
                      onChange={e => applyTextEdit(e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    Este elemento tem outros elementos dentro dele. Clique duas vezes pra entrar e selecionar um título, parágrafo ou botão específico pra editar o texto.
                  </p>
                )}
                {selected.isLink && (
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-400">
                      <Link2 className="h-3.5 w-3.5" /> Link (href)
                    </label>
                    <input
                      type="text"
                      value={selected.href ?? ''}
                      onChange={e => applyHrefEdit(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                )}
                {selected.isImage && (
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-400">
                      <ImageIcon className="h-3.5 w-3.5" /> Imagem
                    </label>
                    {selected.src && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selected.src}
                        alt=""
                        className="mb-2 h-24 w-full rounded-lg border border-white/10 object-cover"
                      />
                    )}
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 py-2.5 text-sm font-medium text-gray-300 hover:border-violet-400 hover:text-violet-300">
                      {uploadingImage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {uploadingImage ? 'Enviando...' : 'Trocar imagem'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingImage}
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (file) applyImageUpload(file)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500">Selecione um elemento na página pra editar o conteúdo.</p>
            )}
          </div>

          <div ref={styleManagerRef} className={rightTab === 'estilo' ? 'flex-1 overflow-y-auto' : 'hidden'} />
          <div ref={layerManagerRef} className={rightTab === 'layout' ? 'flex-1 overflow-y-auto' : 'hidden'} />

          <div className={rightTab === 'midias' ? 'flex-1 overflow-y-auto p-4' : 'hidden'}>
            {mediaList.length === 0 ? (
              <p className="text-xs text-gray-500">Nenhuma imagem encontrada nesta página.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  {mediaList.length} imagem{mediaList.length === 1 ? '' : 'ns'} encontrada{mediaList.length === 1 ? '' : 's'}
                </p>
                {mediaList.map((item, i) => (
                  <div key={i} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                    <button
                      onClick={() => {
                        editorRef.current?.select(item.component)
                        setRightTab('conteudo')
                      }}
                      className="block w-full"
                      title="Selecionar na página"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.src} alt={item.alt} className="h-28 w-full object-cover" />
                    </button>
                    <div className="flex items-center justify-between gap-2 p-2">
                      <span className="truncate text-[11px] text-gray-500">{item.alt || 'sem legenda'}</span>
                      <label className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] font-medium text-gray-300 hover:border-violet-400 hover:text-violet-300">
                        {uploadingMediaIndex === i ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Upload className="h-3 w-3" />
                        )}
                        Trocar
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingMediaIndex !== null}
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) applyImageUploadTo(item.component, file, i)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
