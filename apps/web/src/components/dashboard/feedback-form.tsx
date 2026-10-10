'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'

const KINDS = [
  { v: 'site_not_cloning', l: 'Um site não está clonando direito' },
  { v: 'clone_error', l: 'Deu erro ao clonar' },
  { v: 'bug', l: 'Algo do sistema não funciona' },
  { v: 'idea', l: 'Tenho uma ideia ou sugestão' },
  { v: 'praise', l: 'Quero elogiar' },
  { v: 'other', l: 'Outro assunto' },
]

export function FeedbackForm({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter()
  const [kind, setKind] = useState('site_not_cloning')
  const [siteUrl, setSiteUrl] = useState('')
  const [projectId, setProjectId] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const about = kind === 'site_not_cloning' || kind === 'clone_error'

  const send = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, siteUrl: about ? siteUrl : undefined, projectId: projectId || undefined, message, context: { screen: `${screen.width}x${screen.height}`, viewport: `${innerWidth}x${innerHeight}`, ua: navigator.userAgent.slice(0, 200) } }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Não consegui enviar')
      setDone(true); setMessage(''); setSiteUrl(''); router.refresh()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  const field = 'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition focus:border-violet-400/60 focus:bg-white/[0.06]'
  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-400">Sobre o quê?</label>
        <select className={field} value={kind} onChange={e => { setKind(e.target.value); setDone(false) }}>{KINDS.map(k => <option key={k.v} value={k.v} className="bg-gray-900">{k.l}</option>)}</select>
      </div>
      {about && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Endereço do site que não clonou direito</label>
            <input className={field} placeholder="https://..." value={siteUrl} onChange={e => setSiteUrl(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Projeto no sistema (se já clonou)</label>
            <select className={field} value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="" className="bg-gray-900">Nenhum</option>
              {projects.map(p => <option key={p.id} value={p.id} className="bg-gray-900">{p.name}</option>)}
            </select>
          </div>
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-400">{about ? 'O que está errado? (o que sumiu, o que não abre, o que ficou diferente)' : 'Sua mensagem'}</label>
        <textarea className={`${field} min-h-[130px] resize-y`} value={message} onChange={e => { setMessage(e.target.value); setDone(false) }} placeholder={about ? 'Ex.: o menu não abre no celular, a imagem do topo não aparece...' : 'Escreva aqui'} />
      </div>
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      {done && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">Mensagem enviada! Quando eu responder, o aviso aparece aqui.</p>}
      <button onClick={send} disabled={busy || message.trim().length < 3} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-gray-200 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
      </button>
    </div>
  )
}
