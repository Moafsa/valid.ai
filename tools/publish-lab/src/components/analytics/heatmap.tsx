'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export type HeatMode = 'click' | 'scroll' | 'attention' | 'friction'
export interface HPoint { sel: string | null; ox: number; oy: number; x: number; y: number; dw: number; dh: number; vw: number; rage: boolean; dead: boolean }
export interface HElement { sel: string; text: string | null; clicks: number; share: number; rage: number; dead: number }

export const DEVICE_WIDTH: Record<string, number> = { desktop: 1280, tablet: 820, mobile: 390 }

/** blue -> green -> yellow -> red, 256 steps */
function palette(): Uint8ClampedArray {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 256, 0)
  grad.addColorStop(0.0, 'rgba(59,130,246,0)'); grad.addColorStop(0.18, 'rgba(59,130,246,.55)'); grad.addColorStop(0.4, 'rgba(34,197,94,.7)')
  grad.addColorStop(0.65, 'rgba(250,204,21,.85)'); grad.addColorStop(1, 'rgba(239,68,68,.95)')
  g.fillStyle = grad; g.fillRect(0, 0, 256, 1)
  return g.getImageData(0, 0, 256, 1).data
}

const bandColor = (v: number) => `hsla(${Math.round(230 - 230 * v)}, 85%, 52%, ${0.16 + 0.34 * v})`

/**
 * The page itself (the working copy, in a frame of the screen width being analysed) with the data drawn on top.
 * Clicks are stored against the element that was pressed plus where inside it, so every point is placed on the
 * element it belongs to in THIS frame, whatever the screen size it was recorded on. The overlay follows the frame's own scroll.
 */
export function Heatmap({ publicSlug, slug, device, mode, points, elements, scroll, height = 720, onReady }: {
  publicSlug: string; slug: string; device: string; mode: HeatMode
  points: HPoint[]; elements: HElement[]
  scroll: { reach: number[]; attention: number[]; views: number } | null
  height?: number
  onReady?: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const pal = useRef<Uint8ClampedArray | null>(null)
  const [ready, setReady] = useState(false)
  const [docH, setDocH] = useState(0)
  const width = DEVICE_WIDTH[device] || 1280
  const raf = useRef(0)

  const draw = useCallback(() => {
    const f = frame.current, c = canvas.current
    if (!f || !c || !ready) return
    const win = f.contentWindow, doc = f.contentDocument
    if (!win || !doc) return
    const dpr = 1
    const w = f.clientWidth, h = f.clientHeight
    if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr }
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    const sx = win.scrollX, sy = win.scrollY
    const dh = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0)
    const dw = Math.max(doc.documentElement.scrollWidth, 1)

    if (mode === 'scroll' || mode === 'attention') {
      if (!scroll) return
      for (let i = 0; i < 10; i++) {
        const top = (i / 10) * dh - sy, bot = ((i + 1) / 10) * dh - sy
        if (bot < 0 || top > h) continue
        const val = mode === 'scroll' ? (i === 0 ? 100 : scroll.reach[i - 1] ?? 0) / 100 : Math.min(1, (scroll.attention[i] ?? 0) / Math.max(1, Math.max(...scroll.attention)))
        ctx.fillStyle = bandColor(val)
        ctx.fillRect(0, top, w, bot - top)
        const label = mode === 'scroll' ? `${Math.round(val * 100)}% chegam aqui` : `${Math.round(scroll.attention[i] ?? 0)}% da atenção`
        ctx.font = '700 12px system-ui, sans-serif'
        ctx.textAlign = 'right'
        const ty = Math.max(top + 16, Math.min(bot - 6, 18 + 0))
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(label, w - 10, Math.max(top + 17, 17)); ctx.fillStyle = '#fff'; ctx.fillText(label, w - 10, Math.max(top + 17, 17))
        void ty
      }
      return
    }

    // where each point lands in this frame
    const cache = new Map<string, DOMRect | null>()
    const rectOf = (sel: string) => {
      if (cache.has(sel)) return cache.get(sel)!
      let r: DOMRect | null = null
      try { const el = doc.querySelector(sel); if (el) r = el.getBoundingClientRect() } catch { /* a selector the page no longer has */ }
      cache.set(sel, r)
      return r
    }
    const place = (p: HPoint): [number, number] | null => {
      if (p.sel) {
        const r = rectOf(p.sel)
        if (r && r.width > 0 && r.height > 0) return [r.left + (p.ox / 1000) * r.width, r.top + (p.oy / 1000) * r.height]
      }
      if (!p.dw || !p.dh) return null
      return [(p.x / p.dw) * dw - sx, (p.y / p.dh) * dh - sy]
    }
    const list = mode === 'friction' ? points.filter(p => p.rage || p.dead) : points

    if (mode === 'friction') {
      for (const p of list) {
        const at = place(p)
        if (!at || at[1] < -20 || at[1] > h + 20) continue
        ctx.beginPath(); ctx.arc(at[0], at[1], 9, 0, Math.PI * 2)
        ctx.fillStyle = p.rage ? 'rgba(229,72,77,.35)' : 'rgba(245,158,11,.35)'; ctx.fill()
        ctx.lineWidth = 2; ctx.strokeStyle = p.rage ? '#e5484d' : '#f59e0b'; ctx.stroke()
      }
      return
    }

    // click heat
    const shadow = document.createElement('canvas'); shadow.width = w; shadow.height = h
    const s = shadow.getContext('2d')!
    const r = device === 'mobile' ? 26 : 34
    for (const p of list) {
      const at = place(p)
      if (!at || at[1] < -r || at[1] > h + r || at[0] < -r || at[0] > w + r) continue
      const g = s.createRadialGradient(at[0], at[1], 0, at[0], at[1], r)
      g.addColorStop(0, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)')
      s.fillStyle = g; s.fillRect(at[0] - r, at[1] - r, r * 2, r * 2)
    }
    const img = s.getImageData(0, 0, w, h)
    const pl = pal.current || (pal.current = palette())
    // heat is relative: the busiest spot of this page is the hottest, the rest is measured against it
    let top = 1
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > top) top = img.data[i]
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3]
      if (!a) continue
      const k = Math.min(255, Math.round((a / top) * 255)) * 4
      img.data[i] = pl[k]; img.data[i + 1] = pl[k + 1]; img.data[i + 2] = pl[k + 2]; img.data[i + 3] = pl[k + 3]
    }
    ctx.putImageData(img, 0, 0)
    // the most pressed elements, numbered
    elements.slice(0, 8).forEach((e, i) => {
      const rc = rectOf(e.sel)
      if (!rc || rc.width < 2) return
      const cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2
      if (cy < -12 || cy > h + 12) return
      const label = `${i + 1} · ${Math.round(e.share)}%`
      ctx.font = '700 11px system-ui, sans-serif'
      const tw = ctx.measureText(label).width + 14
      ctx.fillStyle = 'rgba(17,17,19,.92)'
      ctx.beginPath(); ctx.roundRect(cx - tw / 2, cy - 11, tw, 22, 11); ctx.fill()
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(label, cx, cy + 4)
    })
  }, [ready, mode, points, elements, scroll, device])

  const schedule = useCallback(() => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(draw) }, [draw])
  useEffect(() => { schedule() }, [schedule, docH])

  // follow the page's own scrolling and layout changes
  useEffect(() => {
    if (!ready) return
    const f = frame.current
    const win = f?.contentWindow
    if (!win) return
    win.addEventListener('scroll', schedule, { passive: true })
    win.addEventListener('resize', schedule)
    const t = setInterval(() => {
      const d = f?.contentDocument
      if (!d) return
      const h = Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight || 0)
      setDocH(prev => (Math.abs(prev - h) > 4 ? h : prev))
    }, 800)
    return () => { win.removeEventListener('scroll', schedule); win.removeEventListener('resize', schedule); clearInterval(t) }
  }, [ready, schedule])

  const onLoad = () => {
    const f = frame.current
    const d = f?.contentDocument
    if (!f || !d) return
    // lazy pictures below the fold must be there, or the layout the points were recorded on is not the one drawn
    d.querySelectorAll('img[loading="lazy"]').forEach(i => i.setAttribute('loading', 'eager'))
    setReady(true)
    setTimeout(() => { setDocH(Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight || 0)); onReady?.() }, 600)
  }

  useEffect(() => { setReady(false) }, [slug, device, publicSlug])

  return (
    <div className="an-hm-wrap">
      <div className="an-hm-stage" style={{ width, height }}>
        <iframe
          ref={frame} key={`${slug}-${device}`} title="Página analisada" width={width} height={height}
          src={`/s/${encodeURIComponent(publicSlug)}/${encodeURIComponent(slug)}?vai_preview=1&v=${device === 'mobile' ? 'm' : 'd'}`} onLoad={onLoad}
        />
        <canvas ref={canvas} />
        {!ready && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', color: '#888', fontSize: 13 }}>Carregando a página…</div>}
      </div>
    </div>
  )
}
