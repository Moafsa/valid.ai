'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, CheckCircle2, ExternalLink, FlaskConical, Info, Loader2, Plus, Shield, Trash2, X } from 'lucide-react'
import {
  INTEGRATIONS, INTEGRATION_KEYS, STATE_LABEL, vendorName,
  type EventMap, type Integration, type PixelSettings, type PixelState, type ProjectEvent,
} from '@/lib/pixels'
import type { Detected, PixelOverview } from '@/lib/pixels-server'

interface IntegrationRow { id: string; type: Integration; pixelId: string | null; isActive: boolean; config: { label?: string; map: EventMap; hasCode: boolean } }
export interface PixelsInitial {
  projectId: string
  published: boolean
  slug: string | null
  settings: PixelSettings
  integrations: IntegrationRow[]
  detected: Detected
  overview: PixelOverview
}

const box = 'rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-violet-400/60'
const card = 'rounded-2xl border border-white/10 bg-white/[0.03] p-5'
const TONE = { good: 'bg-emerald-500/15 text-emerald-300', warn: 'bg-amber-500/15 text-amber-300', bad: 'bg-red-500/15 text-red-300', mute: 'bg-white/10 text-gray-400' } as const
const n = (v: number) => v.toLocaleString('pt-BR')
const ago = (iso?: string | null) => {
  if (!iso) return null
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  return s < 90 ? 'agora' : s < 3600 ? `há ${Math.floor(s / 60)} min` : s < 86400 ? `há ${Math.floor(s / 3600)} h` : `há ${Math.floor(s / 86400)} d`
}

function StateChip({ state }: { state: string }) {
  const d = STATE_LABEL[state as PixelState]
  return <span title={d?.hint} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[d?.tone ?? 'mute']}`}>{d?.label ?? state}</span>
}

export function PixelsPanel({ initial }: { initial: PixelsInitial }) {
  const router = useRouter()
  const { projectId } = initial
  const [settings, setSettings] = useState<PixelSettings>(initial.settings)
  const [maps, setMaps] = useState<Record<string, EventMap>>(() => Object.fromEntries(initial.integrations.map(i => [i.id, i.config.map])))
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [adding, setAdding] = useState<Integration | null>(null)
  const [form, setForm] = useState({ pixelId: '', label: '', code: '' })
  const [editing, setEditing] = useState<string | null>(null)
  const [edit, setEdit] = useState({ pixelId: '', label: '', code: '' })
  const [newEvent, setNewEvent] = useState<{ name: string; type: 'click' | 'page'; match: string; goal: boolean; value: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [live, setLive] = useState<{ id: string; integration: string; event: string; state: string; slug: string | null }[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(initial.settings) || initial.integrations.some(i => JSON.stringify(maps[i.id] ?? {}) !== JSON.stringify(i.config.map)), [settings, maps, initial])

  const call = async (key: string, url: string, method: string, body?: unknown, okText?: string) => {
    setBusy(key); setMsg(null)
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ ok: false, text: j.error || 'Não consegui fazer isso agora.' }); return false }
      if (okText) setMsg({ ok: true, text: okText })
      router.refresh()
      return true
    } finally { setBusy(null) }
  }

  const setEvent = (id: string, patch: Partial<ProjectEvent>) => setSettings(s => ({ ...s, events: s.events.map(e => (e.id === id ? { ...e, ...patch } : e)) }))
  const setCell = (tid: string, evId: string, patch: Partial<{ on: boolean; label: string }>) => setMaps(m => ({ ...m, [tid]: { ...m[tid], [evId]: { ...(m[tid]?.[evId] ?? { on: false }), ...patch } } }))

  const save = async () => {
    setBusy('save'); setMsg(null)
    try {
      const put = await fetch(`/api/projects/${projectId}/pixels`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) })
      const pj = await put.json().catch(() => ({}))
      if (!put.ok) { setMsg({ ok: false, text: pj.error || 'Não consegui salvar.' }); return }
      for (const i of initial.integrations) {
        if (JSON.stringify(maps[i.id] ?? {}) === JSON.stringify(i.config.map)) continue
        const r = await fetch(`/api/projects/${projectId}/pixels/integrations/${i.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ map: maps[i.id] }) })
        if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg({ ok: false, text: j.error || 'Não consegui salvar uma das integrações.' }); return }
      }
      setMsg({ ok: true, text: 'Salvo. As mudanças já valem na página publicada.' })
      router.refresh()
    } finally { setBusy(null) }
  }

  const addIntegration = async () => {
    if (!adding) return
    const ok = await call('add', `/api/projects/${projectId}/pixels/integrations`, 'POST', { type: adding, ...form }, `${INTEGRATIONS[adding].label} adicionado.`)
    if (ok) { setAdding(null); setForm({ pixelId: '', label: '', code: '' }) }
  }
  const saveEdit = async (row: IntegrationRow) => {
    const body: Record<string, string> = { label: edit.label }
    if (row.type === 'CUSTOM') { if (edit.code.trim()) body.code = edit.code } else body.pixelId = edit.pixelId
    const ok = await call(`edit-${row.id}`, `/api/projects/${projectId}/pixels/integrations/${row.id}`, 'PATCH', body, 'Integração atualizada.')
    if (ok) setEditing(null)
  }
  const addEvent = () => {
    if (!newEvent || newEvent.name.trim().length < 2 || !newEvent.match.trim()) return
    const id = `c_${Math.random().toString(36).slice(2, 8)}`
    const value = newEvent.value.trim() ? Number(newEvent.value.replace(',', '.')) : null
    setSettings(s => ({ ...s, events: [...s.events, { id, kind: 'custom', name: newEvent.name.trim(), on: true, trigger: { type: newEvent.type, match: newEvent.match.trim() }, value: Number.isFinite(value as number) ? value : null, goal: newEvent.goal }] }))
    // every integration (except Google Ads, which needs a conversion label first) receives the new event
    setMaps(m => Object.fromEntries(Object.entries(m).map(([tid, map]) => [tid, { ...map, [id]: { on: initial.integrations.find(i => i.id === tid)?.type !== 'GOOGLE_TAG', label: '' } }])))
    setNewEvent(null)
  }
  const removeEvent = (id: string) => { setSettings(s => ({ ...s, events: s.events.filter(e => e.id !== id) })); setMaps(m => Object.fromEntries(Object.entries(m).map(([tid, map]) => { const c = { ...map }; delete c[id]; return [tid, c] }))) }

  // test run: the person opens the published page in test mode and watches what each pixel did
  const startTest = () => {
    if (!initial.slug) return
    window.open(`/s/${initial.slug}?vai_pxtest=1`, '_blank', 'noopener')
    setTesting(true); setLive([])
  }
  useEffect(() => {
    if (!testing) return
    const t0 = Date.now()
    const poll = async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/pixels/status`, { cache: 'no-store' })
        if (r.ok) setLive((await r.json()).events || [])
      } catch { /* the next tick tries again */ }
      if (Date.now() - t0 > 5 * 60_000) setTesting(false)
    }
    poll()
    pollRef.current = setInterval(poll, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [testing, projectId])

  const stat = (type: string, key?: string) => initial.overview.stats.filter(s => s.integration === type && (!key || s.key === key))
  const sum = (rows: { count: number }[]) => rows.reduce((t, r) => t + r.count, 0)
  const countState = (rows: { state: string; count: number }[], st: string) => sum(rows.filter(r => r.state === st))
  const det = initial.detected
  const detectedText = (ev: ProjectEvent): string => {
    switch (ev.kind) {
      case 'pageview': return `${det.pages.length} ${det.pages.length === 1 ? 'página' : 'páginas/etapas'}`
      case 'cta': return det.ctas ? `${n(det.ctas)} botões` : 'nenhum botão achado'
      case 'lead': return det.forms ? `${n(det.forms)} ${det.forms === 1 ? 'formulário' : 'formulários'}` : 'nenhum formulário achado (leads de quiz também contam)'
      case 'checkout': return det.checkoutLinks ? `${n(det.checkoutLinks)} ${det.checkoutLinks === 1 ? 'link' : 'links'} (${det.checkoutHosts.join(', ')})` : 'nenhum link de pagamento achado'
      case 'video': return det.videos ? `${n(det.videos)} ${det.videos === 1 ? 'vídeo' : 'vídeos'}` : 'nenhum vídeo achado'
      case 'purchase': return det.thanks.length ? `etapa de obrigado: ${det.thanks.slice(0, 2).map(t => t.name).join(', ')}` : 'escolha a etapa que mostra a compra concluída'
      default: return 'definido por você'
    }
  }
  const received = (ev: ProjectEvent) => {
    const rows = initial.overview.stats.filter(s => s.key === ev.id)
    return { sent: countState(rows, 'sent'), fired: countState(rows, 'fired'), unconfirmed: countState(rows, 'unconfirmed'), blocked: countState(rows, 'blocked'), visits: initial.overview.visitsByKey[ev.id] ?? 0 }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-white">Pixels e eventos</h2>
        <p className="mt-0.5 max-w-3xl text-sm text-zinc-500">Ligue os pixels dos anúncios e escolha o que cada um recebe. O pixel é opcional: se um deles falhar ou for bloqueado, a página, os botões e os formulários continuam funcionando normalmente. Só aparece como “Enviado” o que o navegador do visitante realmente enviou.</p>
      </div>

      {!initial.published && (
        <div className="flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-sm text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>Os pixels só rodam na página <b>publicada</b>: o rascunho e as miniaturas nunca disparam nada. Publique o site para começar a receber eventos.</p></div>
      )}
      {msg && <p className={`rounded-xl px-4 py-2.5 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-200'}`}>{msg.text}</p>}

      {/* integrations */}
      <section className={card}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Integrações</h3>
          <button disabled={!initial.published || initial.integrations.length === 0} onClick={startTest} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/25 disabled:opacity-40"><FlaskConical className="h-3.5 w-3.5" /> Testar no site publicado</button>
        </div>

        {initial.integrations.length === 0 && <p className="mb-4 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-gray-500">Nenhuma integração ainda. Escolha uma abaixo para começar. Sem pixel, a aba Métricas continua funcionando com os dados da própria plataforma.</p>}

        <div className="space-y-3">
          {initial.integrations.map(row => {
            const def = INTEGRATIONS[row.type]
            const rows = stat(row.type)
            const sent = countState(rows, 'sent'), blocked = countState(rows, 'blocked'), unc = countState(rows, 'unconfirmed')
            const last = ago(initial.overview.lastSeen[row.id])
            const status = !row.isActive ? { t: 'Desligado', c: TONE.mute } : sum(rows) === 0 ? { t: 'Esperando o primeiro evento', c: TONE.mute } : sent > 0 ? { t: 'Recebendo eventos', c: TONE.good } : blocked > 0 ? { t: 'Bloqueado nos navegadores', c: TONE.bad } : { t: 'Chamado, sem confirmação de envio', c: TONE.warn }
            return (
              <div key={row.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-[180px] flex-1">
                    <p className="font-medium text-white">{def.label}{row.config.label && row.type !== 'CUSTOM' ? <span className="ml-2 text-xs font-normal text-gray-500">{row.config.label}</span> : null}</p>
                    <p className="truncate text-xs text-gray-500">{row.type === 'CUSTOM' ? (row.config.label || 'Script personalizado') : row.pixelId}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${status.c}`}>{status.t}</span>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
                    <span>{n(sent)} enviados</span>{unc > 0 && <span className="text-amber-300">{n(unc)} sem confirmação</span>}{blocked > 0 && <span className="text-red-300">{n(blocked)} bloqueados</span>}{last && <span>último {last}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-300"><input type="checkbox" className="accent-violet-500" checked={row.isActive} disabled={busy === `on-${row.id}`} onChange={e => call(`on-${row.id}`, `/api/projects/${projectId}/pixels/integrations/${row.id}`, 'PATCH', { isActive: e.target.checked })} /> Ativo</label>
                    <button onClick={() => { setEditing(editing === row.id ? null : row.id); setEdit({ pixelId: row.pixelId ?? '', label: row.config.label ?? '', code: '' }) }} className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/15">Editar</button>
                    <button onClick={() => { if (confirm(`Remover ${def.label}?`)) call(`del-${row.id}`, `/api/projects/${projectId}/pixels/integrations/${row.id}`, 'DELETE', undefined, 'Integração removida.') }} className="rounded-lg p-1.5 text-gray-500 hover:bg-red-500/10 hover:text-red-300" title="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                {def.risky && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500"><Shield className="h-3 w-3" /> Roda código que você controla: por segurança ele não roda para quem está logado nesta plataforma (teste em uma janela anônima).</p>}
                {editing === row.id && (
                  <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    {row.type === 'CUSTOM' ? (
                      <>
                        <input className={`${box} w-full`} placeholder="Nome" value={edit.label} onChange={e => setEdit({ ...edit, label: e.target.value })} />
                        <textarea className={`${box} min-h-[120px] w-full font-mono text-xs`} placeholder="Cole o novo código aqui para trocar o atual (deixe vazio para manter)" value={edit.code} onChange={e => setEdit({ ...edit, code: e.target.value })} />
                      </>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-[11px] text-gray-500">{def.idLabel}<input className={`${box} mt-1 w-full`} value={edit.pixelId} onChange={e => setEdit({ ...edit, pixelId: e.target.value })} /></label>
                        <label className="text-[11px] text-gray-500">Apelido (opcional)<input className={`${box} mt-1 w-full`} value={edit.label} onChange={e => setEdit({ ...edit, label: e.target.value })} /></label>
                      </div>
                    )}
                    <div className="flex gap-2"><button disabled={busy === `edit-${row.id}`} onClick={() => saveEdit(row)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 disabled:opacity-50">Salvar</button><button onClick={() => setEditing(null)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300">Cancelar</button></div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {testing && (
          <div className="mt-4 rounded-xl border border-violet-400/30 bg-violet-500/[0.06] p-4">
            <div className="mb-2 flex items-center justify-between"><p className="flex items-center gap-2 text-sm font-medium text-violet-100"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Teste ao vivo: use a página que abriu</p><button onClick={() => setTesting(false)} className="text-gray-400 hover:text-white"><X className="h-4 w-4" /></button></div>
            <p className="mb-2 text-xs text-gray-400">Navegue, clique em um botão, preencha o formulário. Nada do teste entra nas métricas. Scripts personalizados e GTM não rodam enquanto você está logado: abra o link em uma janela anônima para testá-los.</p>
            {live.length === 0 ? <p className="text-xs text-gray-500">Esperando o primeiro evento…</p> : (
              <ul className="space-y-1">{live.map(e => <li key={e.id} className="flex items-center justify-between gap-3 text-xs text-gray-200"><span className="truncate">{INTEGRATIONS[e.integration as Integration]?.label ?? e.integration} · <b>{e.event}</b>{e.slug ? <span className="text-gray-500"> · etapa {e.slug}</span> : null}</span><StateChip state={e.state} /></li>)}</ul>
            )}
          </div>
        )}

        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-gray-500">Adicionar integração</p>
          <div className="flex flex-wrap gap-2">
            {INTEGRATION_KEYS.map(t => <button key={t} onClick={() => { setAdding(adding === t ? null : t); setForm({ pixelId: '', label: '', code: '' }) }} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition ${adding === t ? 'border-violet-400/60 bg-violet-500/15 text-white' : 'border-white/10 text-gray-300 hover:text-white'}`}><Plus className="h-3.5 w-3.5" />{INTEGRATIONS[t].label}</button>)}
          </div>
          {adding && (
            <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="flex gap-2 text-xs text-gray-400"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{INTEGRATIONS[adding].help}</p>
              {adding === 'CUSTOM' ? (
                <>
                  <input className={`${box} w-full`} placeholder={INTEGRATIONS.CUSTOM.placeholder} value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
                  <textarea className={`${box} min-h-[140px] w-full font-mono text-xs`} placeholder="Cole aqui o script" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
                </>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-[11px] text-gray-500">{INTEGRATIONS[adding].idLabel}<input className={`${box} mt-1 w-full`} placeholder={INTEGRATIONS[adding].placeholder} value={form.pixelId} onChange={e => setForm({ ...form, pixelId: e.target.value })} /></label>
                  <label className="text-[11px] text-gray-500">Apelido (opcional)<input className={`${box} mt-1 w-full`} value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} /></label>
                </div>
              )}
              <div className="flex gap-2"><button disabled={busy === 'add'} onClick={addIntegration} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-gray-900 disabled:opacity-50">{busy === 'add' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}Adicionar</button><button onClick={() => setAdding(null)} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-gray-300">Cancelar</button></div>
            </div>
          )}
        </div>
      </section>

      {/* events x integrations */}
      <section className={card}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Eventos e objetivos</h3></div>
        <p className="mb-4 text-xs text-gray-500">O que a página detectou, o que cada integração recebe e o que conta como conversão em Métricas. Um evento marcado como conversão vira um objetivo da aba Métricas (sem duplicar o que a plataforma já conta).</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr><th className="py-2 pr-3 font-medium">Evento</th><th className="py-2 pr-3 font-medium">Detectado na página</th><th className="py-2 pr-3 font-medium">Chegou (30 dias)</th><th className="py-2 pr-3 font-medium">Conversão</th>{initial.integrations.map(i => <th key={i.id} className="py-2 pr-3 font-medium">{INTEGRATIONS[i.type].label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {settings.events.map(ev => {
                const rc = received(ev)
                return (
                  <tr key={ev.id} className="align-top">
                    <td className="py-3 pr-3">
                      <label className="flex cursor-pointer items-start gap-2"><input type="checkbox" className="mt-1 accent-violet-500" checked={ev.on} onChange={e => setEvent(ev.id, { on: e.target.checked })} /><span><span className="text-white">{ev.name}</span>{ev.kind === 'custom' && <span className="block text-[11px] text-gray-500">{ev.trigger.type === 'page' ? `ao chegar na etapa “${ev.trigger.match}”` : ev.trigger.match?.startsWith('sel:') ? `clique em ${ev.trigger.match.slice(4)}` : `clique em “${ev.trigger.match}”`}</span>}</span></label>
                      {ev.kind === 'purchase' && ev.on && (
                        <div className="mt-2 space-y-1.5 pl-6">
                          <select className={`${box} w-full py-1.5 text-xs`} value={ev.trigger.match || ''} onChange={e => setEvent(ev.id, { trigger: { type: 'page', match: e.target.value } })}>
                            <option value="" className="bg-gray-900">Escolha a etapa da compra…</option>
                            {det.pages.map(p => <option key={p.slug} value={p.slug} className="bg-gray-900">{p.name}</option>)}
                          </select>
                          <div className="flex gap-1.5"><input className={`${box} w-24 py-1.5 text-xs`} placeholder="Valor R$" inputMode="decimal" value={ev.value ?? ''} onChange={e => setEvent(ev.id, { value: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) || 0 })} /><input className={`${box} min-w-0 flex-1 py-1.5 text-xs`} placeholder="ou parâmetro da URL (ex.: valor)" value={ev.valueParam ?? ''} onChange={e => setEvent(ev.id, { valueParam: e.target.value.replace(/[^\w-]/g, '').slice(0, 40) })} /></div>
                        </div>
                      )}
                      {ev.kind === 'custom' && <button onClick={() => removeEvent(ev.id)} className="mt-1 pl-6 text-[11px] text-red-300 hover:underline">remover</button>}
                    </td>
                    <td className="max-w-[210px] py-3 pr-3 text-xs text-gray-400">{detectedText(ev)}</td>
                    <td className="py-3 pr-3 text-xs">
                      {rc.sent + rc.fired + rc.unconfirmed + rc.blocked === 0 ? <span className="text-gray-600">ainda nada</span> : (
                        <div className="space-y-0.5"><span className="text-emerald-300">{n(rc.sent)} enviados</span>{rc.unconfirmed > 0 && <span className="block text-amber-300">{n(rc.unconfirmed)} sem confirmação</span>}{rc.blocked > 0 && <span className="block text-red-300">{n(rc.blocked)} bloqueados</span>}</div>
                      )}
                    </td>
                    <td className="py-3 pr-3"><input type="checkbox" className="accent-violet-500" disabled={!ev.on || ev.kind === 'pageview' || ev.kind === 'cta' || ev.kind === 'video'} checked={ev.goal && ev.on} onChange={e => setEvent(ev.id, { goal: e.target.checked })} title="Conta como conversão na aba Métricas" /></td>
                    {initial.integrations.map(i => {
                      const cell = maps[i.id]?.[ev.id]
                      const on = !!cell?.on && ev.on
                      return (
                        <td key={i.id} className="py-3 pr-3">
                          <input type="checkbox" className="accent-violet-500" disabled={!ev.on} checked={on} onChange={e => setCell(i.id, ev.id, { on: e.target.checked })} />
                          {on && i.type !== 'CUSTOM' && <span className="mt-0.5 block max-w-[120px] truncate text-[10px] text-gray-500" title="O nome que essa plataforma recebe">{vendorName(i.type, ev, cell)}</span>}
                          {i.type === 'GOOGLE_TAG' && on && <input className={`${box} mt-1 w-28 py-1 text-[11px]`} placeholder="rótulo da conversão" value={cell?.label ?? ''} onChange={e => setCell(i.id, ev.id, { label: e.target.value })} />}
                          {i.type === 'GOOGLE_TAG' && on && !cell?.label && <span className="mt-0.5 block text-[10px] text-amber-300">sem rótulo, não envia</span>}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {newEvent ? (
          <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-medium text-gray-300">Novo evento personalizado</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] text-gray-500">Nome do evento<input className={`${box} mt-1 w-full`} placeholder="Ex.: Clicou no WhatsApp" value={newEvent.name} onChange={e => setNewEvent({ ...newEvent, name: e.target.value })} /></label>
              <label className="text-[11px] text-gray-500">Quando acontece
                <select className={`${box} mt-1 w-full`} value={newEvent.type} onChange={e => setNewEvent({ ...newEvent, type: e.target.value as 'click' | 'page', match: '' })}>
                  <option value="click" className="bg-gray-900">Quando alguém clica em um botão</option>
                  <option value="page" className="bg-gray-900">Quando alguém chega em uma etapa</option>
                </select>
              </label>
              {newEvent.type === 'click' ? (
                <label className="text-[11px] text-gray-500 sm:col-span-2">Texto do botão (ou sel:#id para um seletor)<input className={`${box} mt-1 w-full`} placeholder="Ex.: Quero começar" value={newEvent.match} onChange={e => setNewEvent({ ...newEvent, match: e.target.value })} /></label>
              ) : (
                <label className="text-[11px] text-gray-500 sm:col-span-2">Etapa
                  <select className={`${box} mt-1 w-full`} value={newEvent.match} onChange={e => setNewEvent({ ...newEvent, match: e.target.value })}>
                    <option value="" className="bg-gray-900">Escolha…</option>
                    {det.pages.map(p => <option key={p.slug} value={p.slug} className="bg-gray-900">{p.name}</option>)}
                  </select>
                </label>
              )}
              <label className="text-[11px] text-gray-500">Valor (opcional, R$)<input className={`${box} mt-1 w-full`} inputMode="decimal" value={newEvent.value} onChange={e => setNewEvent({ ...newEvent, value: e.target.value.replace(/[^\d.,]/g, '') })} /></label>
              <label className="flex items-center gap-2 pt-5 text-xs text-gray-300"><input type="checkbox" className="accent-violet-500" checked={newEvent.goal} onChange={e => setNewEvent({ ...newEvent, goal: e.target.checked })} /> Contar como conversão em Métricas</label>
            </div>
            <div className="flex gap-2"><button onClick={addEvent} disabled={newEvent.name.trim().length < 2 || !newEvent.match.trim()} className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-gray-900 disabled:opacity-40">Adicionar à lista</button><button onClick={() => setNewEvent(null)} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-gray-300">Cancelar</button></div>
          </div>
        ) : (
          <button onClick={() => setNewEvent({ name: '', type: 'click', match: '', goal: false, value: '' })} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/15"><Plus className="h-3.5 w-3.5" /> Evento personalizado</button>
        )}
      </section>

      {/* privacy */}
      <section className={card}>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Privacidade</h3>
        <div className="space-y-3 text-sm text-gray-300">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-violet-500" checked={settings.consent.required} onChange={e => setSettings(s => ({ ...s, consent: { ...s.consent, required: e.target.checked } }))} /><span>Pedir consentimento antes de carregar os pixels<span className="block text-xs text-gray-500">Aparece uma faixa na página pública. Sem “Aceitar”, nenhum pixel é carregado e nenhum evento é enviado.</span></span></label>
          {settings.consent.required && <input className={`${box} w-full`} value={settings.consent.text} maxLength={240} onChange={e => setSettings(s => ({ ...s, consent: { ...s.consent, text: e.target.value } }))} />}
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-violet-500" checked={settings.consent.respectDnt} onChange={e => setSettings(s => ({ ...s, consent: { ...s.consent, respectDnt: e.target.checked } }))} /><span>Respeitar “Do Not Track” e o Global Privacy Control<span className="block text-xs text-gray-500">Quem ativou um desses sinais no navegador não é rastreado pelos pixels.</span></span></label>
          <p className="text-xs text-gray-500">As configurações valem só para as páginas públicas deste projeto. A responsabilidade de avisar o visitante e cumprir a lei de privacidade (como a LGPD) continua sendo de quem publica.</p>
        </div>
      </section>

      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b0818]/90 px-4 py-3 backdrop-blur">
        <p className="text-xs text-gray-400">{dirty ? 'Você tem mudanças que ainda não foram salvas.' : 'Tudo salvo.'}</p>
        <button onClick={save} disabled={!dirty || busy === 'save'} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Salvar alterações</button>
      </div>

      {/* what really arrived */}
      <section className={card}>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-400">O que chegou de verdade</h3>
        <p className="mb-4 text-xs text-gray-500">Contagem por visita, últimos 30 dias, sem testes. Os números dos pixels complementam os da plataforma: nunca os substituem. Uma diferença é normal (bloqueadores de anúncio, consentimento recusado, navegadores que protegem a privacidade).</p>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-black/20 p-3"><p className="text-[11px] text-gray-500">Visitas (plataforma)</p><p className="text-xl font-semibold text-white">{n(initial.overview.native.sessions)}</p></div>
          <div className="rounded-xl bg-black/20 p-3"><p className="text-[11px] text-gray-500">Leads (plataforma)</p><p className="text-xl font-semibold text-white">{n(initial.overview.native.leads)}</p><p className="text-[11px] text-gray-500">{n(initial.overview.visitsByKey.lead ?? 0)} avisados aos pixels</p></div>
          <div className="rounded-xl bg-black/20 p-3"><p className="text-[11px] text-gray-500">Receita informada pelos pixels</p><p className="text-xl font-semibold text-white">{initial.overview.revenue.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p><p className="text-[11px] text-gray-500">{n(initial.overview.revenue.purchases)} compras, sem contar em dobro</p></div>
        </div>
        {initial.overview.recent.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-gray-500">Nenhum evento recebido ainda.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-gray-500"><tr><th className="py-2 pr-3 font-medium">Quando</th><th className="py-2 pr-3 font-medium">Integração</th><th className="py-2 pr-3 font-medium">Evento</th><th className="py-2 pr-3 font-medium">Etapa</th><th className="py-2 font-medium">Situação</th></tr></thead>
              <tbody className="divide-y divide-white/5">
                {initial.overview.recent.map(r => <tr key={r.id}><td className="py-2 pr-3 text-xs text-gray-400">{ago(r.at)}</td><td className="py-2 pr-3 text-gray-300">{INTEGRATIONS[r.integration as Integration]?.label ?? r.integration}</td><td className="py-2 pr-3 text-white">{r.event}{r.value ? <span className="ml-1 text-xs text-gray-500">{r.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span> : null}</td><td className="py-2 pr-3 text-xs text-gray-500">{r.slug || '—'}</td><td className="py-2"><StateChip state={r.state} /></td></tr>)}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 grid gap-2 text-[11px] text-gray-500 sm:grid-cols-2">{(['sent', 'unconfirmed', 'blocked', 'fired', 'skipped'] as PixelState[]).map(s => <p key={s}><StateChip state={s} /> <span className="ml-1">{STATE_LABEL[s].hint}</span></p>)}</div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-600"><ExternalLink className="h-3 w-3" /> Para integrações como o GTM, só dá para confirmar que o contêiner carregou e o evento entrou no dataLayer; o que as tags fazem depois é com ele.</p>
      </section>
    </div>
  )
}
