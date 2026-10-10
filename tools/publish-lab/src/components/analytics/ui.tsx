'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Inbox, Minus, X } from 'lucide-react'
import { delta as calcDelta, pf } from './format'
import { Sparkline } from './charts'

export function Card({ title, sub, right, children, flush, className = '', style }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; flush?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <section className={`an-card an-fade ${flush ? 'flush' : ''} ${className}`} style={style}>
      {(title || right) && (
        <div className="an-card-h">
          <div style={{ minWidth: 0 }}>
            {title && <h3 className="an-card-t">{title}</h3>}
            {sub && <p className="an-card-s">{sub}</p>}
          </div>
          {right && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{right}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Delta({ now, before, inverse, suffix = '%' }: { now: number; before: number; inverse?: boolean; suffix?: string }) {
  const d = calcDelta(now, before)
  if (d === null) return <span className="an-delta">novo</span>
  const rounded = Math.round(d * 10) / 10
  const dir = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat'
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus
  return (
    <span className={`an-delta ${dir} ${inverse ? 'inv' : ''}`} title="Em relação ao período anterior de mesma duração">
      <Icon size={11} strokeWidth={2.6} />{Math.abs(rounded).toLocaleString('pt-BR')}{suffix}
    </span>
  )
}

export function Kpi({ label, value, unit, now, before, inverse, spark, color, icon, hint, hero }: {
  label: string; value: string | number; unit?: string; now?: number; before?: number; inverse?: boolean; spark?: number[]; color?: string; icon?: ReactNode; hint?: string; hero?: boolean
}) {
  return (
    <div className={`an-card an-kpi an-fade ${hero ? 'hero' : ''}`} title={hint}>
      <div className="an-kpi-l">{icon}{label}</div>
      <div className="an-kpi-v">{value}{unit && <small>{unit}</small>}</div>
      <div className="an-kpi-f">
        {now !== undefined && before !== undefined ? <Delta now={now} before={before} inverse={inverse} /> : <span />}
        {spark && spark.length > 1 && <Sparkline data={spark} color={color} />}
      </div>
    </div>
  )
}

export interface BarItem { key: string; label: ReactNode; value: number; text?: string; sub?: string; pct?: number; color?: string; onClick?: () => void; title?: string }

/** A ranked list where each row carries its own share as a soft bar behind the label. */
export function BarList({ items, empty = 'Sem dados neste período.', max }: { items: BarItem[]; empty?: string; max?: number }) {
  if (!items.length) return <div className="an-empty" style={{ padding: '26px 10px' }}>{empty}</div>
  const top = max ?? Math.max(...items.map(i => i.value), 1)
  return (
    <div className="an-list">
      {items.map(i => (
        <div key={i.key} className={`an-row ${i.onClick ? 'click' : ''}`} onClick={i.onClick} title={i.title}>
          <div className="fill" style={{ width: `${Math.max(2, i.pct ?? (i.value / top) * 100)}%`, background: i.color ? `color-mix(in srgb, ${i.color} 16%, transparent)` : undefined }} />
          <div className="l">{i.color && <i className="an-dot" style={{ background: i.color }} />}<span>{i.label}</span></div>
          <div className="r"><b>{i.text ?? i.value.toLocaleString('pt-BR')}</b>{i.sub !== undefined && <em>{i.sub}</em>}</div>
        </div>
      ))}
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="an-empty">
      {icon ?? <Inbox size={26} strokeWidth={1.5} />}
      <b>{title}</b>
      {text && <div style={{ maxWidth: 420 }}>{text}</div>}
      {action}
    </div>
  )
}

export const Skel = ({ h = 90, w = '100%' }: { h?: number; w?: number | string }) => <div className="an-skel" style={{ height: h, width: w }} />

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="an-err">{message}{onRetry && <button className="ed-btn ed-btn-sm" style={{ marginLeft: 10 }} onClick={onRetry}>Tentar de novo</button>}</div>
  )
}

export function Pill({ children, tone }: { children: ReactNode; tone?: 'bad' | 'good' | 'warn' | 'blue' }) {
  return <span className={`an-pill ${tone || ''}`}>{children}</span>
}

export function Seg<T extends string>({ value, onChange, options, full }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]; full?: boolean }) {
  return (
    <div className={`ed-seg ${full ? 'ed-seg-full' : ''}`}>
      {options.map(o => <button key={o.value} data-on={value === o.value} title={o.title} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  )
}

export function Head({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="an-head">
      <div><h1 className="an-h1">{title}</h1>{sub && <p className="an-sub">{sub}</p>}</div>
      {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div>}
    </div>
  )
}

export function Drawer({ title, onClose, children, width }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <>
      <div className="an-drawer-bg" onClick={onClose} />
      <aside className="an-drawer" style={width ? { width: `min(${width}px, 100vw)` } : undefined} role="dialog" aria-modal="true">
        <div className="an-drawer-h"><div style={{ fontWeight: 650, fontSize: 14, minWidth: 0 }}>{title}</div><button className="ed-ibtn" onClick={onClose} aria-label="Fechar"><X size={16} /></button></div>
        <div className="an-drawer-b">{children}</div>
      </aside>
    </>
  )
}

/** a menu that closes when clicking elsewhere */
export function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])
  return { open, setOpen, ref }
}

export const rate = (a: number, b: number) => pf(b > 0 ? (a / b) * 100 : 0)
