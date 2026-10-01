import { notFound } from 'next/navigation'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { ClonePageBody } from '@/components/public/clone-page-body'

export const dynamic = 'force-dynamic'

// Same idea as the sibling /s/[slug]/page.tsx (the project's home page),
// but for a specific secondary page by its own slug — be-vallid.com/s/
// {projectSlug}/{pageSlug} instead of the raw /projects/{cuid}/p/{slug}.
export default async function PublishedProjectPage({
  params,
}: {
  params: Promise<{ slug: string; pageSlug: string }>
}) {
  const { slug, pageSlug } = await params

  const project = await db.project.findUnique({ where: { slug } })
  if (!project || !['READY', 'PUBLISHED'].includes(project.status)) notFound()

  const page = await db.page.findFirst({ where: { projectId: project.id, slug: pageSlug } })
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
