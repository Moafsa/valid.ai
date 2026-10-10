import { NextRequest } from 'next/server'
import { renderClonePage, requestOpts } from '@/lib/clone-document'

export const dynamic = 'force-dynamic'

// The canonical address of one cloned page — what the scanner bakes into
// every internal <a href> at scan time. Returns a bare HTML document (not a
// React page) on purpose: see buildCloneDocument for why the clone must not
// share a document with any CSS of ours.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id, slug } = await params
  return renderClonePage({ by: 'id', projectId: id, pageSlug: slug }, requestOpts(req))
}
