'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import grapesjs, { Editor } from 'grapesjs'
import 'grapesjs/dist/css/grapes.min.css'
import { ArrowLeft, Save, Loader2, Undo2, Redo2, Monitor, Tablet, Smartphone, Link2, Image as ImageIcon, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { STARTER_BLOCKS } from '@/lib/visual-editor/starter-blocks'

interface Block {
  id: string
  type: string
  order: number
  generatedHtml?: string | null
  [key: string]: any
}

interface VisualEditorProps {
  projectId: string
  pageId: string
  blocks: Block[]
  pageCss: string | null
}

// GrapesJS always includes this reset in editor.getCss(), even for a
// component with no rules of its own — strip it so we only re-embed a
// <style> tag when the block actually defines custom CSS.
const GJS_BASE_CSS = '* { box-sizing: border-box; } body {margin: 0;}'

type RightTab = 'conteudo' | 'estilo' | 'layout'

export function VisualEditor({ projectId, pageId, blocks, pageCss }: VisualEditorProps) {
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

  const applyImageUpload = async (file: File) => {
    const comp = selectedComponentRef.current
    if (!comp) return
    setUploadingImage(true)
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
      setSelected(prev => (prev ? { ...prev, src: data.url } : prev))
      toast.success('Imagem atualizada!')
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar imagem')
    } finally {
      setUploadingImage(false)
    }
  }

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
    <div className="flex h-screen flex-col bg-gray-100">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5 flex-shrink-0">
        <button
          onClick={() => router.push(`/projects/${projectId}`)}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao projeto
        </button>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-1">
          <button onClick={() => setDevice('Desktop')} title="Desktop" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
            <Monitor className="h-4 w-4" />
          </button>
          <button onClick={() => setDevice('Tablet')} title="Tablet" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
            <Tablet className="h-4 w-4" />
          </button>
          <button onClick={() => setDevice('Mobile')} title="Celular" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
            <Smartphone className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => editorRef.current?.runCommand('core:undo')}
            disabled={!canUndo}
            title="Desfazer"
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => editorRef.current?.runCommand('core:redo')}
            disabled={!canRedo}
            title="Refazer"
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: block library */}
        <div className="flex w-56 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-3">
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
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none"
            />
          </div>
          <div ref={blocksPanelRef} className="flex-1 overflow-y-auto p-2" />
        </div>

        {/* Center: canvas */}
        <div className="flex-1 min-h-0" ref={containerRef} />

        {/* Right: properties */}
        <div className="flex w-72 flex-shrink-0 flex-col border-l border-gray-200 bg-white">
          <div className="flex border-b border-gray-200 text-xs font-semibold">
            {([
              ['conteudo', 'Conteúdo'],
              ['estilo', 'Estilo'],
              ['layout', 'Camadas'],
            ] as [RightTab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setRightTab(key)}
                className={`flex-1 px-2 py-2.5 ${rightTab === key ? 'border-b-2 border-violet-600 text-violet-700' : 'text-gray-500 hover:text-gray-800'}`}
              >
                {label}
              </button>
            ))}
            <button
              disabled
              title="Em breve"
              className="flex-1 cursor-not-allowed px-2 py-2.5 text-gray-300"
            >
              IA
            </button>
          </div>

          <div className={rightTab === 'conteudo' ? 'flex-1 overflow-y-auto p-4' : 'hidden'}>
            {selected ? (
              <div className="space-y-4">
                {selected.isImage ? null : selected.isTextLeaf ? (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-500">Texto (atualiza enquanto digita)</label>
                    <textarea
                      value={selected.text}
                      onChange={e => applyTextEdit(e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">
                    Este elemento tem outros elementos dentro dele. Clique duas vezes pra entrar e selecionar um título, parágrafo ou botão específico pra editar o texto.
                  </p>
                )}
                {selected.isLink && (
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                      <Link2 className="h-3.5 w-3.5" /> Link (href)
                    </label>
                    <input
                      type="text"
                      value={selected.href ?? ''}
                      onChange={e => applyHrefEdit(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                )}
                {selected.isImage && (
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                      <ImageIcon className="h-3.5 w-3.5" /> Imagem
                    </label>
                    {selected.src && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selected.src}
                        alt=""
                        className="mb-2 h-24 w-full rounded-lg border border-gray-200 object-cover"
                      />
                    )}
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:border-violet-400 hover:text-violet-700">
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
              <p className="text-xs text-gray-400">Selecione um elemento na página pra editar o conteúdo.</p>
            )}
          </div>

          <div ref={styleManagerRef} className={rightTab === 'estilo' ? 'flex-1 overflow-y-auto' : 'hidden'} />
          <div ref={layerManagerRef} className={rightTab === 'layout' ? 'flex-1 overflow-y-auto' : 'hidden'} />
        </div>
      </div>
    </div>
  )
}
