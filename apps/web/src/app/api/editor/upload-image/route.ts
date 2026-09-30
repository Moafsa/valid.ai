import { NextRequest, NextResponse } from 'next/server'
import { getCurrentWorkspace } from '@/lib/auth-helper'

const MAX_BYTES = 8 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace()
    if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Envie um arquivo de imagem' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Imagem muito grande (máx. 8MB)' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const scannerUrl = process.env.SCANNER_SERVICE_URL ?? 'http://scanner:8001'
    const res = await fetch(`${scannerUrl}/api/scanner/upload-asset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data_b64: buffer.toString('base64'),
        filename: file.name,
        content_type: file.type,
      }),
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Falha ao enviar imagem' }, { status: 502 })
    }
    const data = await res.json()
    return NextResponse.json({ url: data.url })
  } catch (error) {
    console.error('Upload image error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
