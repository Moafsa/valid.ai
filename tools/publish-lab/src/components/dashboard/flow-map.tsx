'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight, ChevronDown, Loader2, MousePointerClick, ListChecks, Timer, Search } from 'lucide-react'
import { RULE_LABEL, type FlowLink, type FlowRule } from '@/lib/clone-flow'

export interface FlowStep {
  slug: string
  name: string
  links: FlowLink[]
  rules: FlowRule[]
}

const EXTERNAL = '__external'
const NONE = '__none'

const KIND: Record<FlowLink['kind'], { label: string; icon: typeof ArrowRight }> = {
  next: { label: 'Botão', icon: MousePointerClick },
  href: { label: 'Botão', icon: MousePointerClick },
  goto: { label: 'Resposta', icon: ListChecks },
  auto: { label: 'Automático', icon: Timer },
}

export const shortName = (name: string, slug: string) => name.replace(/^Etapa \d+:?\s*/, '').slice(0, 40) || slug

/**
 * Destination picker. A funnel can have hundreds of steps and every button has one of these:
 * a native <select> listing all steps would put hundreds of thousands of <option>s in the page.
 * This one is a button; the list (with a search box) exists only while it is open.
 */
function DestSelect({
  value, steps, noneLabel, externalLabel, disabled, onPick, wide,
}: {
  value: string
  steps: FlowStep[]
  noneLabel: string
  externalLabel: string
  disabled?: boolean
  onPick: (v: string) => void
  wide?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const index = useMemo(() => new Map(steps.map((s, i) => [s.slug, i])), [steps])
  const current =
    value === NONE ? noneLabel : value === EXTERNAL ? externalLabel : index.has(value) ? `Etapa ${index.get(value)! + 1}: ${shortName(steps[index.get(value)!].name, value)}` : value
  const shown = open
    ? steps
        .map((s, i) => ({ s, i }))
        .filter(({ s, i }) => !q || `${i + 1} ${shortName(s.name, s.slug)}`.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 80)
    : []
  const pick = (v: string) => { setOpen(false); setQ(''); onPick(v) }
  return (
    <div className={`relative ${wide ? 'w-full' : 'max-w-[16rem]'}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-left text-xs text-zinc-100 transition hover:border-white/20 focus:border-sky-400 focus:outline-none disabled:opacity-50"
      >
        <span className="truncate">{current}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-white/10 bg-zinc-900 p-2 shadow-2xl shadow-black/60">
            {steps.length > 8 && (
              <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                <Search className="h-3 w-3 text-zinc-500" />
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar etapa..." className="w-full bg-transparent text-xs text-white placeholder:text-zinc-600 focus:outline-none" />
              </div>
            )}
            <div className="max-h-64 overflow-y-auto text-xs">
              <button type="button" onClick={() => pick(NONE)} className="block w-full rounded px-2 py-1.5 text-left text-zinc-300 hover:bg-white/10">{noneLabel}</button>
              {shown.map(({ s, i }) => (
                <button key={s.slug} type="button" onClick={() => pick(s.slug)} className={`block w-full truncate rounded px-2 py-1.5 text-left hover:bg-white/10 ${s.slug === value ? 'text-sky-300' : 'text-zinc-200'}`}>
                  {i + 1}. {shortName(s.name, s.slug)}
                </button>
              ))}
              {steps.length > shown.length && shown.length >= 80 && <p className="px-2 py-1 text-[11px] text-zinc-500">Mostrando 80. Use a busca pra achar as outras.</p>}
              <button type="button" onClick={() => pick(EXTERNAL)} className="block w-full rounded px-2 py-1.5 text-left text-zinc-300 hover:bg-white/10">{externalLabel}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * One step of the funnel: its exit rules and every button / answer with a destination picker.
 * Changes are saved straight into the step's HTML (see lib/clone-flow.ts) and show up on the
 * published page right away.
 */
export function StepCard({
  projectId, step, index, steps, compact,
}: {
  projectId: string
  step: FlowStep
  index: number
  steps: FlowStep[]
  compact?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const slugs = useMemo(() => new Set(steps.map(s => s.slug)), [steps])

  async function save(link: FlowLink | { rule: FlowRule }, target: string) {
    const isRule = 'rule' in link
    const key = isRule ? `${step.slug}:rule:${link.rule.id}` : `${step.slug}:${link.idx}`
    setBusy(key)
    try {
      const res = await fetch(`/api/projects/${projectId}/flow`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isRule ? { pageSlug: step.slug, ruleId: link.rule.id, target } : { pageSlug: step.slug, idx: link.idx, target }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Não consegui salvar')
      toast.success('Fluxo atualizado!')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={compact ? '' : 'rounded-2xl border border-white/10 bg-white/[0.025] p-4'}>
      {!compact && (
        <div className="mb-3 flex items-center gap-2.5 text-sm font-medium text-white">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white/10 px-1.5 text-xs text-zinc-200">{index + 1}</span>
          <span className="truncate">{step.name}</span>
        </div>
      )}
      {step.rules.length > 0 && (
        <div className="mb-3 space-y-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-2.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-amber-300/90">Regras de saída (o que a página original faz)</p>
          {step.rules.map(rule => {
            const key = `${step.slug}:rule:${rule.id}`
            const target = rule.goto ?? ''
            const isUrl = /^https?:\/\//i.test(target)
            const isStep = slugs.has(target)
            const value = !target ? NONE : isStep ? target : isUrl ? EXTERNAL : NONE
            return (
              <div key={key} className="space-y-1.5">
                <div className={compact ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-2'}>
                  <span className="min-w-0 flex-1 text-xs text-amber-100">
                    {RULE_LABEL[rule.trigger]}{(rule.trigger === 'time' || rule.trigger === 'video-time') && rule.after ? ` (${rule.after}s)` : ''}
                  </span>
                  {!compact && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-300/50" />}
                  <DestSelect
                    wide={compact}
                    disabled={busy === key}
                    value={value}
                    steps={steps}
                    noneLabel="Desligar essa regra"
                    externalLabel="Link externo (checkout, WhatsApp…)"
                    onPick={v => {
                      if (v === EXTERNAL) { setUrls(prev => ({ ...prev, [key]: isUrl ? target : '' })); return }
                      save({ rule }, v === NONE ? '' : v)
                    }}
                  />
                  {busy === key && <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />}
                </div>
                {(value === EXTERNAL || key in urls) && <UrlRow value={urls[key] ?? (isUrl ? target : '')} onChange={v => setUrls(prev => ({ ...prev, [key]: v }))} onSave={() => save({ rule }, (urls[key] ?? '').trim())} busy={busy === key} />}
              </div>
            )
          })}
        </div>
      )}
      {step.links.length === 0 ? (
        <p className="text-xs text-zinc-500">{step.rules.length ? 'Nenhum botão leva a outra etapa aqui.' : 'Nenhum botão leva a outra etapa aqui (é o fim do caminho).'}</p>
      ) : (
        <ul className="space-y-2">
          {step.links.map(link => {
            const key = `${step.slug}:${link.idx}`
            const isStep = slugs.has(link.target)
            const isUrl = /^https?:\/\//i.test(link.target)
            const value = !link.target ? NONE : isStep ? link.target : isUrl ? EXTERNAL : NONE
            const Icon = KIND[link.kind].icon
            return (
              <li key={key} className="rounded-xl border border-white/[0.06] bg-black/25 p-2.5">
                <div className={compact ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-2'}>
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-zinc-200">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <span className="shrink-0 rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">{KIND[link.kind].label}</span>
                    <span className="truncate">{link.label}</span>
                  </span>
                  {!compact && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" />}
                  <DestSelect
                    wide={compact}
                    disabled={busy === key}
                    value={value}
                    steps={steps}
                    noneLabel="Nenhuma (não faz nada)"
                    externalLabel="Link externo (checkout, WhatsApp…)"
                    onPick={v => {
                      if (v === EXTERNAL) { setUrls(prev => ({ ...prev, [key]: isUrl ? link.target : '' })); return }
                      save(link, v === NONE ? '' : v)
                    }}
                  />
                  {busy === key && <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />}
                </div>
                {(value === EXTERNAL || key in urls) && <UrlRow value={urls[key] ?? (isUrl ? link.target : '')} onChange={v => setUrls(prev => ({ ...prev, [key]: v }))} onSave={() => save(link, (urls[key] ?? '').trim())} busy={busy === key} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function UrlRow({ value, onChange, onSave, busy }: { value: string; onChange: (v: string) => void; onSave: () => void; busy: boolean }) {
  return (
    <div className="mt-2 flex gap-2">
      <input
        type="url"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="https://..."
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-sky-400 focus:outline-none"
      />
      <button
        onClick={onSave}
        disabled={busy || !/^https?:\/\//i.test(value.trim())}
        className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-40"
      >
        Salvar
      </button>
    </div>
  )
}

/** The list view: every step as a card, with a search box and paging for big funnels. */
export function FlowMap({ projectId, steps }: { projectId: string; steps: FlowStep[] }) {
  const PAGE = 15
  const [pg, setPg] = useState(0)
  const [filter, setFilter] = useState('')
  const rows = useMemo(
    () => steps.map((s, i) => ({ s, i })).filter(({ s, i }) => !filter || `${i + 1} ${s.name}`.toLowerCase().includes(filter.toLowerCase())),
    [steps, filter],
  )
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const view = rows.slice(Math.min(pg, pages - 1) * PAGE, Math.min(pg, pages - 1) * PAGE + PAGE)

  return (
    <div className="space-y-3">
      {steps.length > PAGE && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-xs text-zinc-300">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
            <Search className="h-3 w-3 text-zinc-500" />
            <input value={filter} onChange={e => { setFilter(e.target.value); setPg(0) }} placeholder={`Buscar entre ${steps.length} etapas...`} className="w-full bg-transparent text-xs text-white placeholder:text-zinc-600 focus:outline-none" />
          </div>
          <button disabled={pg <= 0} onClick={() => setPg(pg - 1)} className="rounded-lg bg-white/5 px-2.5 py-1.5 hover:bg-white/10 disabled:opacity-30">Anterior</button>
          <span>{Math.min(pg, pages - 1) + 1} / {pages}</span>
          <button disabled={pg >= pages - 1} onClick={() => setPg(pg + 1)} className="rounded-lg bg-white/5 px-2.5 py-1.5 hover:bg-white/10 disabled:opacity-30">Próxima</button>
        </div>
      )}
      {view.map(({ s: step, i }) => <StepCard key={step.slug} projectId={projectId} step={step} index={i} steps={steps} />)}
    </div>
  )
}
