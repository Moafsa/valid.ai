/**
 * Endpoint INTERNO — chamado apenas pelo Scanner Service.
 * Retorna as chaves de IA configuradas pelo superadmin.
 * Protegido por token interno (nunca exposto ao frontend).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAiCredentials } from '@funnelai/db'

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-internal-token')
  if (token !== process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const creds = await getAiCredentials()
  return NextResponse.json(creds)
}
