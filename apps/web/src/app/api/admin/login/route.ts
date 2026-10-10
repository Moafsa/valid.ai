import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { attemptLogin, cookieHeader } from '@/lib/admin-auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = z.object({ email: z.string().max(200), password: z.string().max(200) }).parse(await req.json())
    const r = await attemptLogin(email, password)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 401 })
    const res = NextResponse.json({ ok: true })
    res.headers.append('set-cookie', cookieHeader(r.token))
    return res
  } catch {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }
}
