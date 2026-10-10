import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { buildCloneDocument, type CloneShell } from '@/lib/clone-document'

export const dynamic = 'force-dynamic'

/**
 * The scanner checks a clone against its original BEFORE saving it, the way a visitor would see it. This builds the
 * document of a page that has not been saved yet (same code the public routes use, stylesheet inlined) and hands it
 * back; nothing is written. Same shared secret as the other /api/internal routes.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SCANNER_SHARED_SECRET || ''
  const given = req.headers.get('x-scanner-secret') || ''
  const a = Buffer.from(secret)
  const b = Buffer.from(given)
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const sections = Array.isArray(body?.sections) ? body.sections : []
    const html = buildCloneDocument({
      projectId: String(body?.projectId || 'preview'),
      pageId: 'preview',
      name: String(body?.name || 'Preview'),
      blocks: sections.map((s: any, i: number) => ({ order: s.order ?? i, generatedHtml: s.generatedHtml ?? '' })),
      customCss: typeof body?.pageCss === 'string' ? body.pageCss : null,
      shell: body?.shell && typeof body.shell === 'object' ? (body.shell as CloneShell) : null,
      isOwner: false,
      basePath: '/preview',
      narrowToPhone: false,
      preview: true,
      inlineCss: true,
    })
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
  } catch (e) {
    console.error('clone-preview error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
