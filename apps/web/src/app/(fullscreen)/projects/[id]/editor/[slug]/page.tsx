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

  const [page, allPages] = await Promise.all([
    db.page.findFirst({ where: { projectId: id, slug } }),
    db.page.findMany({
      where: { projectId: id },
      orderBy: { order: 'asc' },
      select: { id: true, slug: true, name: true, order: true },
    }),
  ])
  if (!page) notFound()

  const blocks = Array.isArray(page.blocks) ? (page.blocks as any[]) : []

  return (
    // key={page.id} forces a full remount when the page-switcher navigates
    // to a different page — the editor's GrapesJS init effect only runs
    // once ([] deps, by design, since re-running it on every prop change
    // would blow away undo history/selection mid-edit), so without this
    // key it would keep showing the previous page's blocks after a switch.
    <VisualEditor
      key={page.id}
      projectId={id}
      pageId={page.id}
      blocks={blocks}
      pageCss={page.customCss ?? null}
      pages={allPages}
    />
  )
}
