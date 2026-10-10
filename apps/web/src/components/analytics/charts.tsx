'use client'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/** the width of an element, followed as it resizes (charts draw in real pixels so text stays crisp) */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth || 600)
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export const SERIES_COLORS = ['var(--an-s1)', 'var(--an-s2)', 'var(--an-s3)', 'var(--an-s4)', 'var(--an-s5)', 'var(--an-s6)']

export function Sparkline({ data, color = 'var(--ed-accent)', w = 84, h = 26 }: { data: number[]; color?: string; w?: number; h?: number }) {
  const max = Math.max(...data, 1)
  const step = w / Math.max(1, data.length - 1)
  const pts = data.map((v, i) => [i * step, h - 2 - (v / max) * (h - 5)] as const)
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flexShrink: 0 }} aria-hidden>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export interface XYSeries { name: string; color: string; pts: { x: number; y: number }[]; fill?: boolean; dashed?: boolean }
export interface XYBand { x1: number; x2: number; label?: string; tone?: 'bad' | 'good' | 'info' }

/**
 * Line / area chart for numbers over a numeric x (time, seconds of a video). Hover shows a crosshair and every series'
 * value at that x. `bands` shade stretches (for example the seconds where the audience of a video falls fastest).
 */
export function XYChart({ series, height = 260, xTicks = 6, xFmt = (x: number) => String(x), yFmt = (y: number) => String(y), yMax, yMin = 0, bands = [], tipTitle, empty = 'Sem dados' }: {
  series: XYSeries[]; height?: number; xTicks?: number; xFmt?: (x: number) => string; yFmt?: (y: number) => string; yMax?: number; yMin?: number
  bands?: XYBand[]; tipTitle?: (x: number) => string; empty?: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pad = { l: 44, r: 14, t: 12, b: 26 }
  const all = series.flatMap(s => s.pts)
  const xs = all.map(p => p.x)
  const x0 = xs.length ? Math.min(...xs) : 0, x1 = xs.length ? Math.max(...xs) : 1
  const ymax = yMax ?? niceMax(Math.max(...all.map(p => p.y), 1))
  const iw = Math.max(10, width - pad.l - pad.r), ih = height - pad.t - pad.b
  const sx = (x: number) => pad.l + ((x - x0) / Math.max(1e-9, x1 - x0)) * iw
  const sy = (y: number) => pad.t + ih - ((y - yMin) / Math.max(1e-9, ymax - yMin)) * ih
  const yTicks = useMemo(() => Array.from({ length: 5 }, (_, i) => yMin + ((ymax - yMin) * i) / 4), [ymax, yMin])
  const xt = useMemo(() => Array.from({ length: xTicks }, (_, i) => x0 + ((x1 - x0) * i) / Math.max(1, xTicks - 1)), [x0, x1, xTicks])

  const nearest = (s: XYSeries, x: number) => s.pts.reduce((b, p) => (Math.abs(p.x - x) < Math.abs(b.x - x) ? p : b), s.pts[0])
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = x0 + ((e.clientX - r.left - pad.l) / iw) * (x1 - x0)
    setHover(Math.min(x1, Math.max(x0, x)))
  }
  if (!all.length) return <div className="an-empty" style={{ height }}>{empty}</div>
  const hx = hover !== null && series[0]?.pts.length ? nearest(series[0], hover).x : null

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg className="an-chart" width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line className="grid" x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} />
            <text x={pad.l - 8} y={sy(t) + 3.5} textAnchor="end">{yFmt(t)}</text>
          </g>
        ))}
        {xt.map((t, i) => <text key={i} x={sx(t)} y={height - 7} textAnchor={i === 0 ? 'start' : i === xt.length - 1 ? 'end' : 'middle'}>{xFmt(t)}</text>)}
        {bands.map((b, i) => (
          <g key={i}>
            <rect x={sx(b.x1)} y={pad.t} width={Math.max(2, sx(b.x2) - sx(b.x1))} height={ih} fill={b.tone === 'good' ? 'var(--an-good)' : b.tone === 'info' ? 'var(--ed-accent)' : 'var(--an-bad)'} opacity={0.1} rx={4} />
            {b.label && <text x={(sx(b.x1) + sx(b.x2)) / 2} y={pad.t + 11} textAnchor="middle" style={{ fill: b.tone === 'good' ? 'var(--an-good)' : 'var(--an-bad)', fontWeight: 700 }}>{b.label}</text>}
          </g>
        ))}
        {series.map((s, si) => {
          const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
          const id = `g${si}-${s.color.replace(/\W/g, '')}`
          return (
            <g key={s.name}>
              {s.fill && (
                <>
                  <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity="0.28" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient></defs>
                  <path d={`${d} L${sx(s.pts[s.pts.length - 1].x)},${sy(yMin)} L${sx(s.pts[0].x)},${sy(yMin)} Z`} fill={`url(#${id})`} />
                </>
              )}
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
            </g>
          )
        })}
        {hx !== null && (
          <g>
            <line x1={sx(hx)} x2={sx(hx)} y1={pad.t} y2={pad.t + ih} stroke="var(--ed-line-2)" strokeDasharray="3 3" />
            {series.map(s => { const p = nearest(s, hx); return <circle key={s.name} cx={sx(p.x)} cy={sy(p.y)} r={4} fill="var(--ed-panel)" stroke={s.color} strokeWidth={2} /> })}
          </g>
        )}
      </svg>
      {hx !== null && (
        <div className="an-tip" style={{ left: Math.min(width - 80, Math.max(80, sx(hx))), top: pad.t + 6 }}>
          <b>{tipTitle ? tipTitle(hx) : xFmt(hx)}</b>
          {series.map(s => <div key={s.name}><span><i style={{ background: s.color }} />{s.name}</span><strong>{yFmt(nearest(s, hx).y)}</strong></div>)}
        </div>
      )}
    </div>
  )
}

function niceMax(v: number) {
  if (v <= 4) return 4
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return m * p
}

/** a single stacked bar split into shares (devices, for example) */
export function StackBar({ parts, height = 10 }: { parts: { key: string; label: ReactNode; value: number; color: string }[]; height?: number }) {
  const total = parts.reduce((t, p) => t + p.value, 0) || 1
  return (
    <div>
      <div style={{ display: 'flex', height, borderRadius: height, overflow: 'hidden', background: 'var(--ed-active)', gap: 2 }}>
        {parts.filter(p => p.value > 0).map(p => <div key={p.key} title={`${p.key}: ${Math.round((p.value / total) * 100)}%`} style={{ width: `${(p.value / total) * 100}%`, background: p.color, transition: 'width .5s' }} />)}
      </div>
      <div className="an-legend" style={{ marginTop: 10 }}>
        {parts.map(p => <span key={p.key}><i className="an-dot" style={{ background: p.color }} />{p.label} <b style={{ color: 'var(--ed-text)' }}>{Math.round((p.value / total) * 100)}%</b></span>)}
      </div>
    </div>
  )
}

/** vertical bars (a histogram): where people left, or how deep they scrolled */
export function Bars({ data, height = 120, color = 'var(--ed-accent)', fmt = (v: number) => `${v}%`, labels }: { data: number[]; height?: number; color?: string; fmt?: (v: number) => string; labels?: string[] }) {
  const max = Math.max(...data, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height }}>
      {data.map((v, i) => (
        <div key={i} title={`${labels?.[i] ?? i}: ${fmt(v)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 10, color: 'var(--ed-text-3)', fontVariantNumeric: 'tabular-nums' }}>{v > 0 ? fmt(v) : ''}</span>
          <div style={{ width: '100%', height: `${Math.max(2, (v / max) * (height - 34))}px`, background: color, opacity: 0.25 + 0.75 * (v / max), borderRadius: '5px 5px 2px 2px', transition: 'height .5s' }} />
          {labels && <span style={{ fontSize: 9.5, color: 'var(--ed-text-3)' }}>{labels[i]}</span>}
        </div>
      ))}
    </div>
  )
}
