import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { featureGate, gateResponse } from '@/lib/plans'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const scanner = () => process.env.SCANNER_SERVICE_URL ?? 'http://scanner:8001'
const headers = () => ({ 'content-type': 'application/json', 'x-scanner-secret': process.env.SCANNER_SHARED_SECRET || '' })

/** Starts a cloaker check of a link (the scanner asks the address the way different visitors and robots ask). */
export async function POST(req: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace()
    if (!workspace) return NextResponse.json({ error: 'Faça login de novo.' }, { status: 401 })
    const allowed = await featureGate(workspace, 'cloaker')
    if (!allowed.ok) return NextResponse.json(gateResponse(allowed), { status: 403 })
    const { url } = z.object({ url: z.string().min(4).max(2000) }).parse(await req.json())
    // each test sends a dozen requests from this server: twelve an hour per account is plenty
    const since = new Date(Date.now() - 3600_000)
    const recent = await db.aiUsageLog.count({ where: { workspaceId: workspace.id, operation: 'cloaker', createdAt: { gte: since } } })
    if (recent >= 12) return NextResponse.json({ error: 'Você já fez muitos testes nesta hora. Tente de novo daqui a pouco.' }, { status: 429 })
    const res = await fetch(`${scanner()}/api/cloaker/start`, { method: 'POST', headers: headers(), body: JSON.stringify({ url }), signal: AbortSignal.timeout(15000) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json({ error: j.detail || 'Não consegui testar esse endereço.' }, { status: res.status === 400 ? 400 : 502 })
    await db.aiUsageLog.create({ data: { workspaceId: workspace.id, operation: 'cloaker', model: 'probe', provider: 'internal' } }).catch(() => {})
    return NextResponse.json({ id: j.id })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Cole o endereço do link.' }, { status: 400 })
    console.error('cloaker start', e)
    return NextResponse.json({ error: 'Não consegui iniciar o teste.' }, { status: 500 })
  }
}

/** Progress and result of a check. */
export async function GET(req: NextRequest) {
  const workspace = await getCurrentWorkspace()
  if (!workspace) return NextResponse.json({ error: 'Faça login de novo.' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!/^[a-f0-9]{8,32}$/.test(id)) return NextResponse.json({ error: 'id' }, { status: 400 })
  const res = await fetch(`${scanner()}/api/cloaker/${id}${req.nextUrl.searchParams.get('brief') ? '?brief=1' : ''}`, { headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(15000) }).catch(() => null)
  if (!res) return NextResponse.json({ error: 'O clonador não respondeu.' }, { status: 502 })
  const j = await res.json().catch(() => ({}))
  return NextResponse.json(j, { status: res.ok ? 200 : res.status === 404 ? 404 : 502 })
}
