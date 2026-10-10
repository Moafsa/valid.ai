import { NextRequest, NextResponse } from 'next/server'
import { getCurrentWorkspace } from '@/lib/auth-helper'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
// Base64 inflates the payload by ~1.37x, and nginx in front of this app
// caps request bodies at 50MB — 30MB raw stays safely under that after
// encoding (~41MB). Generous for the "lighter pages" videos this editor
// targets, not for re-hosting a full-length original video file.
const MAX_VIDEO_BYTES = 30 * 1024 * 1024

/**
 * Same re-host-to-our-own-S3 flow as /api/editor/upload-image, generalized
 * to also accept video files — used by the editor's Mídias tab to swap a
 * <video>/<source> src or a background-image, not just an <img>. Kept as
 * its own route rather than widening upload-image in place, so the
 * existing image-only call sites (Conteúdo tab) keep their exact current
 * behavior/limits untouched.
 */
export async function POST(req: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace()
    if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
    }

    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')
    if (!isVideo && !isImage) {
      return NextResponse.json({ error: 'Envie uma imagem ou um vídeo' }, { status: 400 })
    }
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: isVideo ? 'Vídeo muito grande (máx. 30MB)' : 'Imagem muito grande (máx. 8MB)' },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const scannerUrl = process.env.SCANNER_SERVICE_URL ?? 'http://scanner:8001'
    const res = await fetch(`${scannerUrl}/api/scanner/upload-asset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-scanner-secret': process.env.SCANNER_SHARED_SECRET || '' },
      body: JSON.stringify({
        data_b64: buffer.toString('base64'),
        filename: file.name,
        content_type: file.type,
      }),
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Falha ao enviar arquivo' }, { status: 502 })
    }
    const data = await res.json()
    return NextResponse.json({ url: data.url })
  } catch (error) {
    console.error('Upload media error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
