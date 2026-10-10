import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { adminLoginSession, checkPassword, hashPassword } from '@/lib/admin-auth'

/** The administrator changes their own password (the current one is asked again). */
export async function POST(req: NextRequest) {
  const s = await adminLoginSession()
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const { current, next } = z.object({ current: z.string().max(200), next: z.string().min(8, 'A nova senha precisa ter pelo menos 8 caracteres').max(200) }).parse(await req.json())
    const row = await db.adminLogin.findUnique({ where: { email: s.email } })
    if (!row || !checkPassword(current, row.passwordHash)) return NextResponse.json({ error: 'A senha atual está errada.' }, { status: 400 })
    await db.adminLogin.update({ where: { id: row.id }, data: { passwordHash: hashPassword(next) } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof z.ZodError ? e.errors[0]?.message : 'Dados inválidos' }, { status: 400 })
  }
}
