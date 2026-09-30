import { notFound } from 'next/navigation'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { VisualEditor } from '@/components/editor/visual-editor'

export const dynamic = 'force-dynamic'

export default async function VisualEditorPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>
}) {
  const { id, slug } = await params
  const workspace = await getCurrentWorkspace()
  if (!workspace) notFound()

  const project = await db.project.findFirst({ where: { id, workspaceId: workspace.id } })
  if (!project) notFound()

  const page = await db.page.findFirst({ where: { projectId: id, slug } })
  if (!page) notFound()

  const blocks = Array.isArray(page.blocks) ? (page.blocks as any[]) : []

  return <VisualEditor projectId={id} pageId={page.id} blocks={blocks} pageCss={page.customCss ?? null} />
}
