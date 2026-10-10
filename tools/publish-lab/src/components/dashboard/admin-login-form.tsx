'use client'
import { useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'

const field = 'w-full rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-violet-400/60'

export function AdminLoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async () => {
    setBusy(true); setError(null)
    const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
    if (r.ok) { window.location.href = '/admin'; return }
    const j = await r.json().catch(() => ({}))
    setError(j.error || 'Não consegui entrar.'); setBusy(false)
  }
  return (
    <div className="mx-auto mt-16 w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-violet-950/40">
      <div className="mb-5 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20"><ShieldCheck className="h-5 w-5 text-amber-300" /></div><div><h1 className="text-lg font-bold text-white">Administração</h1><p className="text-xs text-gray-500">Acesso restrito</p></div></div>
      <div className="space-y-3">
        <input className={field} type="email" autoComplete="username" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />
        <input className={field} type="password" autoComplete="current-password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && email && password && !busy && go()} />
        {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
        <button onClick={go} disabled={busy || !email || !password} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-200 disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Entrar</button>
      </div>
    </div>
  )
}

export function AdminPasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const save = async () => {
    const r = await fetch('/api/admin/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ current, next }) })
    const j = await r.json().catch(() => ({}))
    setMsg(r.ok ? { ok: true, text: 'Senha trocada.' } : { ok: false, text: j.error || 'Não consegui trocar.' })
    if (r.ok) { setCurrent(''); setNext('') }
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="mb-1 text-sm font-semibold text-gray-200">Trocar a senha do administrador</p>
      <p className="mb-3 text-xs text-gray-500">A senha atual é curta: troque por uma com 8 ou mais caracteres quando puder.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${field} max-w-[220px]`} type="password" placeholder="Senha atual" value={current} onChange={e => setCurrent(e.target.value)} />
        <input className={`${field} max-w-[220px]`} type="password" placeholder="Nova senha (8+)" value={next} onChange={e => setNext(e.target.value)} />
        <button onClick={save} disabled={!current || next.length < 8} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 disabled:opacity-40">Trocar</button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-300'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}
