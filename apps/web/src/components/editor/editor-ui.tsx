'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

/** Small building blocks of the editor UI. Styling lives in editor-theme.ts (.ed-* classes). */

/** The ✨ of the assistant, drawn so it looks the same on every device. */
export function Sparkle({ size = 18, mono = false }: { size?: number; mono?: boolean }) {
  const id = useRef('sp' + Math.random().toString(36).slice(2, 7)).current
  const fill = mono ? 'currentColor' : `url(#${id})`
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block', filter: mono ? undefined : 'drop-shadow(0 1px 1.5px rgba(0,0,0,.28))' }}>
      {!mono && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff6c9" />
            <stop offset="1" stopColor="#ffd34d" />
          </linearGradient>
        </defs>
      )}
      <path fill={fill} d="M10 2.5l1.9 5.6 5.6 1.9-5.6 1.9L10 17.5l-1.9-5.6L2.5 10l5.6-1.9L10 2.5z" />
      <path fill={fill} d="M18.2 12.8l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
      <path fill={fill} d="M18 2.2l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7z" opacity=".9" />
    </svg>
  )
}

export function IconBtn({
  children, tip, onClick, active, disabled, small, side, label,
}: {
  children: ReactNode
  tip?: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  small?: boolean
  side?: 'right' | 'top' | 'left'
  label?: string
}) {
  return (
    <button
      type="button"
      className={`ed-ibtn${small ? ' ed-ibtn-sm' : ''}`}
      data-tip={tip}
      data-tip-side={side}
      data-active={active ? 'true' : undefined}
      aria-label={label || tip}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function Seg<T extends string>({
  value, options, onChange, full,
}: {
  value: T | undefined
  options: { value: T; label?: ReactNode; title?: string }[]
  onChange: (v: T) => void
  full?: boolean
}) {
  return (
    <div className={`ed-seg${full ? ' ed-seg-full' : ''}`} role="group">
      {options.map(o => (
        <button key={o.value} type="button" title={o.title} data-on={value === o.value ? 'true' : undefined} onClick={() => onChange(o.value)}>
          {o.label ?? o.value}
        </button>
      ))}
    </div>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="ed-switch" data-on={on ? 'true' : undefined} onClick={() => onChange(!on)} />
}

export function Field({ label, children, hint }: { label?: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="ed-field">
      {label !== undefined && <label className="ed-label">{label}</label>}
      {children}
      {hint && <p className="ed-hint">{hint}</p>}
    </div>
  )
}

/** Collapsible group of controls. */
export function Group({ title, icon, defaultOpen = false, children, right }: { title: string; icon?: ReactNode; defaultOpen?: boolean; children: ReactNode; right?: ReactNode }) {
  return (
    <details className="ed-group" open={defaultOpen}>
      <summary>
        <span className="ed-section-title" style={{ color: 'var(--ed-text)', letterSpacing: '.01em', textTransform: 'none', fontSize: 12.5, fontWeight: 650 }}>
          {icon}
          {title}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {right}
          <ChevronRight className="chev" size={14} />
        </span>
      </summary>
      <div className="ed-group-body">{children}</div>
    </details>
  )
}

const RE_NUM = /^-?\d*\.?\d+$/

/**
 * A CSS length/number. Typing a bare number appends the default unit ("24" -> "24px");
 * typing anything with letters ("50%", "auto", "2rem") is kept as written. Arrow keys nudge it.
 */
export function CssField({
  label, value, placeholder, unit = 'px', onChange, step = 1, min, suffix,
}: {
  label?: ReactNode
  value: string
  placeholder?: string
  unit?: string
  onChange: (v: string) => void
  step?: number
  min?: number
  suffix?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value
  const commit = (raw: string) => {
    setDraft(null)
    const v = raw.trim()
    if (v === value) return
    if (v === '') return onChange('')
    onChange(RE_NUM.test(v) ? v + unit : v)
  }
  return (
    <Field label={label}>
      <div className="ed-num">
        <input
          className="ed-input"
          value={shown}
          placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => draft !== null && commit(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur() }
            if (e.key === 'Escape') { setDraft(null); (e.target as HTMLInputElement).blur() }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              const m = String(shown || placeholder || '').match(/^(-?\d*\.?\d+)([a-z%]*)$/i)
              if (!m) return
              e.preventDefault()
              const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
              let n = Math.round((parseFloat(m[1]) + d) * 100) / 100
              if (min !== undefined) n = Math.max(min, n)
              const next = n + (m[2] || unit)
              setDraft(null)
              onChange(next)
            }
          }}
        />
        {suffix && <span>{suffix}</span>}
      </div>
    </Field>
  )
}

export function toHex(color: string): string | null {
  if (!color) return null
  const c = color.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(c)) return c
  if (/^#[0-9a-f]{3}$/.test(c)) return '#' + c.slice(1).split('').map(x => x + x).join('')
  const m = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)$/)
  if (!m) return null
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
  if (a === 0) return null
  return '#' + [m[1], m[2], m[3]].map(n => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0')).join('')
}

export function ColorField({
  label, value, onChange, swatches,
}: {
  label?: ReactNode
  value: string
  onChange: (v: string) => void
  swatches?: string[]
}) {
  const hex = toHex(value)
  const [draft, setDraft] = useState<string | null>(null)
  const transparent = !value || /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)|transparent/i.test(value)
  return (
    <Field label={label}>
      <div className="ed-color">
        <span className="ed-color-sw">
          {!transparent && <i style={{ background: value }} />}
          <input type="color" value={hex ?? '#000000'} onChange={e => onChange(e.target.value)} aria-label="Escolher cor" />
        </span>
        <input
          type="text"
          value={draft ?? (transparent ? '' : hex ?? value)}
          placeholder="sem cor"
          onChange={e => setDraft(e.target.value)}
          onBlur={e => { if (draft !== null) { setDraft(null); onChange(e.target.value.trim()) } }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          spellCheck={false}
        />
      </div>
      {swatches && swatches.length > 0 && (
        <div className="ed-swatches">
          {swatches.slice(0, 12).map(c => (
            <button key={c} type="button" title={c} style={{ background: c }} onClick={() => onChange(c)} />
          ))}
        </div>
      )}
    </Field>
  )
}

/** Debounces a fast stream of changes (a range slider) into spaced calls. */
export function useThrottled<T extends (...a: any[]) => void>(fn: T, ms = 60): T {
  const last = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return ((...a: any[]) => {
    const now = Date.now()
    if (now - last.current >= ms) { last.current = now; ref.current(...a); return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { last.current = Date.now(); ref.current(...a) }, ms)
  }) as T
}
