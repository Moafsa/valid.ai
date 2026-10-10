'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'

const box = 'rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-400/60'

export function FeedbackReply({ id, status, reply }: { id: string; status: string; reply: string | null }) {
  const router = useRouter()
  const [text, setText] = useState(reply || '')
  const [st, setSt] = useState(status)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)
  const save = async (body: object) => {
    setBusy(true); setOk(false)
    await fetch('/api/admin/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...body }) })
    setBusy(false); setOk(true); router.refresh()
  }
  return (
    <div className="mt-3 space-y-2">
      <textarea className={`${box} min-h-[70px] w-full resize-y`} placeholder="Responder para o usuário…" value={text} onChange={e => { setText(e.target.value); setOk(false) }} />
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy || text.trim().length < 2} onClick={() => save({ reply: text })} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 disabled:opacity-50">{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Enviar resposta</button>
        <select className={box} value={st} onChange={e => { setSt(e.target.value); save({ status: e.target.value }) }}>
          <option value="open" className="bg-gray-900">Aberta</option><option value="seen" className="bg-gray-900">Vista</option><option value="answered" className="bg-gray-900">Respondida</option><option value="done" className="bg-gray-900">Resolvida</option>
        </select>
        {ok && <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><Check className="h-3 w-3" /> salvo</span>}
      </div>
    </div>
  )
}

export interface PlanOption { key: string; name: string; priceCents: number; active: boolean; visible: boolean }
const planLabel = (p: PlanOption) => `${p.name}${p.key === 'UNLIMITED' ? ' (oculto, tudo ilimitado)' : !p.visible ? ' (oculto)' : ''}${p.active ? '' : ' (desativado)'}`
const STATUS_LABEL: Record<string, string> = { none: 'Sem assinatura', active: 'Em dia', past_due: 'Em atraso', canceled: 'Cancelada' }

/** The administrator moves an account to a plan, sets the state of its subscription and the paid-through date, or gives credits. */
export function WorkspaceActions({ id, planKey, status, until, plans }: { id: string; planKey: string; status: string; until: string; plans: PlanOption[] }) {
  const router = useRouter()
  const [p, setP] = useState(planKey)
  const [st, setSt] = useState(status)
  const [dt, setDt] = useState(until)
  const [credits, setCredits] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const dirty = p !== planKey || st !== status || dt !== until
  const send = async (body: object) => {
    setBusy(true); setMsg(null)
    const res = await fetch('/api/admin/workspace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...body }) })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg(j.error || 'Não consegui salvar.'); return false }
    setMsg('Salvo.'); router.refresh(); return true
  }
  const choose = (key: string) => {
    setP(key)
    const plan = plans.find(x => x.key === key)
    // a paid plan starts as "em dia"; a free one has no subscription
    if (plan && plan.priceCents > 0 && st === 'none') setSt('active')
    if (plan && plan.priceCents <= 0) { setSt(key === 'UNLIMITED' ? 'active' : 'none'); setDt('') }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-gray-500">Plano<select className={`${box} mt-1 block min-w-[200px]`} value={p} disabled={busy} onChange={e => choose(e.target.value)}>
          {plans.map(x => <option key={x.key} value={x.key} disabled={!x.active && x.key !== planKey} className="bg-gray-900">{planLabel(x)}</option>)}
        </select></label>
        <label className="text-[11px] text-gray-500">Assinatura<select className={`${box} mt-1 block`} value={st} disabled={busy} onChange={e => setSt(e.target.value)}>
          {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k} className="bg-gray-900">{l}</option>)}
        </select></label>
        <label className="text-[11px] text-gray-500">Pago até<input type="date" className={`${box} mt-1 block`} value={dt} disabled={busy} onChange={e => setDt(e.target.value)} /></label>
        <button disabled={busy || !dirty} onClick={() => send({ planKey: p, subscriptionStatus: st, planUntil: dt || null })} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 disabled:opacity-40">{busy ? 'Salvando…' : 'Salvar plano'}</button>
      </div>
      <p className="text-[11px] text-gray-500">Um plano pago só vale enquanto a assinatura está em dia (e até 3 dias depois do vencimento). Sem data, vale sem prazo (cortesia).</p>
      <div className="flex items-center gap-1.5">
        <input className={`${box} w-24`} placeholder="+créditos" value={credits} onChange={e => setCredits(e.target.value.replace(/[^\d-]/g, ''))} />
        <button disabled={busy || !credits || credits === '-'} onClick={async () => { if (await send({ addCredits: parseInt(credits, 10) })) setCredits('') }} className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/20 disabled:opacity-40">dar créditos</button>
        {msg && <span className="text-xs text-gray-400">{msg}</span>}
      </div>
    </div>
  )
}

export function ManualPayment({ workspaces, plans }: { workspaces: { id: string; name: string; plan: string }[]; plans: PlanOption[] }) {
  const router = useRouter()
  const [ws, setWs] = useState(workspaces[0]?.id || '')
  const [value, setValue] = useState('')
  const [method, setMethod] = useState('PIX')
  const [plan, setPlan] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const send = async () => {
    setBusy(true); setMsg(null)
    const r = await fetch('/api/admin/payment', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: ws, value: Number(value.replace(',', '.')), billingType: method, description: desc || undefined, plan: plan || undefined }) })
    setBusy(false)
    if (r.ok) { setMsg('Registrado.'); setValue(''); setDesc(''); router.refresh() } else setMsg('Não consegui registrar. Confira o valor.')
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="mb-3 text-sm font-semibold text-gray-200">Registrar um pagamento recebido fora do sistema</p>
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${box} min-w-[200px]`} value={ws} onChange={e => setWs(e.target.value)}>{workspaces.map(w => <option key={w.id} value={w.id} className="bg-gray-900">{w.name} ({w.plan})</option>)}</select>
        <input className={`${box} w-24`} placeholder="Valor R$" value={value} onChange={e => setValue(e.target.value.replace(/[^\d.,]/g, ''))} />
        <select className={box} value={method} onChange={e => setMethod(e.target.value)}>{['PIX', 'BOLETO', 'CREDIT_CARD', 'MANUAL'].map(m => <option key={m} className="bg-gray-900">{m}</option>)}</select>
        <select className={box} value={plan} onChange={e => setPlan(e.target.value)}><option value="" className="bg-gray-900">manter o plano</option>{plans.filter(x => x.priceCents > 0 && x.active).map(m => <option key={m.key} value={m.key} className="bg-gray-900">{m.name}</option>)}</select>
        <input className={`${box} min-w-[180px] flex-1`} placeholder="Descrição (opcional)" value={desc} onChange={e => setDesc(e.target.value)} />
        <button disabled={busy || !value || !ws} onClick={send} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 disabled:opacity-40">Registrar</button>
        {msg && <span className="text-xs text-gray-400">{msg}</span>}
      </div>
    </div>
  )
}
