import { NextRequest } from 'next/server'
import { renderClonePage, requestOpts } from '@/lib/clone-document'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; pageSlug: string }> }) {
  const { slug, pageSlug } = await params
  return renderClonePage({ by: 'published', projectSlug: slug, pageSlug }, requestOpts(req))
}
