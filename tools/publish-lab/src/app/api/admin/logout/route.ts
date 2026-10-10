import { NextResponse } from 'next/server'
import { clearCookieHeader } from '@/lib/admin-auth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.headers.append('set-cookie', clearCookieHeader())
  return res
}
