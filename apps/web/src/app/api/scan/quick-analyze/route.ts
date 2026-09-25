import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({ url: z.string().url() })

/**
 * Pre-clone summary step: "Encontramos um funil com X imagens, Y botões...".
 * Proxies to the scanner's lightweight analysis (no screenshots, just counts)
 * plus a cloaker pre-check, so the user can review before committing credits
 * to a full clone.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthUser()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { url } = schema.parse(await req.json())
    const scannerUrl = process.env.SCANNER_SERVICE_URL || 'http://localhost:8001'

    const res = await fetch(`${scannerUrl}/api/scanner/quick-analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Não foi possível acessar essa URL' }, { status: 502 })
    }

    const result = await res.json()
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 })
    }
    console.error('Quick analyze error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
