import { notFound } from 'next/navigation'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { ClonePageBody } from '@/components/public/clone-page-body'

export const dynamic = 'force-dynamic'

/**
 * The pretty entry point for a published project: be-vallid.com/s/{slug}
 * instead of the raw /projects/{cuid}/p/{pageSlug}. Renders the project's
 * first page (lowest order). Deeper navigation from there still uses the
 * canonical /projects/[id]/p/[slug] route — that's what the scanner baked
 * into internal <a href> links at scan time, before any slug existed — so
 * only the entry link is pretty, not every internal jump. Once a real
 * wildcard subdomain exists (needs DNS the user controls, not this app),
 * middleware can rewrite {slug}.be-vallid.com straight to this same route.
 */
export default async function PublishedProjectHome({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const project = await db.project.findUnique({ where: { slug } })
  if (!project || !['READY', 'PUBLISHED'].includes(project.status)) notFound()

  const page = await db.page.findFirst({ where: { projectId: project.id }, orderBy: { order: 'asc' } })
  if (!page) notFound()

  const blocks = Array.isArray(page.blocks) ? (page.blocks as any[]) : []
  const workspace = await getCurrentWorkspace().catch(() => null)
  const isOwner = workspace?.id === project.workspaceId

  return (
    <ClonePageBody
      projectId={project.id}
      pageId={page.id}
      blocks={blocks}
      customCss={page.customCss ?? null}
      isOwner={isOwner}
    />
  )
}
