'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Eye, EyeOff, Loader2, Lock, Plus, Star } from 'lucide-react'
import { FEATURE_DEFS, FEATURE_KEYS, LIMIT_DEFS, LIMIT_KEYS, brlCents, fmtLimit, type PlanView } from '@/lib/plans-shared'

const box = 'rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none focus:border-violet-400/60 disabled:opacity-50'

interface Draft {
  name: string; description: string; price: string; interval: 'month' | 'year'; sortOrder: string; ctaLabel: string
  highlight: boolean; active: boolean; visible: boolean; benefits: string
  limits: Record<string, { unlimited: boolean; value: string }>
  features: Record<string, boolean>
}

function toDraft(p?: PlanView): Draft {
  return {
    name: p?.name ?? '', description: p?.description ?? '', price: p ? String(p.priceCents / 100).replace('.', ',') : '', interval: (p?.interval as 'month' | 'year') ?? 'month', sortOrder: String(p?.sortOrder ?? 50), ctaLabel: p?.ctaLabel ?? '',
    highlight: p?.highlight ?? false, active: p?.active ?? true, visible: p?.visible ?? true, benefits: (p?.benefits ?? []).join('\n'),
    limits: Object.fromEntries(LIMIT_KEYS.map(k => [k, { unlimited: p ? p.limits[k] === null : true, value: p && p.limits[k] !== null ? String(p.limits[k]) : '' }])),
    features: Object.fromEntries(FEATURE_KEYS.map(k => [k, p ? p.features[k] : false])),
  }
}

function payload(d: Draft) {
  const price = Number(d.price.replace(/\./g, '').replace(',', '.'))
  return {
    name: d.name.trim(), description: d.description.trim(), priceCents: Math.round((Number.isFinite(price) ? price : 0) * 100), interval: d.interval, active: d.active, visible: d.visible, highlight: d.highlight,
    ctaLabel: d.ctaLabel.trim(), sortOrder: Math.max(0, Math.round(Number(d.sortOrder) || 0)),
    benefits: d.benefits.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 14),
    limits: Object.fromEntries(LIMIT_KEYS.map(k => [k, d.limits[k].unlimited || d.limits[k].value.trim() === '' ? null : Math.max(0, Math.round(Number(d.limits[k].value) || 0))])),
    features: d.features,
  }
}

function PlanForm({ plan, onDone }: { plan?: PlanView; onDone: () => void }) {
  const router = useRouter()
  const [d, setD] = useState<Draft>(() => toDraft(plan))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const unlimitedPlan = plan?.key === 'UNLIMITED'
  const freePlan = plan?.key === 'FREE'
  const set = (patch: Partial<Draft>) => setD(prev => ({ ...prev, ...patch }))

  const save = async () => {
    setBusy(true); setMsg(null)
    const res = await fetch(plan ? `/api/admin/plans/${plan.id}` : '/api/admin/plans', { method: plan ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(d)) })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg(j.error || 'Não consegui salvar.'); return }
    router.refresh(); onDone()
  }
  const remove = async () => {
    if (!plan || !confirm(`Apagar o plano ${plan.name}?`)) return
    setBusy(true)
    const res = await fetch(`/api/admin/plans/${plan.id}`, { method: 'DELETE' })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg(j.error || 'Não consegui apagar.'); return }
    router.refresh(); onDone()
  }

  return (
    <div className="space-y-5 rounded-2xl border border-violet-400/30 bg-violet-500/[0.04] p-5">
      {unlimitedPlan && <p className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200"><Lock className="h-3.5 w-3.5" /> Plano interno: libera tudo sem limite e só você coloca numa conta (na página da conta). Só o nome e a descrição mudam.</p>}
      {freePlan && <p className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-gray-300"><Lock className="h-3.5 w-3.5" /> Plano de base: é onde entram as contas novas e as que deixam de pagar. Fica sempre ativo e gratuito.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-400">Nome<input className={`${box} mt-1 w-full`} value={d.name} onChange={e => set({ name: e.target.value })} /></label>
        <label className="text-xs text-gray-400">Preço (R$)<input className={`${box} mt-1 w-full`} disabled={unlimitedPlan || freePlan} inputMode="decimal" placeholder="97" value={d.price} onChange={e => set({ price: e.target.value.replace(/[^\d.,]/g, '') })} /></label>
        <label className="text-xs text-gray-400 sm:col-span-2">Descrição curta (opcional)<input className={`${box} mt-1 w-full`} value={d.description} onChange={e => set({ description: e.target.value })} /></label>
        <label className="text-xs text-gray-400">Cobrança<select className={`${box} mt-1 w-full`} disabled={unlimitedPlan || freePlan} value={d.interval} onChange={e => set({ interval: e.target.value as 'month' | 'year' })}><option value="month" className="bg-gray-900">por mês</option><option value="year" className="bg-gray-900">por ano</option></select></label>
        <label className="text-xs text-gray-400">Texto do botão<input className={`${box} mt-1 w-full`} disabled={unlimitedPlan} placeholder="Assinar" value={d.ctaLabel} onChange={e => set({ ctaLabel: e.target.value })} /></label>
        <label className="text-xs text-gray-400">Ordem (menor aparece antes)<input className={`${box} mt-1 w-full`} inputMode="numeric" value={d.sortOrder} onChange={e => set({ sortOrder: e.target.value.replace(/\D/g, '') })} /></label>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2 text-xs text-gray-300">
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-violet-500" disabled={unlimitedPlan || freePlan} checked={d.active} onChange={e => set({ active: e.target.checked })} /> Ativo</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-violet-500" disabled={unlimitedPlan} checked={d.visible} onChange={e => set({ visible: e.target.checked })} /> Aparece na página de preços</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-violet-500" disabled={unlimitedPlan || freePlan} checked={d.highlight} onChange={e => set({ highlight: e.target.checked })} /> Recomendado</label>
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Linhas extras do cartão de preços (uma por linha). Os limites e os recursos marcados abaixo aparecem sozinhos.</p>
        <textarea className={`${box} min-h-[120px] w-full resize-y`} value={d.benefits} onChange={e => set({ benefits: e.target.value })} />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Limites</p>
        <div className="space-y-2">
          {LIMIT_KEYS.map(k => (
            <div key={k} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <div className="min-w-[200px] flex-1"><p className="text-sm text-gray-200">{LIMIT_DEFS[k].label}</p><p className="text-[11px] text-gray-500">{LIMIT_DEFS[k].hint}{!LIMIT_DEFS[k].enforced && ' (ainda não é aplicado)'}</p></div>
              <input className={`${box} w-28`} inputMode="numeric" disabled={unlimitedPlan || d.limits[k].unlimited} placeholder={d.limits[k].unlimited ? '∞' : '0'} value={d.limits[k].value} onChange={e => set({ limits: { ...d.limits, [k]: { ...d.limits[k], value: e.target.value.replace(/\D/g, '') } } })} />
              <span className="w-16 text-[11px] text-gray-500">{LIMIT_DEFS[k].unit}{LIMIT_DEFS[k].period === 'month' ? '/mês' : ''}</span>
              <label className="flex items-center gap-1.5 text-xs text-gray-300"><input type="checkbox" className="accent-violet-500" disabled={unlimitedPlan} checked={d.limits[k].unlimited} onChange={e => set({ limits: { ...d.limits, [k]: { ...d.limits[k], unlimited: e.target.checked } } })} /> Ilimitado</label>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Recursos</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEATURE_KEYS.map(k => (
            <label key={k} className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-gray-200">
              <input type="checkbox" className="mt-1 accent-violet-500" disabled={unlimitedPlan} checked={d.features[k]} onChange={e => set({ features: { ...d.features, [k]: e.target.checked } })} />
              <span>{FEATURE_DEFS[k].label}<span className="block text-[11px] text-gray-500">{FEATURE_DEFS[k].hint}</span></span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={busy || d.name.trim().length < 2} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{plan ? 'Salvar plano' : 'Criar plano'}</button>
        <button onClick={onDone} disabled={busy} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-300 hover:text-white">Cancelar</button>
        {plan && !plan.isSystem && <button onClick={remove} disabled={busy} className="ml-auto rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10">Apagar</button>}
        {msg && <span className="text-sm text-red-300">{msg}</span>}
      </div>
      {plan && <p className="text-[11px] text-gray-500">Ao salvar, as contas que estão neste plano passam a ter os novos limites na hora. Nada que elas já criaram é apagado.</p>}
    </div>
  )
}

export function PlansManager({ plans, counts }: { plans: PlanView[]; counts: Record<string, number> }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const quick = async (p: PlanView, patch: Partial<{ active: boolean; visible: boolean }>) => {
    setBusy(p.id)
    const body = { name: p.name, description: p.description, priceCents: p.priceCents, interval: p.interval, active: p.active, visible: p.visible, highlight: p.highlight, ctaLabel: p.ctaLabel, sortOrder: p.sortOrder, benefits: p.benefits, limits: p.limits, features: p.features, ...patch }
    await fetch(`/api/admin/plans/${p.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(null); router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-400">Os planos que você vende e os que só você libera. O que está aqui vale na página de preços, nos limites de cada conta e nas permissões. Plano desativado não pode ser contratado nem colocado numa conta, mas quem já está nele continua.</p>
        <button onClick={() => setEditing(editing === 'new' ? null : 'new')} className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"><Plus className="h-4 w-4" /> Novo plano</button>
      </div>

      {editing === 'new' && <PlanForm onDone={() => setEditing(null)} />}

      <div className="space-y-3">
        {plans.map(p => (
          <div key={p.id}>
            {editing === p.id ? <PlanForm plan={p} onDone={() => setEditing(null)} /> : (
              <div className={`rounded-2xl border bg-white/[0.03] p-4 ${p.key === 'UNLIMITED' ? 'border-amber-400/25' : p.highlight ? 'border-violet-400/30' : 'border-white/10'}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-[160px]">
                    <div className="flex items-center gap-2"><h3 className="text-base font-semibold text-white">{p.name}</h3>{p.highlight && <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] text-violet-200"><Star className="h-3 w-3" /> recomendado</span>}{p.key === 'UNLIMITED' && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-200">oculto</span>}</div>
                    <p className="text-sm text-gray-300">{p.priceCents ? `${brlCents(p.priceCents)}/${p.interval === 'year' ? 'ano' : 'mês'}` : 'Grátis'}<span className="ml-2 text-xs text-gray-500">{counts[p.key] || 0} {(counts[p.key] || 0) === 1 ? 'conta' : 'contas'}</span></p>
                  </div>
                  <div className="flex flex-1 flex-wrap gap-1.5 text-[11px]">
                    {LIMIT_KEYS.map(k => <span key={k} className="rounded-full bg-white/[0.07] px-2.5 py-1 text-gray-300">{LIMIT_DEFS[k].label}: <b className="text-white">{fmtLimit(p.limits[k])}</b></span>)}
                    {FEATURE_KEYS.filter(k => p.features[k]).map(k => <span key={k} className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-300">{FEATURE_DEFS[k].label}</span>)}
                  </div>
                  <div className="flex items-center gap-2">
                    <button disabled={busy === p.id || p.isSystem} onClick={() => quick(p, { active: !p.active })} title="Ativar ou desativar" className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${p.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-gray-400'}`}>{p.active ? 'Ativo' : 'Inativo'}</button>
                    <button disabled={busy === p.id || p.key === 'UNLIMITED'} onClick={() => quick(p, { visible: !p.visible })} title="Mostrar ou esconder na página de preços" className="rounded-lg bg-white/10 p-2 text-gray-300 hover:bg-white/15 disabled:opacity-40">{p.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button>
                    <button onClick={() => setEditing(p.id)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-900">Editar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
