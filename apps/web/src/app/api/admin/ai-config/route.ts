import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { currentAdmin } from '@/lib/admin'
import { ProviderError, listModels, loadProviders, maskKey, saveProviders, testProvider, validBaseUrl, type StoredProvider } from '@/lib/ai-providers'
import { presetOf } from '@/lib/ai-presets'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const view = (p: StoredProvider) => ({
  id: p.id, preset: p.preset, name: p.name, kind: p.kind, baseUrl: p.baseUrl, model: p.model,
  enabled: p.enabled, keyMask: maskKey(p.key), lastTest: p.lastTest ?? null,
})

const body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'), id: z.string().max(40).optional(), preset: z.string().max(30), name: z.string().max(60).optional(),
    baseUrl: z.string().max(300).optional(), model: z.string().max(120).optional(), key: z.string().max(400).optional(),
  }),
  z.object({ action: z.literal('delete'), id: z.string() }),
  z.object({ action: z.literal('primary'), id: z.string() }),
  z.object({ action: z.literal('toggle'), id: z.string(), enabled: z.boolean() }),
  z.object({ action: z.literal('test'), id: z.string() }),
  z.object({ action: z.literal('reveal'), id: z.string() }),
  z.object({ action: z.literal('models'), preset: z.string().max(30), id: z.string().max(40).optional(), key: z.string().max(400).optional(), baseUrl: z.string().max(300).optional() }),
])

export async function GET() {
  if (!(await currentAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const list = await loadProviders()
  return NextResponse.json({
    providers: list.map(view),
    env: { anthropic: !!process.env.ANTHROPIC_API_KEY, openai: !!process.env.OPENAI_API_KEY },
  })
}

export async function POST(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  const b = parsed.data
  const list = await loadProviders()
  const find = (id: string) => list.find(p => p.id === id)

  if (b.action === 'save') {
    const preset = presetOf(b.preset)
    if (!preset) return NextResponse.json({ error: 'Provedor desconhecido' }, { status: 400 })
    const existing = b.id ? find(b.id) : undefined
    if (b.id && !existing) return NextResponse.json({ error: 'Conexão não encontrada' }, { status: 404 })
    const key = b.key?.trim() || existing?.key || ''
    if (!key) return NextResponse.json({ error: 'Cole a chave da API' }, { status: 400 })
    const model = (b.model ?? existing?.model ?? preset.model).trim()
    if (!model) return NextResponse.json({ error: 'Informe o modelo' }, { status: 400 })
    const rawBase = (b.baseUrl ?? existing?.baseUrl ?? preset.baseUrl).trim()
    const baseUrl = validBaseUrl(rawBase)
    if (!baseUrl) return NextResponse.json({ error: 'O endereço precisa começar com https:// e ser de um serviço na internet' }, { status: 400 })
    const next: StoredProvider = {
      id: existing?.id ?? randomUUID().slice(0, 8), preset: preset.id, name: (b.name?.trim() || existing?.name || preset.name), kind: preset.kind,
      baseUrl, model, key, enabled: existing?.enabled ?? true,
    }
    next.lastTest = await testProvider(next)
    if (existing) list[list.indexOf(existing)] = next; else list.push(next)
    await saveProviders(list)
    return NextResponse.json({ ok: true, provider: view(next), providers: list.map(view) })
  }

  if (b.action === 'models') {
    const preset = presetOf(b.preset)
    const existing = b.id ? find(b.id) : undefined
    const key = b.key?.trim() || existing?.key || ''
    const baseUrl = validBaseUrl(b.baseUrl || existing?.baseUrl || preset?.baseUrl || '')
    if (!preset || !key || !baseUrl) return NextResponse.json({ error: 'Cole a chave primeiro' }, { status: 400 })
    try {
      return NextResponse.json({ models: await listModels({ kind: preset.kind, baseUrl, key, name: preset.name, model: '' }) })
    } catch (e: any) {
      return NextResponse.json({ error: e instanceof ProviderError ? e.message : 'Não consegui buscar os modelos' }, { status: 502 })
    }
  }

  const p = find(b.id)
  if (!p) return NextResponse.json({ error: 'Conexão não encontrada' }, { status: 404 })

  if (b.action === 'reveal') return NextResponse.json({ key: p.key })
  if (b.action === 'test') {
    p.lastTest = await testProvider(p)
    await saveProviders(list)
  } else if (b.action === 'delete') {
    list.splice(list.indexOf(p), 1)
    await saveProviders(list)
  } else if (b.action === 'primary') {
    list.splice(list.indexOf(p), 1)
    list.unshift(p)
    await saveProviders(list)
  } else if (b.action === 'toggle') {
    p.enabled = b.enabled
    await saveProviders(list)
  }
  return NextResponse.json({ ok: true, providers: list.map(view) })
}
