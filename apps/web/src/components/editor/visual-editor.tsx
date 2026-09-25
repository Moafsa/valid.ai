'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import grapesjs, { Editor } from 'grapesjs'
import 'grapesjs/dist/css/grapes.min.css'
import { ArrowLeft, Save, Loader2, Undo2, Redo2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { PromptEditModal } from './prompt-edit-modal'
import { PageAiEditModal } from './page-ai-edit-modal'
import { STARTER_BLOCKS } from '@/lib/visual-editor/starter-blocks'

interface Block {
  id: string
  type: string
  order: number
  generatedHtml?: string | null
  screenshot?: string | null
  [key: string]: any
}

interface VisualEditorProps {
  projectId: string
  pageId: string
  blocks: Block[]
}

// Block types that carry data no plain HTML can represent (a video's real
// source, a quiz step's answers/branching) — these round-trip through the
// canvas as flat, non-editable placeholders. Editing what's inside them
// happens elsewhere (the vsl/quiz-specific flows), never here.
const LOCKED_TYPES = new Set(['vsl', 'quiz-step', 'quiz-result'])

function isLocked(block: Block): boolean {
  return LOCKED_TYPES.has(block.type) || !block.generatedHtml
}

// AI-cloned sections carry <style> tags written for their ORIGINAL standalone
// page (e.g. `body { overflow: hidden }` for a full-viewport hero). Once
// several blocks share one scrollable canvas/document, a single block's
// html/body rule leaks page-wide and can silently disable scrolling for
// every section after it. Strip only the overflow behavior on html/body
// selectors — everything else (fonts, backgrounds, colors) is left intact.
function stripGlobalOverflow(html: string): string {
  const container = document.createElement('div')
  container.innerHTML = html
  container.querySelectorAll('style').forEach((styleEl) => {
    const probe = document.createElement('style')
    probe.textContent = styleEl.textContent || ''
    document.head.appendChild(probe)
    try {
      const rules = probe.sheet?.cssRules
      if (rules) {
        Array.from(rules as unknown as CSSStyleRule[]).forEach((rule) => {
          if (rule.selectorText && /(^|[\s,])(html|body)(?=[\s,.:#\[]|$)/.test(rule.selectorText)) {
            rule.style.removeProperty('overflow')
            rule.style.removeProperty('overflow-x')
            rule.style.removeProperty('overflow-y')
          }
        })
        styleEl.textContent = Array.from(rules).map((r) => r.cssText).join('\n')
      }
    } finally {
      document.head.removeChild(probe)
    }
  })
  return container.innerHTML
}

function blockToWrapperHtml(block: Block): string {
  const locked = isLocked(block)
  const attrs = `data-vai-block-id="${block.id}" data-vai-block-type="${block.type}" data-vai-locked="${locked}"`

  if (!locked) {
    return `<section ${attrs}>${stripGlobalOverflow(block.generatedHtml!)}</section>`
  }

  // Flat placeholder — deliberately NOT the block's real nested markup, so
  // there's nothing here that looks editable but silently wouldn't save.
  const poster = block.screenshot
    ? `<img src="${block.screenshot}" alt="" style="width:100%;display:block;opacity:.6;" />`
    : ''
  const label =
    block.type === 'vsl'
      ? '🎬 Vídeo VSL — não editável aqui'
      : block.type.startsWith('quiz')
      ? '❓ Etapa de quiz — não editável aqui'
      : '📸 Seção ainda sem código gerado'
  return `<section ${attrs} style="position:relative;">${poster}<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);color:#fff;font-size:14px;font-weight:600;text-align:center;padding:1rem;">${label}</div></section>`
}

/** Strips the outer wrapper tag, returning just its children's HTML. */
function innerHtmlOf(outerHtml: string): string {
  const temp = document.createElement('div')
  temp.innerHTML = outerHtml
  return temp.firstElementChild?.innerHTML ?? ''
}

// GrapesJS always includes this reset in editor.getCss(), even for a
// component with no rules of its own — strip it so we only re-embed a
// <style> tag when the block actually defines custom CSS.
const GJS_BASE_CSS = '* { box-sizing: border-box; } body {margin: 0;}'

export function VisualEditor({ projectId, pageId, blocks }: VisualEditorProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  // Locked blocks' real data never round-trips through the DOM — keep the
  // original objects so export can restore them by id untouched.
  const originalBlocksRef = useRef<Map<string, Block>>(new Map(blocks.map(b => [b.id, b])))
  const [saving, setSaving] = useState(false)
  const [editingBlock, setEditingBlock] = useState<{ id: string; code: string; component: any } | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [pageAiEdit, setPageAiEdit] = useState<{
    selected: { id: string; code: string } | null
    all: { id: string; code: string }[]
  } | null>(null)

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      fromElement: false,
      storageManager: false,
      canvas: {
        scripts: ['https://cdn.tailwindcss.com'],
      },
      blockManager: {
        blocks: STARTER_BLOCKS.map(b => ({
          id: b.id,
          label: b.label,
          category: 'Novas Seções',
          content: b.content,
        })),
      },
      styleManager: {
        sectors: [
          {
            name: 'Cores e texto',
            open: true,
            properties: [
              { property: 'color', name: 'Cor do texto' },
              { property: 'background-color', name: 'Cor de fundo' },
              { property: 'font-size', name: 'Tamanho da fonte' },
              { property: 'text-align', name: 'Alinhamento' },
            ],
          },
        ],
      },
    })
    editorRef.current = editor
    if (typeof window !== 'undefined') (window as any).__vaiEditor = editor

    editor.DomComponents.addType('vai-section', {
      isComponent: (el: HTMLElement) =>
        el.tagName === 'SECTION' && !!el.getAttribute?.('data-vai-block-id')
          ? { type: 'vai-section' }
          : undefined,
      model: {
        defaults: {
          draggable: true,
          droppable: false,
          copyable: true,
          removable: true,
        },
        init() {
          const locked = this.getAttributes()['data-vai-locked'] === 'true'
          this.set('editable', !locked)
          this.set('resizable', !locked)
          // `label` (not an icon-font class we can't guarantee is bundled)
          // so these render regardless of whatever icon font GrapesJS ships.
          const toolbar = [
            { attributes: { title: 'Mover' }, label: '✥', command: 'tlb-move' },
            { attributes: { title: 'Duplicar' }, label: '⧉', command: 'tlb-clone' },
            { attributes: { title: 'Remover' }, label: '🗑', command: 'tlb-delete' },
          ]
          if (!locked) {
            toolbar.push({
              attributes: { title: 'Editar com IA' },
              label: '✨',
              command: 'vai-open-ai-edit',
            } as any)
          }
          this.set('toolbar', toolbar)
        },
      },
    })

    editor.Commands.add('vai-open-ai-edit', {
      run(ed: Editor) {
        const comp = ed.getSelected()
        if (!comp) return
        const id = comp.getAttributes()['data-vai-block-id']
        if (!id) return
        const code = innerHtmlOf(comp.toHTML())
        setEditingBlock({ id, code, component: comp })
      },
    })

    // Freshly dropped starter blocks and freshly duplicated sections need
    // their own identity before export — assign it right when it happens
    // instead of trying to detect "no id" as a special case at save time.
    editor.on('block:drag:stop', (component: any) => {
      if (!component || component.getAttributes?.()['data-vai-block-id']) return
      component.addAttributes({
        'data-vai-block-id': crypto.randomUUID(),
        'data-vai-block-type': 'custom-html',
        'data-vai-locked': 'false',
      })
    })

    editor.on('component:clone', (component: any) => {
      const attrs = component.getAttributes?.() ?? {}
      if (attrs['data-vai-block-id']) {
        component.addAttributes({ 'data-vai-block-id': crypto.randomUUID() })
      }
    })

    const sorted = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    editor.setComponents(sorted.map(blockToWrapperHtml).join('\n'))

    const updateUndoState = () => {
      setCanUndo(editor.UndoManager.hasUndo())
      setCanRedo(editor.UndoManager.hasRedo())
    }
    editor.on(
      'component:add component:remove component:update component:styleUpdate rte:disable',
      updateUndoState
    )

    return () => {
      editor.destroy()
      editorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAiUpdated = (newCode: string) => {
    if (!editingBlock) return
    editingBlock.component.components(newCode)
    setEditingBlock(null)
  }

  const openPageAiEdit = () => {
    const editor = editorRef.current
    if (!editor) return
    const wrapper = editor.getWrapper()!
    const top = wrapper.components()

    const all: { id: string; code: string }[] = []
    top.forEach((comp: any) => {
      const attrs = comp.getAttributes()
      const id = attrs['data-vai-block-id']
      if (!id || attrs['data-vai-locked'] === 'true') return
      all.push({ id, code: innerHtmlOf(comp.toHTML()) })
    })

    // Walk up from whatever's selected to the top-level section, so
    // clicking into a heading or button still resolves to "this section".
    let node = editor.getSelected()
    let selected: { id: string; code: string } | null = null
    while (node && node.parent() && node.parent() !== wrapper) {
      node = node.parent()
    }
    if (node) {
      const attrs = node.getAttributes()
      if (attrs['data-vai-block-id'] && attrs['data-vai-locked'] !== 'true') {
        selected = { id: attrs['data-vai-block-id'], code: innerHtmlOf(node.toHTML()) }
      }
    }

    setPageAiEdit({ selected, all })
  }

  const handlePageAiApplied = (results: { id: string; code: string }[]) => {
    const editor = editorRef.current
    if (!editor) return
    const top = editor.getWrapper()!.components()
    results.forEach(({ id, code }) => {
      const comp = top.find((c: any) => c.getAttributes()['data-vai-block-id'] === id)
      comp?.components(code)
    })
  }

  const handleSave = async () => {
    const editor = editorRef.current
    if (!editor) return
    setSaving(true)
    try {
      const topLevel = editor.getWrapper()!.components()
      const outBlocks: Block[] = []
      // Authoritative safety net: the block:drag:stop/component:clone
      // listeners assign ids proactively so the UI looks right immediately,
      // but this is what actually guarantees no two sections ever reach the
      // database sharing an id, regardless of whether every GrapesJS event
      // fired the way we expect.
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
        const locked = attrs['data-vai-locked'] === 'true'

        if (locked) {
          const original = originalBlocksRef.current.get(id)
          if (original) {
            outBlocks.push({ ...original, order: index })
            return
          }
        }

        // comp.toHTML() only serializes the component tree — any <style>
        // block embedded in the original AI-generated HTML (common for
        // sections styled with custom CSS instead of Tailwind classes) gets
        // parsed out into GrapesJS's CSS Composer on load and would
        // otherwise be silently lost here. Re-embed it so the block still
        // renders correctly wherever generatedHtml is used directly
        // (published page, block-editor preview) and round-trips on reload.
        let scopedCss = (editor.getCss({ component: comp } as any) || '').trim()
        if (scopedCss.startsWith(GJS_BASE_CSS)) {
          scopedCss = scopedCss.slice(GJS_BASE_CSS.length).trim()
        }
        const innerHtml = innerHtmlOf(comp.toHTML())

        outBlocks.push({
          id,
          type: attrs['data-vai-block-type'] || 'custom-html',
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
        <span className="text-sm font-semibold text-gray-900">Editor Visual</span>
        <div className="flex items-center gap-2">
          <button
            onClick={openPageAiEdit}
            className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-purple-100"
          >
            <Sparkles className="h-4 w-4" />
            Editar com IA
          </button>
          <button
            onClick={() => editorRef.current?.runCommand('core:undo')}
            disabled={!canUndo}
            title="Desfazer"
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => editorRef.current?.runCommand('core:redo')}
            disabled={!canRedo}
            title="Refazer"
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0" ref={containerRef} />

      {editingBlock && (
        <PromptEditModal
          isOpen={!!editingBlock}
          onClose={() => setEditingBlock(null)}
          blockId={editingBlock.id}
          currentCode={editingBlock.code}
          onUpdated={handleAiUpdated}
        />
      )}

      {pageAiEdit && (
        <PageAiEditModal
          isOpen={!!pageAiEdit}
          onClose={() => setPageAiEdit(null)}
          selectedBlock={pageAiEdit.selected}
          allBlocks={pageAiEdit.all}
          onApplied={handlePageAiApplied}
        />
      )}
    </div>
  )
}
