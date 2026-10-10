'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import grapesjs, { Editor } from 'grapesjs'
import 'grapesjs/dist/css/grapes.min.css'
import {
  ArrowLeft, Check, ChevronDown, Code2, ExternalLink, Eye, Globe2, GripVertical, Image as ImageIcon, Keyboard,
  Layers, LayoutGrid, Loader2, Monitor, MousePointer2, Moon, PanelLeftClose, PanelLeftOpen, Palette, Plus, Redo2, Save,
  Search, Settings, Smartphone, Sun, Tablet, Undo2, Upload, ZoomIn, ZoomOut, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { pickBreakpoints, unwrapDesktopMedia, visibilityCss } from '@/lib/visual-editor/breakpoints'
import { ResponsiveGuard } from '@/lib/visual-editor/responsive-guard'
import { STARTER_BLOCKS, BLOCK_CATEGORIES } from '@/lib/visual-editor/starter-blocks'
import { EDITOR_CSS } from './editor-theme'
import { IconBtn, Seg, Sparkle, Switch } from './editor-ui'
import { ElementInspector, type Selected } from './element-inspector'
import { AiAssistantPanel } from './ai-assistant-panel'
import { EditorPublishDialog } from './editor-publish-dialog'
import { contentRoot, type EngineCtx } from '@/lib/visual-editor/ai-engine'

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

// Mirrors CloneShell in lib/clone-document.ts (that module is server-only).
interface PageShell {
  html?: Record<string, string>
  body?: Record<string, string>
  wrappers?: { tag: string; attrs: Record<string, string> }[]
  fontLinks?: string[]
}

interface VisualEditorProps {
  projectId: string
  pageId: string
  blocks: Block[]
  pageCss: string | null
  pages: PageSummary[]
  shell: PageShell | null
  projectName?: string
  projectSlug?: string | null
  /** this page has a phone version (slug) / this page IS a phone version of that desktop slug */
  phoneSlug?: string | null
  desktopSlug?: string | null
  pageName?: string
  /** library blocks the account's plan does not include (the interactive components): not offered */
  lockedBlocks?: string[]
}

const TAG_NAME: Record<string, string> = {
  section: 'Seção', header: 'Cabeçalho', footer: 'Rodapé', nav: 'Menu', main: 'Conteúdo', aside: 'Lateral', article: 'Artigo', form: 'Formulário',
  ul: 'Lista', ol: 'Lista', li: 'Item', img: 'Imagem', picture: 'Imagem', video: 'Vídeo', iframe: 'Vídeo / incorporado', svg: 'Ícone', input: 'Campo', textarea: 'Campo', select: 'Campo',
  button: 'Botão', a: 'Link', p: 'Texto', span: 'Texto', label: 'Rótulo', hr: 'Divisor', table: 'Tabela', blockquote: 'Citação', strong: 'Texto', em: 'Texto',
}
/** Friendly layer names ("Título: Quem somos") instead of GrapesJS's "Div / Div / Div". Held on the model only, never saved. */
function nameLayers(editor: Editor) {
  const um: any = editor.UndoManager
  const walk = (comp: any, depth: number) => {
    if (depth > 40) return
    const el = comp.getEl?.() as HTMLElement | undefined
    const tag = (el?.tagName || comp.get?.('tagName') || '').toLowerCase()
    if (tag && comp.get?.('type') !== 'textnode' && comp.get?.('type') !== 'wrapper' && !comp.get?.('custom-name')) {
      const text = (el?.innerText || '').replace(/\s+/g, ' ').trim()
      const snip = text.length > 28 ? text.slice(0, 27) + '…' : text
      let name = /^h[1-6]$/.test(tag) ? 'Título' : TAG_NAME[tag] || (comp.components?.().length ? 'Bloco' : 'Elemento')
      if (snip && ['Título', 'Texto', 'Botão', 'Link', 'Item', 'Rótulo', 'Citação'].includes(name)) name += ': ' + snip
      else if (name === 'Imagem') name += (el?.getAttribute('alt') ? ': ' + el.getAttribute('alt')!.slice(0, 24) : '')
      comp.set('custom-name', name)
    }
    comp.components?.().forEach((c: any) => walk(c, depth + 1))
  }
  um.stop?.()
  try { walk(editor.getWrapper(), 0) } finally { um.start?.() }
}

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const SAFE_TAG = /^[a-z][a-z0-9-]*$/
const SAFE_ATTR = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/
const attrString = (attrs?: Record<string, string>) =>
  Object.entries(attrs ?? {})
    .filter(([n]) => SAFE_ATTR.test(n) && !/^on/i.test(n))
    .map(([n, v]) => ` ${n}="${escAttr(String(v))}"`)
    .join('')

// Tags the block's root element with its identity attribute without
// touching anything else — a saved block may start with a <style> tag
// (its scoped CSS) ahead of the real root element.
function stampBlockId(html: string, id: string): string {
  const tpl = document.createElement('template')
  tpl.innerHTML = unwrapDesktopMedia(html)
  const root = Array.from(tpl.content.children).find(el => !['STYLE', 'LINK', 'SCRIPT'].includes(el.tagName))
  if (root && !root.hasAttribute('data-vai-block-id')) root.setAttribute('data-vai-block-id', id)
  return tpl.innerHTML
}

interface MediaItem {
  kind: 'image' | 'video' | 'background'
  component: any
  src: string
  label: string
  poster?: string
  /** the smart player marker (data-vai-player): its src lives inside a JSON attribute */
  player?: boolean
}

// GrapesJS always includes this reset in editor.getCss(), even for a
// component with no rules of its own — strip it so we only re-embed a
// <style> tag when the block actually defines custom CSS.
const GJS_BASE_CSS = '* { box-sizing: border-box; } body {margin: 0;}'

// Per-device visibility (Avançado tab) is a plain utility class toggled on
// the component, not a styleManager property — it needs its own always-
// available stylesheet, both live in the canvas iframe (so hidden-on-
// mobile actually previews as hidden when switching device) and baked
// into any saved block that uses one of these classes (see handleSave).
// max-width breakpoints match this editor's own deviceManager.devices
// (Tablet widthMedia: 992px, Mobile widthMedia: 575px) so what you see
// while editing matches what a real visitor's screen width triggers.
const VISIBILITY_CLASSES = ['vai-hide-desktop', 'vai-hide-tablet', 'vai-hide-mobile'] as const

// Inline SVG (not an imported lucide component) because this string is
// handed straight to GrapesJS as a toolbar button's `label` — it renders
// raw HTML, not React.
const AI_TOOLBAR_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/></svg>'

type Tab = 'elementos' | 'camadas' | 'midia' | 'estilos' | 'config'
type DeviceName = 'Desktop' | 'Tablet' | 'Mobile'

const RAIL: { key: Tab; label: string; Icon: typeof LayoutGrid }[] = [
  { key: 'elementos', label: 'Elementos', Icon: LayoutGrid },
  { key: 'camadas', label: 'Camadas', Icon: Layers },
  { key: 'midia', label: 'Mídia', Icon: ImageIcon },
  { key: 'estilos', label: 'Estilos', Icon: Palette },
  { key: 'config', label: 'Ajustes', Icon: Settings },
]

const PANEL_TITLE: Record<Tab, string> = {
  elementos: 'Elementos', camadas: 'Camadas', midia: 'Mídia', estilos: 'Estilos', config: 'Ajustes',
}

const NO_LOCKED_BLOCKS: string[] = []
export function VisualEditor({ projectId, pageId, blocks, pageCss, pages, shell, projectName, projectSlug, phoneSlug, desktopSlug, pageName, lockedBlocks = NO_LOCKED_BLOCKS }: VisualEditorProps) {
  // Tablet / Mobile edits are written for the screen ranges the page itself is built for (pages cloned before the
  // stylesheet was kept natively have no such CSS and keep the editor's own numbers)
  const bp = useMemo(() => (shell ? pickBreakpoints(pageCss) : { mobileMax: 575, tabletMax: 992 }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const bpRef = useRef(bp)
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const layerManagerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const selectedComponentRef = useRef<any>(null)
  const seedAiRef = useRef<((t: string) => void) | null>(null)
  const zoomModeRef = useRef<'fit' | number>('fit')

  const [editor, setEditor] = useState<Editor | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [tab, setTab] = useState<Tab>('elementos')
  const [panelOpen, setPanelOpen] = useState(true)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [device, setDeviceState] = useState<DeviceName>('Desktop')
  const [zoom, setZoom] = useState(100)
  const [zoomFit, setZoomFit] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [outlines, setOutlines] = useState(false)
  const [pageMenuOpen, setPageMenuOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [slug, setSlug] = useState<string | null>(projectSlug ?? null)
  const [blockSearch, setBlockSearch] = useState('')
  const [blockApi, setBlockApi] = useState<any>(null)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [mediaList, setMediaList] = useState<MediaItem[]>([])
  const [uploadingMediaIndex, setUploadingMediaIndex] = useState<number | null>(null)

  const sortedPages = useMemo(() => [...pages].sort((a, b) => a.order - b.order), [pages])
  const pagePath = (p: PageSummary, i: number) => (i === 0 ? '/' : `/${p.slug}`)
  const currentPageIndex = sortedPages.findIndex(p => p.id === pageId)
  const currentPage = sortedPages[currentPageIndex]
  const wrapperDepth = shell ? (shell.wrappers ?? []).filter(w => SAFE_TAG.test(w.tag)).length : 0
  const ctx: EngineCtx | null = useMemo(() => (editor ? { editor, wrapperDepth } : null), [editor, wrapperDepth])

  const bump = useCallback(() => setTick(t => t + 1), [])

  // theme: remembered per browser
  useEffect(() => {
    try { const t = localStorage.getItem('vai-editor-theme'); if (t === 'dark' || t === 'light') setTheme(t) } catch { /* private mode */ }
  }, [])
  const changeTheme = (t: 'light' | 'dark') => { setTheme(t); try { localStorage.setItem('vai-editor-theme', t) } catch { /* ignore */ } }

  // ───────────── editor boot ─────────────
  useEffect(() => {
    if (!containerRef.current || editorRef.current) return

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      fromElement: false,
      storageManager: false,
      panels: { defaults: [] },
      // A captured page (shell present) brings its own complete stylesheet:
      // the canvas must show it exactly as the original rendered — no
      // Tailwind CDN runtime and none of GrapesJS's protected base CSS
      // (box-sizing/margin resets) layered on top. Pages cloned before the
      // shell existed keep both, which is what they were built against.
      ...(shell
        ? {
            protectedCss: '',
            canvas: {},
            // GrapesJS drops text nodes that are only whitespace — and
            // trims U+00A0 as whitespace — so the &nbsp; separating the
            // words of a heading split into inline-block spans vanished
            // and "O verão da sua família" saved back as "Overãodasua…".
            // Keeping them makes the HTML round-trip text-exact.
            parser: { optionsHtml: { keepEmptyTextNodes: true } },
          }
        : { canvas: { scripts: ['https://cdn.tailwindcss.com'] } }),
      // Editing a styled element changes THAT element only, not every
      // other element that happens to share one of its classes.
      selectorManager: { componentFirst: true },
      deviceManager: {
        devices: [
          // A captured page's responsive CSS keys off real viewport widths
          // (e.g. a hero collage that only exists from 1280px up). A canvas
          // as wide as whatever is left of the browser window after the side
          // panel would silently show the TABLET layout; the clone's desktop
          // is 1440px, scaled down to fit (see fitCanvasZoom).
          // widthMedia '' = no media query: what is changed on the Desktop screen applies to every width the phone / tablet
          // rules do not override. (Left out, GrapesJS reuses `width` and wrote everything as `@media (max-width: 1440px)`:
          // edits that stopped applying on any screen wider than the editor's canvas.)
          { name: 'Desktop', width: shell ? '1440px' : '', widthMedia: '' },
          { name: 'Tablet', width: '768px', widthMedia: `${bp.tabletMax}px` },
          { name: 'Mobile', width: '375px', widthMedia: `${bp.mobileMax}px` },
        ],
      },
      // the element library, the inspector and the AI panel are our own UI; GrapesJS only does the work
      blockManager: {
        custom: true,
        blocks: STARTER_BLOCKS.map(b => ({ id: b.id, label: b.label, media: b.media, content: b.content, category: b.category })),
      },
      styleManager: { custom: true, sectors: [] },
      layerManager: { appendTo: layerManagerRef.current! },
    } as any)
    editorRef.current = editor
    setEditor(editor)
    if (typeof window !== 'undefined') (window as any).__vaiEditor = editor

    editor.on('block:custom', (props: any) => setBlockApi({ ...props }))

    editor.on('load', () => {
      const doc = editor.Canvas.getDocument()
      if (!doc) return
      if (shell) {
        // The original <html>/<body> attributes (font-variable classes,
        // theme classes...) live outside the editable content but drive
        // how everything inside it renders.
        Object.entries(shell.html ?? {}).forEach(([k, v]) => { try { doc.documentElement.setAttribute(k, v) } catch {} })
        Object.entries(shell.body ?? {}).forEach(([k, v]) => { try { doc.body.setAttribute(k, v) } catch {} })
        ;(shell.fontLinks ?? []).forEach(href => {
          const link = doc.createElement('link')
          link.rel = 'stylesheet'
          link.href = href
          doc.head.appendChild(link)
        })
      }
      const styleTag = doc.createElement('style')
      styleTag.textContent = (pageCss || '') + visibilityCss(bp) + `
        [data-vai-player]{background:#0b0b12!important}
        [data-vai-player]::after{content:'\\25B6  Player de vídeo';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:600 14px system-ui,sans-serif;opacity:.75}
        [data-vai-pitch-at]{outline:2px dashed rgba(10,114,245,.6);outline-offset:2px}`
      doc.head.appendChild(styleTag)
      fitCanvasZoom()
      // the phone version of a page is edited at phone size
      if (desktopSlug) editor.setDevice('Mobile')
      // the side panels are still settling when the canvas loads: measure again once they have
      ;[120, 450, 1200].forEach(t => setTimeout(fitCanvasZoom, t))
    })

    // Desktop is a fixed 1440px frame; scale it to the room the canvas
    // actually has. Tablet/Mobile frames are narrow enough to show 1:1.
    const fitCanvasZoom = () => {
      if (!containerRef.current) return
      const dev = (editor.getDevice() || 'Desktop') as DeviceName
      const manual = zoomModeRef.current
      let z = 100
      if (manual !== 'fit') z = manual
      else if (shell && dev === 'Desktop') {
        const available = containerRef.current.clientWidth
        z = available > 0 ? Math.min(100, Math.floor((available / 1440) * 100)) : 100
      }
      editor.Canvas.setZoom(z)
      setZoom(z)
      // GrapesJS scales around the middle of the canvas, which pushes a 1440px frame off to the right
      // inside a narrower window. Anchor it top-left instead and center it by hand.
      const frames = containerRef.current.querySelector('.gjs-cv-canvas__frames') as HTMLElement | null
      const wrapper = containerRef.current.querySelector('.gjs-frame-wrapper') as HTMLElement | null
      if (frames && wrapper) {
        const k = z / 100
        const room = containerRef.current.clientWidth
        frames.style.transformOrigin = '0 0'
        frames.style.marginTop = '20px'
        // a frame narrower than the canvas is already centered inside the (unscaled) frames box by GrapesJS
        // (read from the device, not the wrapper: GrapesJS resizes the wrapper a tick after the device changes)
        const dw = parseInt(String((editor.Devices as any).get(dev)?.get('width') ?? ''), 10)
        const w = dw > 0 ? dw : wrapper.offsetWidth
        const innerLeft = Math.max(0, (room - w) / 2)
        const m = Math.round((room - w * k) / 2 - innerLeft * k)
        frames.style.marginLeft = (w * k < room ? m : Math.max(0, m)) + 'px'
        frames.style.height = `calc((100% - 36px) / ${k})`
      }
    }
    ;(editor as any).__fit = fitCanvasZoom
    editor.on('change:device', () => { setDeviceState((editor.getDevice() || 'Desktop') as DeviceName); fitCanvasZoom() })
    const ro = new ResizeObserver(() => fitCanvasZoom())
    ro.observe(containerRef.current)

    editor.on('block:drag:stop', (component: any) => {
      if (!component || component.getAttributes?.()['data-vai-block-id']) return
      component.addAttributes({ 'data-vai-block-id': crypto.randomUUID() })
    })
    editor.on('component:clone', (component: any) => {
      const attrs = component.getAttributes?.() ?? {}
      if (attrs['data-vai-block-id']) component.addAttributes({ 'data-vai-block-id': crypto.randomUUID() })
    })

    // "Editar com IA" rides GrapesJS's own native per-component toolbar
    // (the floating move/clone/delete icons that already sit right next
    // to a selected element) instead of a hand-rolled floating bubble —
    // no iframe-coordinate math, no re-sync on scroll/resize/device switch.
    editor.Commands.add('vai:ai-edit', {
      run(ed: any) {
        if (ed.getSelected()) { setAiOpen(true); setPanelOpen(true) }
      },
    })
    editor.on('component:add', (component: any) => {
      const tb = component.get('toolbar') || []
      if (tb.some((t: any) => t.command === 'vai:ai-edit')) return
      component.set('toolbar', [
        ...tb,
        { attributes: { class: 'vai-tlb-ai', title: 'Pedir pra IA' }, label: AI_TOOLBAR_ICON, command: 'vai:ai-edit' },
      ])
    })

    const readSelection = (component: any) => {
      if (!component) {
        selectedComponentRef.current = null
        setSelected(null)
        setSelectedLabel(null)
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
      // leaves (a heading, a paragraph, a button's label).
      const children = component.components?.() ?? []
      const isTextLeaf = children.length === 0 || (children.length === 1 && children.at(0)?.get('type') === 'textnode')
      const classes: string[] = component.getClasses?.() ?? []
      const text = (el?.innerText ?? '').replace(/\s+/g, ' ').trim()
      setSelectedLabel(isImage ? 'a imagem selecionada' : text ? `“${text.length > 26 ? text.slice(0, 25) + '…' : text}”` : `<${tag || 'bloco'}>`)
      setSelected({
        text: el?.innerText ?? '',
        href: isLink ? component.getAttributes()['href'] ?? '' : null,
        isLink,
        isTextLeaf,
        isImage,
        src: isImage ? component.getAttributes()['src'] ?? '' : null,
        id: component.getAttributes()['id'] ?? '',
        hiddenOn: {
          desktop: classes.includes('vai-hide-desktop'),
          tablet: classes.includes('vai-hide-tablet'),
          mobile: classes.includes('vai-hide-mobile'),
        },
        nextStep: component.getAttributes()['data-vai-next'] ?? '',
        delay: component.getAttributes()['data-vai-delay'] ?? '',
        pitchAt: component.getAttributes()['data-vai-pitch-at'] ?? '',
        player: (() => {
          const raw = component.getAttributes()['data-vai-player']
          if (!raw) return null
          try { return JSON.parse(raw) } catch { return null }
        })(),
      })
      // picking something on the page takes you to its settings (unless you are working in layers/media)
      setTab(t => (t === 'elementos' || t === 'config' ? 'estilos' : t))
      setPanelOpen(true)
    }
    editor.on('component:selected', readSelection)
    editor.on('component:deselected', () => { if (!editor.getSelected()) readSelection(null) })

    const sorted = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    let guard: ResponsiveGuard | null = null
    if (shell) {
      // Blocks are the real children of the original content root: put
      // them back inside the original wrapper chain, with no extra
      // wrapper of ours (an added <section> would become a flex/grid child
      // in place of the block and break the original layout).
      const wrappers = (shell.wrappers ?? []).filter(w => SAFE_TAG.test(w.tag))
      const open = wrappers.map(w => `<${w.tag}${attrString(w.attrs)}>`).join('')
      const close = [...wrappers].reverse().map(w => `</${w.tag}>`).join('')
      const inner = sorted.map(b => (b.generatedHtml ? stampBlockId(b.generatedHtml, b.id) : '')).join('')
      editor.setComponents(open + inner + close)
      // a change made on the Desktop screen must not undo the phone / tablet design the page came with
      guard = new ResponsiveGuard(editor, { documentHtml: open + inner + close, pageCss: pageCss || '', htmlAttrs: attrString(shell.html), bodyAttrs: attrString(shell.body), bp })
      guard.install()
      ;(editor as any).__guard = guard
    } else {
      editor.setComponents(
        sorted
          .map(b => (b.generatedHtml ? `<section data-vai-block-id="${b.id}">${b.generatedHtml}</section>` : ''))
          .join('\n'),
      )
    }

    // names need the canvas to be rendered
    editor.on('load', () => { nameLayers(editor); (editor as any).clearDirtyCount?.(); editor.UndoManager.clear() })
    editor.on('component:add', (c: any) => { if (!c.get('custom-name')) setTimeout(() => nameLayers(editor), 50) })

    const sync = () => {
      setCanUndo(editor.UndoManager.hasUndo())
      setCanRedo(editor.UndoManager.hasRedo())
      setDirty(((editor as any).getDirtyCount?.() ?? 0) > 0)
    }
    editor.on('component:add component:remove component:update component:styleUpdate rte:disable update undo redo', sync)
    let raf = 0
    editor.on('component:styleUpdate component:update', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setTick(t => t + 1)) })
    ;(editor as any).clearDirtyCount?.()

    // ⌘S saves, ⌘J opens the assistant. GrapesJS binds these on the page AND inside the canvas frame.
    editor.Keymaps.add('vai:save', '⌘+s, ctrl+s', (() => { document.getElementById('ed-save-btn')?.click() }) as any, { prevent: true } as any)
    editor.Keymaps.add('vai:ai', '⌘+j, ctrl+j', (() => { setAiOpen(o => !o) }) as any, { prevent: true } as any)

    return () => {
      ro.disconnect()
      guard?.dispose()
      editor.destroy()
      editorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // leaving with unsaved changes
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  useEffect(() => { zoomModeRef.current = zoomFit ? 'fit' : zoom }, [zoomFit, zoom])
  // the panel opening or closing changes the room the canvas has
  useEffect(() => { const t = setTimeout(() => (editorRef.current as any)?.__fit?.(), 60); return () => clearTimeout(t) }, [panelOpen, previewing])

  // ───────────── media list ─────────────
  // The Mídia tab lists every image, video and background-image found by
  // walking the real GrapesJS component tree (not raw DOM) so "Trocar"
  // always has a real component to call .addAttributes/.addStyle on,
  // however deeply nested it is.
  const collectMedia = (collection: any, acc: MediaItem[]): MediaItem[] => {
    collection.forEach((c: any) => {
      const el = c.getEl?.()
      const tag = el?.tagName
      const attrs = c.getAttributes?.() ?? {}

      if (attrs['data-vai-player']) {
        try {
          const cfg = JSON.parse(attrs['data-vai-player'])
          if (cfg.src || cfg.embed) acc.push({ kind: 'video', component: c, src: cfg.src || cfg.embed, label: 'Player de vídeo', poster: cfg.poster, player: true })
        } catch { /* malformed config: not listed */ }
      } else if (tag === 'IMG') {
        const src = attrs.src || el.getAttribute('src') || ''
        if (src) acc.push({ kind: 'image', component: c, src, label: attrs.alt || '' })
      } else if (tag === 'VIDEO') {
        const poster = attrs.poster || el.getAttribute('poster') || undefined
        const ownSrc = attrs.src || el.getAttribute('src') || ''
        if (ownSrc) {
          acc.push({ kind: 'video', component: c, src: ownSrc, label: '', poster })
        } else {
          // Some pages set the video's source via a nested <source> tag
          // instead of a src="" attribute on <video> itself — swap that
          // child's src directly rather than the (attribute-less) parent.
          const sourceChild = (c.components?.() ?? []).filter((ch: any) => ch.getEl?.()?.tagName === 'SOURCE')[0]
          const sAttrs = sourceChild?.getAttributes?.() ?? {}
          const src = sAttrs.src || sourceChild?.getEl?.()?.getAttribute('src') || ''
          if (sourceChild && src) acc.push({ kind: 'video', component: sourceChild, src, label: '', poster })
        }
      }

      // A background-image can sit on ANY element (hero sections, cards),
      // regardless of its tag — check every component, not just img/video.
      const bg = c.getStyle?.()?.['background-image']
      if (typeof bg === 'string') {
        const bgMatch = bg.match(/url\(\s*["']?([^"')]+)["']?\s*\)/)
        if (bgMatch) acc.push({ kind: 'background', component: c, src: bgMatch[1], label: '' })
      }

      const children = c.components?.()
      if (children?.length) collectMedia(children, acc)
    })
    return acc
  }

  const refreshMediaList = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    setMediaList(collectMedia(ed.getWrapper()!.components(), []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (tab === 'midia') refreshMediaList()
  }, [tab, refreshMediaList])

  // ───────────── element edits ─────────────
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
  const applyIdEdit = (id: string) => {
    const comp = selectedComponentRef.current
    if (!comp) return
    comp.addAttributes({ id })
    setSelected(prev => (prev ? { ...prev, id } : prev))
  }
  // Funnel wiring lives in plain data attributes, so it is edited like any
  // other attribute: an empty value removes it.
  const applyDataAttr = (name: 'data-vai-next' | 'data-vai-delay', value: string, key: 'nextStep' | 'delay') => {
    const comp = selectedComponentRef.current
    if (!comp) return
    if (value) comp.addAttributes({ [name]: value })
    else comp.removeAttributes(name)
    setSelected(prev => (prev ? { ...prev, [key]: value } : prev))
  }
  const applyPitchAt = (value: string) => {
    const comp = selectedComponentRef.current
    if (!comp) return
    if (value) comp.addAttributes({ 'data-vai-pitch-at': value })
    else comp.removeAttributes('data-vai-pitch-at')
    setSelected(prev => (prev ? { ...prev, pitchAt: value } : prev))
  }
  // Smart-player settings live as JSON in one attribute; the player reads them on the published page.
  const applyPlayer = (patch: Record<string, unknown>) => {
    const comp = selectedComponentRef.current
    if (!comp) return
    let current: Record<string, unknown> = {}
    try { current = JSON.parse(comp.getAttributes()['data-vai-player'] || '{}') } catch { current = {} }
    const next = { ...current, ...patch }
    comp.addAttributes({ 'data-vai-player': JSON.stringify(next) })
    setSelected(prev => (prev ? { ...prev, player: next as any } : prev))
  }
  const applyVisibilityToggle = (d: 'desktop' | 'tablet' | 'mobile', hidden: boolean) => {
    const comp = selectedComponentRef.current
    if (!comp) return
    const cls = `vai-hide-${d}`
    if (hidden) comp.addClass(cls)
    else comp.removeClass(cls)
    setSelected(prev => (prev ? { ...prev, hiddenOn: { ...prev.hiddenOn, [d]: hidden } } : prev))
  }

  // A picture keeps showing the OLD file on other screen sizes through srcset / <picture><source>: those go with the swap
  const swapImageSource = (comp: any, url: string) => {
    comp.set('src', url)
    comp.addAttributes({ src: url })
    try { comp.removeAttributes(['srcset', 'sizes']) } catch { /* not an element with those */ }
    const parent = comp.parent?.()
    if (parent && String(parent.get('tagName') || '').toLowerCase() === 'picture') {
      parent.components().models
        .filter((c: any) => String(c.get('tagName') || '').toLowerCase() === 'source')
        .forEach((c: any) => c.remove())
    }
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
      swapImageSource(comp, data.url)
      if (comp === selectedComponentRef.current) setSelected(prev => (prev ? { ...prev, src: data.url } : prev))
      refreshMediaList()
      toast.success('Imagem atualizada!')
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar imagem')
    } finally {
      if (mediaIndex !== undefined) setUploadingMediaIndex(null)
      else setUploadingImage(false)
    }
  }

  // A smart player keeps its video address inside its JSON settings. A new video
  // also drops the old preview clip (it belonged to the old video).
  const setPlayerSource = (comp: any, url: string) => {
    let cfg: Record<string, unknown> = {}
    try { cfg = JSON.parse(comp.getAttributes()['data-vai-player'] || '{}') } catch { cfg = {} }
    const next = { ...cfg, src: url }
    delete (next as any).preview
    comp.addAttributes({ 'data-vai-player': JSON.stringify(next) })
    refreshMediaList()
  }

  // Mídias tab swap — unlike applyImageUploadTo (image-only, Conteúdo tab)
  // this handles all three kinds: image/video src, or a background-image
  // style property on whatever component carries it.
  const applyMediaUploadTo = async (item: MediaItem, file: File, index: number) => {
    setUploadingMediaIndex(index)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/editor/upload-media', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar arquivo')

      const comp = item.component
      if (item.player) {
        setPlayerSource(comp, data.url)
      } else if (item.kind === 'background') {
        comp.addStyle({ 'background-image': `url(${data.url})` })
      } else {
        swapImageSource(comp, data.url)
        if (comp === selectedComponentRef.current) setSelected(prev => (prev ? { ...prev, src: data.url } : prev))
      }
      refreshMediaList()
      toast.success(item.kind === 'video' ? 'Vídeo atualizado!' : item.kind === 'background' ? 'Fundo atualizado!' : 'Imagem atualizada!')
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar arquivo')
    } finally {
      setUploadingMediaIndex(null)
    }
  }

  // ───────────── library ─────────────
  const insertBlock = (id: string) => {
    const ed = editorRef.current
    const def = STARTER_BLOCKS.find(b => b.id === id)
    if (!ed || !def || !ctx) return
    const root = contentRoot(ctx)
    let at = root.components().length
    const sel = selectedComponentRef.current
    if (sel) {
      // after the top-level section that holds the selection
      let top = sel
      while (top.parent?.() && top.parent() !== root) top = top.parent()
      if (top.parent?.() === root) at = root.components().models.indexOf(top) + 1
    }
    const added = root.components().add(def.content, { at })
    const comp = Array.isArray(added) ? added[0] : added
    if (comp) {
      comp.addAttributes({ 'data-vai-block-id': crypto.randomUUID() })
      ed.select(comp)
      setTimeout(() => comp.getEl?.()?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60)
    }
    toast.success(`"${def.label}" adicionado`)
  }

  const blockModels = useMemo(() => {
    const m = new Map<string, any>()
    for (const b of blockApi?.blocks ?? []) m.set(b.getId?.() ?? b.get?.('id'), b)
    return m
  }, [blockApi])

  const filteredBlocks = useMemo(() => {
    const q = blockSearch.trim().toLowerCase()
    return STARTER_BLOCKS.filter(b => !lockedBlocks.includes(b.id) && (!q || `${b.label} ${b.keywords ?? ''} ${b.category}`.toLowerCase().includes(q)))
  }, [blockSearch, lockedBlocks])

  // ───────────── save / publish ─────────────
  const handleSave = useCallback(async (): Promise<boolean> => {
    const ed = editorRef.current
    if (!ed) return false
    setSaving(true)
    try {
      // With a shell, the blocks are the children of the innermost
      // wrapper (the original content root), not of <body> itself.
      let container: any = ed.getWrapper()!
      for (let depth = 0; shell && depth < wrapperDepth; depth++) {
        const first = container.components().at(0)
        if (!first) break
        container = first
      }
      const topLevel = container.components()
      const outBlocks: Block[] = []
      const seenIds = new Set<string>()

      let blockIndex = 0
      topLevel.forEach((comp: any) => {
        // stray whitespace text nodes between blocks aren't blocks
        if (comp.get('type') === 'textnode') return
        const index = blockIndex++
        let attrs = comp.getAttributes()
        let id = attrs['data-vai-block-id']
        if (!id || seenIds.has(id)) {
          id = crypto.randomUUID()
          comp.addAttributes({ 'data-vai-block-id': id })
          attrs = comp.getAttributes()
        }
        seenIds.add(id)

        let scopedCss = (ed.getCss({ component: comp } as any) || '').trim()
        if (scopedCss.startsWith(GJS_BASE_CSS)) scopedCss = scopedCss.slice(GJS_BASE_CSS.length).trim()
        // Legacy blocks were loaded wrapped in our own <section>, so only
        // its inside is the block; a shell block IS its own root element.
        const innerHtml = shell ? comp.toHTML() : comp.getInnerHTML ? comp.getInnerHTML() : comp.toHTML()

        // A block is saved standalone (its own generatedHtml string,
        // rendered outside GrapesJS on the published page) — if it uses
        // any vai-hide-* visibility class, the matching @media rule has to
        // travel with it, not just live in the canvas iframe's own <style>.
        if (VISIBILITY_CLASSES.some(cls => innerHtml.includes(cls))) {
          scopedCss = (scopedCss + visibilityCss(bpRef.current)).trim()
        }

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
      ;(ed as any).clearDirtyCount?.()
      setDirty(false)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2200)
      toast.success('Página salva!')
      return true
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar')
      return false
    } finally {
      setSaving(false)
    }
  }, [pageId, shell, wrapperDepth])

  const setDevice = (name: DeviceName) => { setZoomFit(true); zoomModeRef.current = 'fit'; editorRef.current?.setDevice(name) }
  const changeZoom = (delta: number) => {
    const next = Math.max(25, Math.min(200, Math.round((zoom + delta) / 5) * 5))
    zoomModeRef.current = next; setZoomFit(false)
    editorRef.current?.Canvas.setZoom(next); setZoom(next)
  }
  const fitZoom = () => { zoomModeRef.current = 'fit'; setZoomFit(true); setTimeout(() => (editorRef.current as any)?.__fit?.(), 0) }

  const togglePreview = (on: boolean) => {
    const ed = editorRef.current
    if (!ed) return
    setPreviewing(on)
    if (on) { ed.select(); ed.runCommand('core:preview') } else ed.stopCommand('core:preview')
    setAiOpen(false)
  }
  useEffect(() => {
    if (!previewing) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') togglePreview(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [previewing])

  const toggleOutlines = (on: boolean) => {
    setOutlines(on)
    const ed = editorRef.current
    if (!ed) return
    if (on) ed.runCommand('sw-visibility'); else ed.stopCommand('sw-visibility')
  }

  const askAiAbout = () => {
    setAiOpen(true)
    setTimeout(() => seedAiRef.current?.('Deixe esse elemento '), 80)
  }
  const registerSeed = useCallback((fn: (t: string) => void) => { seedAiRef.current = fn }, [])
  const getSelected = useCallback(() => selectedComponentRef.current, [])

  const copyCode = async (what: 'html' | 'css') => {
    const ed = editorRef.current
    if (!ed) return
    try {
      await navigator.clipboard.writeText(what === 'html' ? ed.getHtml() : ed.getCss() || '')
      toast.success(what === 'html' ? 'HTML copiado' : 'CSS copiado')
    } catch { toast.error('Não consegui copiar') }
  }

  // ───────────── render ─────────────
  const hideChrome = previewing
  const railBadge: Partial<Record<Tab, boolean>> = { estilos: !!selected }

  return (
    <div ref={rootRef} className="vai-ed" data-theme={theme} style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <style>{EDITOR_CSS}</style>

      {/* ─── top bar ─── */}
      <header className="ed-topbar" style={hideChrome ? { display: 'none' } : undefined}>
        <div className="ed-topbar-side">
          <IconBtn tip="Voltar ao projeto" onClick={() => { if (!dirty || confirm('Você tem mudanças sem salvar. Sair mesmo assim?')) router.push(`/projects/${projectId}`) }}><ArrowLeft size={17} /></IconBtn>
          <div className="ed-crumb">
            <span className="ed-crumb-name">{projectName || 'Projeto'}</span>
            <span style={{ color: 'var(--ed-text-3)' }}>/</span>
            <div style={{ position: 'relative' }}>
              <button className="ed-crumb-page" onClick={() => sortedPages.length > 1 && setPageMenuOpen(v => !v)} style={sortedPages.length <= 1 ? { cursor: 'default' } : undefined}>
                {currentPage ? currentPage.name || pagePath(currentPage, currentPageIndex) : pageName || 'Página'}
                {sortedPages.length > 1 && <ChevronDown size={13} />}
              </button>
              {pageMenuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setPageMenuOpen(false)} />
                  <div className="ed-menu">
                    {sortedPages.map((p, i) => (
                      <button key={p.id} data-on={p.id === pageId ? 'true' : undefined} onClick={() => { setPageMenuOpen(false); if (p.id !== pageId) { if (!dirty || confirm('Você tem mudanças sem salvar. Trocar de página mesmo assim?')) router.push(`/projects/${projectId}/editor/${p.slug}`) } }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || pagePath(p, i)}</span>
                        <span style={{ color: 'var(--ed-text-3)', fontSize: 11 }}>{pagePath(p, i)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {(phoneSlug || desktopSlug) && (
            <Seg
              value={desktopSlug ? 'phone' : 'desktop'}
              onChange={v => {
                const target = v === 'phone' ? phoneSlug : desktopSlug
                if (!target || (v === 'phone') === !!desktopSlug) return
                if (!dirty || confirm('Você tem mudanças sem salvar. Trocar de versão mesmo assim?')) router.push(`/projects/${projectId}/editor/${target}`)
              }}
              options={[{ value: 'desktop', label: 'Versão do computador' }, { value: 'phone', label: 'Versão do celular' }]}
            />
          )}
          <Seg
            value={device}
            onChange={v => setDevice(v)}
            options={[
              { value: 'Desktop', label: <Monitor size={15} />, title: 'Computador' },
              { value: 'Tablet', label: <Tablet size={15} />, title: 'Tablet' },
              { value: 'Mobile', label: <Smartphone size={15} />, title: 'Celular' },
            ]}
          />
          <div className="ed-zoom">
            <IconBtn small tip="Reduzir" onClick={() => changeZoom(-10)}><ZoomOut size={14} /></IconBtn>
            <button className="ed-btn ed-btn-ghost ed-btn-sm" style={{ minWidth: 52, padding: '0 6px', fontVariantNumeric: 'tabular-nums' }} onClick={fitZoom} title="Ajustar à tela">{zoom}%</button>
            <IconBtn small tip="Ampliar" onClick={() => changeZoom(10)}><ZoomIn size={14} /></IconBtn>
          </div>
        </div>

        <div className="ed-topbar-side end">
          <span className={`ed-dirty${dirty ? '' : ' saved'}`} style={{ marginRight: 4 }}>
            <i />
            {saving ? 'Salvando…' : dirty ? 'Mudanças não salvas' : justSaved ? 'Salvo agora' : 'Tudo salvo'}
          </span>
          <IconBtn tip="Desfazer (Ctrl Z)" disabled={!canUndo} onClick={() => editorRef.current?.runCommand('core:undo')}><Undo2 size={16} /></IconBtn>
          <IconBtn tip="Refazer (Ctrl Shift Z)" disabled={!canRedo} onClick={() => editorRef.current?.runCommand('core:redo')}><Redo2 size={16} /></IconBtn>
          <span style={{ width: 1, height: 20, background: 'var(--ed-line)', margin: '0 4px' }} />
          <button className="ed-btn" onClick={() => togglePreview(true)}><Eye size={14} /> Visualizar</button>
          <button id="ed-save-btn" className="ed-btn" onClick={() => handleSave()} disabled={saving}>
            {saving ? <Loader2 size={14} className="ed-spin" /> : justSaved ? <Check size={14} /> : <Save size={14} />} Salvar
          </button>
          <button className="ed-btn ed-btn-primary" onClick={() => setPublishOpen(true)}><Globe2 size={14} /> Publicar</button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* ─── left: rail + panel (+ the AI sheet) ─── */}
        <aside className="ed-side" style={hideChrome ? { display: 'none' } : undefined}>
          <nav className="ed-rail" aria-label="Painéis">
            {RAIL.map(({ key, label, Icon }) => (
              <button key={key} className="ed-rail-btn" data-on={tab === key && panelOpen ? 'true' : undefined} onClick={() => { if (tab === key && panelOpen) setPanelOpen(false); else { setTab(key); setPanelOpen(true) } }} aria-label={label}>
                <Icon size={19} strokeWidth={1.7} />
                {label}
                {railBadge[key] && <span className="ed-rail-badge" />}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <IconBtn tip={panelOpen ? 'Recolher painel' : 'Abrir painel'} side="right" onClick={() => setPanelOpen(o => !o)}>{panelOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</IconBtn>
          </nav>

          <div className="ed-panel" style={{ display: panelOpen ? 'flex' : 'none' }}>
            <div className="ed-panel-head" style={tab === 'estilos' && selected ? { display: 'none' } : undefined}>
              <span className="ed-panel-title">{PANEL_TITLE[tab]}</span>
              {tab === 'elementos' && <span className="ed-hint" style={{ margin: 0 }}>{STARTER_BLOCKS.length - lockedBlocks.length} blocos</span>}
            </div>

            {/* elementos */}
            <div style={{ display: tab === 'elementos' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              <div className="ed-search">
                <Search size={14} />
                <input ref={searchRef} className="ed-input" placeholder="Buscar elementos…" value={blockSearch} onChange={e => setBlockSearch(e.target.value)} />
              </div>
              <div className="ed-panel-body" style={{ paddingBottom: 84 }}>
                <div className="ed-tipbar"><b style={{ color: 'var(--ed-text)' }}>Arraste</b> pra página ou <b style={{ color: 'var(--ed-text)' }}>clique</b> pra adicionar embaixo do que está selecionado.</div>
                {lockedBlocks.length > 0 && <div className="ed-tipbar">Contagem regressiva, perguntas frequentes e formulário fazem parte dos <b style={{ color: 'var(--ed-text)' }}>componentes interativos</b>, que não estão no seu plano.</div>}
                {BLOCK_CATEGORIES.map(cat => {
                  const list = filteredBlocks.filter(b => b.category === cat)
                  if (!list.length) return null
                  return (
                    <div key={cat} className="ed-cat">
                      <div className="ed-cat-title"><span className="ed-section-title">{cat}</span><span className="ed-hint" style={{ margin: 0 }}>{list.length}</span></div>
                      <div className="ed-blocks">
                        {list.map(b => (
                          <button
                            key={b.id}
                            className="ed-block"
                            draggable
                            title="Arraste pra página ou clique pra adicionar"
                            onDragStart={ev => { const m = blockModels.get(b.id); if (m && blockApi) blockApi.dragStart(m, ev.nativeEvent) }}
                            onDragEnd={() => blockApi?.dragStop?.(false)}
                            onClick={() => insertBlock(b.id)}
                          >
                            <span className="ed-block-ico" dangerouslySetInnerHTML={{ __html: b.media }} />
                            <span className="ed-block-name">{b.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
                {filteredBlocks.length === 0 && <div className="ed-empty"><Search size={22} /><span><b>Nada com “{blockSearch}”</b><br />Tente “botão”, “depoimentos” ou “preço”.</span></div>}
              </div>
            </div>

            {/* camadas: the native tree stays mounted, only its visibility changes */}
            <div style={{ display: tab === 'camadas' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              <p className="ed-hint" style={{ margin: '0 14px 8px' }}>Veja a estrutura da página. Clique pra selecionar, arraste pra reordenar.</p>
              <div ref={layerManagerRef} className="ed-panel-body" style={{ paddingBottom: 84 }} />
            </div>

            {/* mídia */}
            <div style={{ display: tab === 'midia' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              <div className="ed-panel-body" style={{ paddingBottom: 84 }}>
                {mediaList.length === 0 ? (
                  <div className="ed-empty"><ImageIcon size={22} /><span><b>Nenhuma mídia</b><br />As imagens e vídeos da página aparecem aqui.</span></div>
                ) : (
                  (['image', 'video', 'background'] as MediaItem['kind'][]).map(kind => {
                    const items = mediaList.map((item, i) => ({ item, i })).filter(({ item }) => item.kind === kind)
                    if (!items.length) return null
                    return (
                      <div key={kind} style={{ marginBottom: 6 }}>
                        <div className="ed-cat-title" style={{ padding: '4px 14px 8px' }}>
                          <span className="ed-section-title">{kind === 'image' ? 'Imagens' : kind === 'video' ? 'Vídeos' : 'Fundos'}</span>
                          <span className="ed-hint" style={{ margin: 0 }}>{items.length}</span>
                        </div>
                        <div className="ed-media-grid">
                          {items.map(({ item, i }) => (
                            <div key={i} className="ed-media-card" onClick={() => editorRef.current?.select(item.component)} title="Selecionar na página">
                              {item.kind === 'image' && /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.src} alt={item.label} loading="lazy" />}
                              {item.kind === 'video' && <video src={item.player ? undefined : item.src} poster={item.poster} muted playsInline />}
                              {item.kind === 'background' && <div className="bg" style={{ backgroundImage: `url(${item.src})` }} />}
                              <span className="kind">{item.kind === 'image' ? 'Imagem' : item.kind === 'video' ? 'Vídeo' : 'Fundo'}</span>
                              <div className="over" onClick={e => e.stopPropagation()}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label || item.src.split('/').pop()}</span>
                                <label>
                                  {uploadingMediaIndex === i ? <Loader2 size={11} className="ed-spin" /> : <Upload size={11} />} Trocar
                                  <input type="file" accept={item.kind === 'video' ? 'video/*' : 'image/*'} disabled={uploadingMediaIndex !== null} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) applyMediaUploadTo(item, f, i); e.target.value = '' }} />
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                        {kind === 'video' && items.some(({ item }) => item.player) && (
                          <div style={{ padding: '0 14px 10px', display: 'grid', gap: 8 }}>
                            {items.filter(({ item }) => item.player).map(({ item, i }) => (
                              <input key={i} className="ed-input" type="url" defaultValue={item.src} placeholder="Link do vídeo (.mp4 ou .m3u8)" onBlur={e => { const v = e.target.value.trim(); if (v && v !== item.src && /^https?:\/\//i.test(v)) { setPlayerSource(item.component, v); toast.success('Vídeo do player atualizado!') } }} />
                            ))}
                            <p className="ed-hint" style={{ margin: 0 }}>Vídeos longos funcionam melhor em .m3u8 (carregam aos poucos).</p>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* estilos */}
            <div style={{ display: tab === 'estilos' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0, flex: 1, paddingBottom: 0 }}>
              {selected && editor ? (
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, paddingBottom: 72 }}>
                  <ElementInspector
                    editor={editor}
                    comp={selectedComponentRef.current}
                    selected={selected}
                    tick={tick}
                    sortedPages={sortedPages}
                    device={device}
                    setDevice={n => setDevice(n as DeviceName)}
                    uploadingImage={uploadingImage}
                    onText={applyTextEdit}
                    onHref={applyHrefEdit}
                    onId={applyIdEdit}
                    onDataAttr={applyDataAttr}
                    onPitchAt={applyPitchAt}
                    onPlayer={applyPlayer}
                    onVisibility={applyVisibilityToggle}
                    onUploadImage={f => applyImageUploadTo(selectedComponentRef.current, f)}
                    onAskAi={askAiAbout}
                    onBump={bump}
                  />
                </div>
              ) : (
                <div className="ed-empty" style={{ marginTop: 40 }}>
                  <MousePointer2 size={24} />
                  <span><b>Selecione algo na página</b><br />Clique em um título, botão, imagem ou seção pra mudar texto, cores, tamanhos e espaçamentos.</span>
                  <button className="ed-btn ed-btn-sm" onClick={() => setTab('elementos')}><Plus size={13} /> Adicionar elementos</button>
                </div>
              )}
            </div>

            {/* ajustes */}
            <div style={{ display: tab === 'config' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              <div className="ed-panel-body" style={{ paddingBottom: 84 }}>
                <div style={{ display: 'grid', gap: 22, padding: '4px 14px 18px' }}>
                  {sortedPages.length > 1 && (
                    <div>
                      <div className="ed-section-title" style={{ marginBottom: 8 }}>Páginas do projeto</div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        {sortedPages.map((p, i) => (
                          <button key={p.id} className="ed-btn ed-btn-ghost" style={{ justifyContent: 'space-between', height: 34, border: '1px solid var(--ed-line)', ...(p.id === pageId ? { background: 'var(--ed-accent-soft)', color: 'var(--ed-accent)', borderColor: 'var(--ed-accent-line)' } : {}) }} onClick={() => p.id !== pageId && (!dirty || confirm('Você tem mudanças sem salvar. Trocar de página mesmo assim?')) && router.push(`/projects/${projectId}/editor/${p.slug}`)}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || pagePath(p, i)}</span>
                            <span style={{ fontSize: 11, color: 'var(--ed-text-3)' }}>{pagePath(p, i)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="ed-section-title" style={{ marginBottom: 8 }}>Aparência do editor</div>
                    <Seg full value={theme} onChange={changeTheme} options={[{ value: 'light', label: <><Sun size={13} /> Claro</> }, { value: 'dark', label: <><Moon size={13} /> Escuro</> }]} />
                  </div>
                  <div>
                    <div className="ed-section-title" style={{ marginBottom: 10 }}>Visualização</div>
                    <div className="ed-toggle-row"><span>Mostrar contornos dos elementos</span><Switch on={outlines} onChange={toggleOutlines} label="Contornos" /></div>
                  </div>
                  <div>
                    <div className="ed-section-title" style={{ marginBottom: 8 }}>Código</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="ed-btn ed-btn-sm" style={{ flex: 1 }} onClick={() => copyCode('html')}><Code2 size={13} /> Copiar HTML</button>
                      <button className="ed-btn ed-btn-sm" style={{ flex: 1 }} onClick={() => copyCode('css')}><Code2 size={13} /> Copiar CSS</button>
                    </div>
                  </div>
                  <div>
                    <div className="ed-section-title" style={{ marginBottom: 8 }}><Keyboard size={12} /> Atalhos</div>
                    <div style={{ display: 'grid', gap: 7, fontSize: 12 }}>
                      {([['Salvar', 'Ctrl S'], ['Desfazer', 'Ctrl Z'], ['Refazer', 'Ctrl Shift Z'], ['Copiar / colar elemento', 'Ctrl C / V'], ['Excluir elemento', 'Delete'], ['Abrir o assistente', 'Ctrl J'], ['Sair da visualização', 'Esc']] as const).map(([a, k]) => (
                        <div key={a} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--ed-text-2)' }}><span>{a}</span><span className="ed-kbd">{k}</span></div>
                      ))}
                    </div>
                  </div>
                  {currentPage && (
                    <a className="ed-btn ed-btn-sm" href={`/projects/${projectId}/p/${currentPage.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Ver a página salva (rascunho)</a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* floating ✨ — opens the assistant inside this very sidebar */}
          {!aiOpen && !hideChrome && (
            <button className="ed-ai-orb" onClick={() => { setAiOpen(true) }} aria-label="Abrir o assistente de IA" style={{ left: panelOpen ? 78 : 76 }}>
              <span className="spark"><Sparkle size={20} /></span>
              Pergunte à IA
            </button>
          )}
          {aiOpen && editor && ctx && (
            <AiAssistantPanel editor={editor} ctx={ctx} getSelected={getSelected} selectedLabel={selectedLabel} onClose={() => setAiOpen(false)} onSeed={registerSeed} />
          )}
        </aside>

        {/* ─── canvas ─── */}
        <main ref={stageRef} className="ed-stage">
          <div style={{ height: '100%' }} ref={containerRef} />
          {!hideChrome && (
            <button
              className="ed-btn"
              style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20, borderRadius: 999, height: 36, padding: '0 16px', boxShadow: 'var(--ed-shadow-2)' }}
              onClick={() => { editorRef.current?.select(); setTab('elementos'); setPanelOpen(true); setTimeout(() => searchRef.current?.focus(), 50) }}
            >
              <Plus size={14} /> Adicionar seção
            </button>
          )}
          {previewing && (
            <div className="ed-preview-pill">
              <span>Visualizando</span>
              <Seg value={device} onChange={v => setDevice(v)} options={[{ value: 'Desktop', label: <Monitor size={14} /> }, { value: 'Tablet', label: <Tablet size={14} /> }, { value: 'Mobile', label: <Smartphone size={14} /> }]} />
              <button className="ed-btn" onClick={() => togglePreview(false)}><X size={13} /> Sair (Esc)</button>
            </div>
          )}
        </main>
      </div>

      {publishOpen && (
        <EditorPublishDialog
          projectId={projectId}
          currentSlug={slug}
          onClose={() => setPublishOpen(false)}
          onPublished={s => setSlug(s)}
          beforePublish={handleSave}
        />
      )}
    </div>
  )
}
