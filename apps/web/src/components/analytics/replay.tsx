'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, SkipForward } from 'lucide-react'
import { clock } from './format'

declare global { interface Window { rrweb?: any } }

let loader: Promise<void> | null = null
/** rrweb's replayer is kept as a static file of our own (public/vendor), loaded only when someone opens a recording */
function loadRrweb(): Promise<void> {
  if (window.rrweb?.Replayer) return Promise.resolve()
  if (loader) return loader
  const p = new Promise<void>((resolve, reject) => {
    if (!document.querySelector('link[data-rrweb]')) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/vendor/rrweb.min.css'; l.setAttribute('data-rrweb', '1'); document.head.appendChild(l)
    }
    const s = document.createElement('script'); s.src = '/vendor/rrweb.min.js'; s.async = true
    s.onload = () => (window.rrweb?.Replayer ? resolve() : reject(new Error('player')))
    s.onerror = () => reject(new Error('player'))
    document.head.appendChild(s)
  }).catch(e => { loader = null; throw e })
  loader = p
  return p
}

export function ReplayPlayer({ events, viewportW, viewportH }: { events: any[]; viewportW?: number | null; viewportH?: number | null }) {
  const host = useRef<HTMLDivElement>(null)
  const rp = useRef<any>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [total, setTotal] = useState(0)
  const [speed, setSpeed] = useState(2)
  const [skip, setSkip] = useState(true)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const fit = useCallback(() => {
    const el = host.current, r = rp.current
    if (!el || !r?.wrapper) return
    const w = viewportW || r.iframe?.width || 1280, h = viewportH || r.iframe?.height || 800
    const avail = el.clientWidth
    const k = Math.min(1, avail / Number(w))
    r.wrapper.style.transformOrigin = 'top left'
    r.wrapper.style.transform = `scale(${k})`
    el.style.height = `${Math.round(Number(h) * k)}px`
    const inner = el.querySelector('.replayer-wrapper') as HTMLElement | null
    if (inner) { inner.style.width = `${w}px`; inner.style.height = `${h}px` }
  }, [viewportW, viewportH])

  useEffect(() => {
    let dead = false
    setState('loading'); setPlaying(false); setCur(0)
    loadRrweb().then(() => {
      if (dead || !host.current) return
      host.current.innerHTML = ''
      try {
        const r = new window.rrweb.Replayer(events, { root: host.current, speed, skipInactive: skip, mouseTail: { strokeStyle: '#4da3ff', lineWidth: 3, duration: 400 }, triggerFocus: false, UNSAFE_replayCanvas: false })
        rp.current = r
        const meta = r.getMetaData()
        setTotal(meta.totalTime || 0)
        r.on('resize', () => requestAnimationFrame(fit))
        r.on('finish', () => setPlaying(false))
        setState('ready')
        fit()
        r.play(0); setPlaying(true)
      } catch { setState('error') }
    }).catch(() => !dead && setState('error'))
    return () => { dead = true; try { rp.current?.destroy?.() } catch { /* ignore */ } rp.current = null; if (timer.current) clearInterval(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  useEffect(() => { rp.current?.setConfig?.({ speed, skipInactive: skip }) }, [speed, skip])
  useEffect(() => {
    const on = () => fit()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [fit])
  useEffect(() => {
    if (state !== 'ready') return
    timer.current = setInterval(() => { const r = rp.current; if (r) setCur(Math.min(total, r.getCurrentTime())) }, 120)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [state, total])

  const toggle = () => { const r = rp.current; if (!r) return; if (playing) { r.pause(); setPlaying(false) } else { r.play(cur >= total ? 0 : cur); setPlaying(true) } }
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = rp.current; if (!r || !total) return
    const b = e.currentTarget.getBoundingClientRect()
    const t = Math.max(0, Math.min(total, ((e.clientX - b.left) / b.width) * total))
    if (playing) r.play(t); else r.pause(t)
    setCur(t)
  }
  return (
    <div className="an-player">
      <div className="an-player-view"><div ref={host} style={{ width: '100%', maxWidth: Math.max(320, Math.min(viewportW || 1280, 1280)), position: 'relative', overflow: 'hidden', background: '#fff', boxShadow: 'var(--ed-shadow-2)', borderRadius: 6 }} />
        {state === 'loading' && <div className="an-empty" style={{ position: 'absolute', inset: 0 }}>Preparando a gravação…</div>}
        {state === 'error' && <div className="an-empty" style={{ position: 'absolute', inset: 0 }}><b>Não consegui abrir essa gravação</b>Pode estar incompleta (a pessoa saiu muito rápido).</div>}
      </div>
      <div className="an-player-ctl">
        <button className="ed-btn ed-btn-primary ed-btn-sm" onClick={toggle} disabled={state !== 'ready'} style={{ width: 34, padding: 0 }}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
        <span className="an-dim" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 78 }}>{clock(cur / 1000)} / {clock(total / 1000)}</span>
        <div className="an-scrub" onClick={seek}><i style={{ width: `${total ? (cur / total) * 100 : 0}%` }} /><b style={{ left: `${total ? (cur / total) * 100 : 0}%` }} /></div>
        <div className="ed-seg">{[1, 2, 4, 8].map(s => <button key={s} data-on={speed === s} onClick={() => setSpeed(s)}>{s}x</button>)}</div>
        <button className="ed-btn ed-btn-sm" data-on={skip} onClick={() => setSkip(!skip)} title="Pula os momentos em que a pessoa não fez nada" style={skip ? { background: 'var(--ed-accent-soft)', color: 'var(--ed-accent)', borderColor: 'var(--ed-accent-line)' } : undefined}><SkipForward size={13} /> Pular pausas</button>
      </div>
    </div>
  )
}
