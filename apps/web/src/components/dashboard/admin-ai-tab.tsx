'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Crown, Eye, EyeOff, Loader2, Plus, Power, RefreshCw, Sparkles, Trash2, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { AI_PRESETS, presetOf } from '@/lib/ai-presets'

interface Conn {
  id: string
  preset: string
  name: string
  kind: 'anthropic' | 'compat'
  baseUrl: string
  model: string
  enabled: boolean
  keyMask: string
  lastTest: { ok: boolean; msg: string; at: number; ms: number } | null
}
interface Form { id?: string; preset: string; name: string; key: string; model: string; baseUrl: string }

const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return 'agora há pouco'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  return `há ${Math.floor(s / 86400)} d`
}

async function call(payload: Record<string, unknown>) {
  const res = await fetch('/api/admin/ai-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Não deu certo')
  return data
}

export function AdminAiTab({ usage }: { usage: { calls: number; cost: number } }) {
  const [list, setList] = useState<Conn[] | null>(null)
  const [env, setEnv] = useState({ anthropic: false, openai: false })
  const [busy, setBusy] = useState<Record<string, string>>({})
  const [form, setForm] = useState<Form | null>(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [modelsMsg, setModelsMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)
  const [shown, setShown] = useState<Record<string, string>>({})
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const autoTested = useRef(false)

  const mark = (id: string, what: string | null) => setBusy(b => { const n = { ...b }; if (what) n[id] = what; else delete n[id]; return n })

  const test = useCallback(async (id: string) => {
    mark(id, 'test')
    try { setList((await call({ action: 'test', id })).providers) } catch (e: any) { toast.error(e.message) } finally { mark(id, null) }
  }, [])

  useEffect(() => {
    fetch('/api/admin/ai-config').then(r => r.json()).then(async d => {
      setList(d.providers); setEnv(d.env)
      if (autoTested.current) return
      autoTested.current = true
      for (const p of d.providers as Conn[]) if (p.enabled && !p.lastTest) await test(p.id)
    }).catch(() => setList([]))
  }, [test])

  const act = async (id: string, payload: Record<string, unknown>, ok?: string) => {
    mark(id, String(payload.action))
    try { setList((await call({ ...payload, id })).providers); if (ok) toast.success(ok) } catch (e: any) { toast.error(e.message) } finally { mark(id, null) }
  }

  const reveal = async (id: string) => {
    if (shown[id]) { setShown(s => { const n = { ...s }; delete n[id]; return n }); return }
    try { const { key } = await call({ action: 'reveal', id }); setShown(s => ({ ...s, [id]: key })) } catch (e: any) { toast.error(e.message) }
  }
  const copy = async (id: string) => {
    try { const key = shown[id] || (await call({ action: 'reveal', id })).key; await navigator.clipboard.writeText(key); toast.success('Chave copiada') } catch { toast.error('Não consegui copiar') }
  }

  const openNew = (presetId: string) => {
    const p = presetOf(presetId)!
    setFormError(''); setModels([]); setModelsMsg(null); setForm({ preset: p.id, name: p.name, key: '', model: p.model, baseUrl: p.baseUrl })
  }
  const openEdit = (c: Conn) => {
    setFormError(''); setModels([]); setModelsMsg(null)
    const f = { id: c.id, preset: c.preset, name: c.name, key: '', model: c.model, baseUrl: c.baseUrl }
    setForm(f); fetchModels(f)
  }

  /** Asks the provider which models this key can use, and fixes the model field when the one typed does not exist there. */
  const fetchModels = async (f: Form) => {
    if (!f.id && f.key.trim().length < 8) return
    setLoadingModels(true); setModelsMsg(null)
    try {
      const { models: ids }: { models: string[] } = await call({ action: 'models', preset: f.preset, id: f.id, key: f.key, baseUrl: f.baseUrl })
      setModels(ids)
      if (!ids.length) { setModelsMsg({ ok: false, text: 'O provedor não devolveu nenhum modelo para essa chave.' }); return }
      if (ids.includes(f.model)) { setModelsMsg({ ok: true, text: `Chave aceita. ${ids.length} modelos disponíveis.` }); return }
      const pr = presetOf(f.preset)
      const best = (pr?.prefer || []).map(w => ids.find(id => id.toLowerCase().includes(w.toLowerCase()))).find(Boolean) || ids[0]
      setForm(cur => (cur ? { ...cur, model: best! } : cur))
      setModelsMsg({ ok: true, text: `Chave aceita. O modelo "${f.model}" não existe mais aí, troquei para "${best}". Dá para escolher outro na lista.` })
    } catch (e: any) { setModelsMsg({ ok: false, text: e.message }) } finally { setLoadingModels(false) }
  }

  const submit = async () => {
    if (!form) return
    setSaving(true); setFormError('')
    try {
      const d = await call({ action: 'save', ...form })
      setList(d.providers); setForm(null)
      d.provider.lastTest?.ok ? toast.success(`${d.provider.name} conectado e funcionando`) : toast.error('Salvo, mas o teste falhou. Veja o motivo no cartão.')
    } catch (e: any) { setFormError(e.message) } finally { setSaving(false) }
  }

  if (!list) return <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>

  const active = list.filter(p => p.enabled && p.lastTest?.ok)
  const primary = list.find(p => p.enabled)
  const preset = form ? presetOf(form.preset) : null

  return (
    <div className="space-y-6">
      <div className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${active.length ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
        <Sparkles className={`h-5 w-5 shrink-0 ${active.length ? 'text-emerald-400' : 'text-amber-400'}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${active.length ? 'text-emerald-300' : 'text-amber-300'}`}>
            {active.length ? `IA funcionando · ${active.length} ${active.length === 1 ? 'conexão ativa' : 'conexões ativas'}` : list.length ? 'Nenhuma conexão passou no teste' : 'Nenhuma IA conectada, o editor está em modo básico'}
          </p>
          <p className="text-xs text-gray-400">
            {primary ? `Principal: ${primary.name}. Se ela falhar, a próxima da lista assume. ` : ''}{usage.calls} chamadas nos últimos 30 dias.
            {env.anthropic || env.openai ? ' Também há uma chave no servidor, usada só como último recurso.' : ''}
          </p>
        </div>
        {list.length > 0 && (
          <button onClick={async () => { for (const p of list) if (p.enabled) await test(p.id) }} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10">
            <RefreshCw className="h-3.5 w-3.5" /> Testar todas
          </button>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Suas conexões</h3>
        {list.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-gray-500">Nenhuma conexão ainda. Escolha um provedor abaixo.</p>}
        {list.map((c, i) => {
          const pr = presetOf(c.preset)
          const b = busy[c.id]
          const status = !c.enabled ? { t: 'Desligada', cls: 'bg-white/10 text-gray-400' }
            : b === 'test' || b === 'save' ? { t: 'Testando…', cls: 'bg-blue-500/15 text-blue-300' }
            : !c.lastTest ? { t: 'Não testada', cls: 'bg-amber-500/15 text-amber-300' }
            : c.lastTest.ok ? { t: 'Ativa', cls: 'bg-emerald-500/15 text-emerald-300' } : { t: 'Com erro', cls: 'bg-red-500/15 text-red-300' }
          const isPrimary = primary?.id === c.id
          return (
            <div key={c.id} className={`rounded-2xl border p-4 ${c.enabled ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 bg-white/[0.015] opacity-70'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${pr?.tint ?? 'bg-white/10 text-gray-300'}`}>{pr?.name.split(' ')[0] ?? c.preset}</span>
                <h4 className="text-sm font-semibold text-white">{c.name}</h4>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.cls}`}>{b === 'test' || b === 'save' ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}{status.t}</span>
                {isPrimary && <span className="flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] font-semibold text-violet-200"><Crown className="h-3 w-3" /> Principal</span>}
                {i > 0 && c.enabled && !isPrimary && <span className="text-[11px] text-gray-500">reserva</span>}
              </div>

              <div className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-gray-500">Chave</span>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <code className="min-w-0 truncate rounded-md bg-black/30 px-2 py-1 font-mono text-[12px] text-gray-200">{shown[c.id] ?? c.keyMask}</code>
                    <button onClick={() => reveal(c.id)} title={shown[c.id] ? 'Esconder' : 'Mostrar'} className="text-gray-500 hover:text-gray-200">{shown[c.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                    <button onClick={() => copy(c.id)} title="Copiar" className="text-gray-500 hover:text-gray-200"><Copy className="h-4 w-4" /></button>
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Modelo</span>
                  <p className="mt-0.5 truncate py-1 font-mono text-[12px] text-gray-200">{c.model}</p>
                </div>
              </div>

              {c.lastTest && c.enabled && (
                <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${c.lastTest.ok ? 'bg-emerald-500/[0.07] text-emerald-300' : 'bg-red-500/[0.08] text-red-300'}`}>
                  {c.lastTest.ok ? <Check className="mr-1 inline h-3.5 w-3.5" /> : <X className="mr-1 inline h-3.5 w-3.5" />}
                  {c.lastTest.msg} <span className="text-gray-500">· testado {ago(c.lastTest.at)}</span>
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={() => test(c.id)} disabled={!!b} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/10 disabled:opacity-40"><Zap className="h-3.5 w-3.5" /> Testar</button>
                {!isPrimary && c.enabled && <button onClick={() => act(c.id, { action: 'primary' }, `${c.name} agora é a principal`)} disabled={!!b} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10 disabled:opacity-40"><Crown className="h-3.5 w-3.5" /> Tornar principal</button>}
                <button onClick={() => openEdit(c)} disabled={!!b} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10 disabled:opacity-40">Editar</button>
                <button onClick={() => act(c.id, { action: 'toggle', enabled: !c.enabled })} disabled={!!b} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10 disabled:opacity-40"><Power className="h-3.5 w-3.5" /> {c.enabled ? 'Desligar' : 'Ligar'}</button>
                <span className="flex-1" />
                {confirmDel === c.id ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-red-300">Excluir de vez?</span>
                    <button onClick={() => { setConfirmDel(null); act(c.id, { action: 'delete' }, 'Conexão excluída') }} className="rounded-lg bg-red-500/20 px-3 py-1.5 font-semibold text-red-200 hover:bg-red-500/30">Sim, excluir</button>
                    <button onClick={() => setConfirmDel(null)} className="text-gray-400 hover:text-white">Cancelar</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDel(c.id)} disabled={!!b} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> Excluir</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Adicionar provedor</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {AI_PRESETS.map(p => (
            <button key={p.id} onClick={() => openNew(p.id)} className="group flex flex-col gap-1.5 rounded-xl border border-white/10 px-3 py-3 text-left transition hover:border-violet-400/50 hover:bg-white/5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-semibold text-white">{p.name}</span>
                <Plus className="h-3.5 w-3.5 text-gray-600 group-hover:text-violet-300" />
              </div>
              <span className={`w-fit rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${p.free ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-gray-400'}`}>{p.free ? 'Tem plano grátis' : 'Pago'}</span>
              <span className="text-[11px] leading-snug text-gray-500">{p.note}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">Quando surgir um provedor novo, use "Outro (compatível com OpenAI)" com o endereço e o modelo dele.</p>
      </div>

      {form && preset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => !saving && setForm(null)}>
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#0e0a1a] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">{form.id ? 'Editar' : 'Conectar'} {preset.name}</h3>
              <button onClick={() => !saving && setForm(null)} className="rounded-lg p-1 text-gray-500 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-300">Chave da API</span>
              <span className="block text-[11px] text-gray-500">{preset.keyHint}</span>
              <input type="password" autoFocus value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} onBlur={() => form.key.trim().length >= 8 && !models.length && fetchModels(form)} placeholder={form.id ? 'deixe vazio para manter a atual' : preset.placeholder} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-violet-400/60 focus:outline-none" />
            </label>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor="ai-model" className="text-xs font-medium text-gray-300">Modelo</label>
                <button type="button" onClick={() => fetchModels(form)} disabled={loadingModels || (!form.id && form.key.trim().length < 8)} className="flex items-center gap-1 text-[11px] text-violet-300 hover:underline disabled:opacity-40 disabled:no-underline">
                  {loadingModels ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Buscar modelos da minha conta
                </button>
              </div>
              <input id="ai-model" list="ai-models" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white focus:border-violet-400/60 focus:outline-none" />
              <datalist id="ai-models">{models.map(m => <option key={m} value={m} />)}</datalist>
              {modelsMsg && <p className={`text-[11px] leading-snug ${modelsMsg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{modelsMsg.text}</p>}
            </div>
            {(preset.id === 'custom' || form.id) && (
              <label className="block space-y-1">
                <span className="text-xs font-medium text-gray-300">Endereço da API</span>
                <input value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.exemplo.com/v1" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white placeholder:text-gray-600 focus:border-violet-400/60 focus:outline-none" />
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-300">Nome (para você reconhecer)</span>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-400/60 focus:outline-none" />
            </label>
            {formError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{formError}</p>}
            <p className="text-[11px] text-gray-500">Ao salvar, a conexão é testada na hora e o resultado aparece no cartão.</p>
            <button onClick={submit} disabled={saving || (!form.id && !form.key.trim())} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {saving ? 'Salvando e testando…' : 'Salvar e testar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
