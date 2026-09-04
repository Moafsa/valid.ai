import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@funnelai/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const token = req.headers.get('x-internal-token')
  if (token !== process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const value = await getConfig(key)
  return NextResponse.json({ value })
}
