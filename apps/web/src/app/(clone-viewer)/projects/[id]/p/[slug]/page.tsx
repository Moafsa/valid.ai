import { notFound } from 'next/navigation'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { BackToProjectChip } from '@/components/dashboard/back-to-project-chip'

export const dynamic = 'force-dynamic'

/**
 * Renders ONE cloned page as its own standalone document — no dashboard
 * chrome, no shared layout beyond the root (Clerk provider/Toaster).
 * Deliberately outside the (dashboard) route group: the captured page_css
 * can use broad selectors (bare `a`, `button`, `*`) that would otherwise
 * leak into the dashboard's own UI if this rendered inside that layout.
 * This is also what makes cross-page navigation actually work: an
 * internal <a href="/projects/[id]/p/[slug]"> rewritten by the scanner is
 * a normal top-level browser navigation to another instance of this same
 * route, not a link trapped inside a sandboxed iframe.
 */
export default async function ClonePageViewer({
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
  const sorted = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const body = sorted.map(b => b.generatedHtml || '').join('\n')

  return (
    <>
      {page.customCss && <style dangerouslySetInnerHTML={{ __html: page.customCss }} />}
      <BackToProjectChip projectId={id} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  )
}
