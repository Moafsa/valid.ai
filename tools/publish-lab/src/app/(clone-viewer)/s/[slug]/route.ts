import { NextRequest } from 'next/server'
import { renderClonePage, requestOpts } from '@/lib/clone-document'

export const dynamic = 'force-dynamic'

// The public address of a published project: be-vallid.com/s/{slug} serves the
// project's first page FROM THE PUBLISHED SNAPSHOT (written by "Publicar"), never
// from the pages being edited. Its internal links are rewritten to stay under
// /s/{slug}/..., so a visitor never lands on the editor's working copy.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return renderClonePage({ by: 'published', projectSlug: slug }, requestOpts(req))
}
