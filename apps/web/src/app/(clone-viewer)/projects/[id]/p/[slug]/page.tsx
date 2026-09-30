import { notFound } from 'next/navigation'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { BackToProjectChip } from '@/components/dashboard/back-to-project-chip'
import { PageTracker } from '@/components/public/page-tracker'
import { ImageLightbox } from '@/components/public/image-lightbox'
import { InteractiveRuntime } from '@/components/public/interactive-runtime'

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
 *
 * Deliberately NOT gated by getCurrentWorkspace() — this is the page a
 * real, anonymous site visitor opens (the whole point of "publish your
 * funnel"), not a preview for the logged-in owner. Middleware's public
 * route list allows this path through for exactly that reason.
 */
export default async function ClonePageViewer({
  params,
}: {
  params: Promise<{ id: string; slug: string }>
}) {
  const { id, slug } = await params

  const project = await db.project.findUnique({ where: { id } })
  if (!project || !['READY', 'PUBLISHED'].includes(project.status)) notFound()

  const page = await db.page.findFirst({ where: { projectId: id, slug } })
  if (!page) notFound()

  const blocks = Array.isArray(page.blocks) ? (page.blocks as any[]) : []
  const sorted = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const body = sorted.map(b => b.generatedHtml || '').join('\n')

  // Real visitors land here too now that this route is public — only show
  // the "back to dashboard" chip to the project's own owner, since that
  // link points at an auth-gated page anyone else would just bounce off.
  const workspace = await getCurrentWorkspace().catch(() => null)
  const isOwner = workspace?.id === project.workspaceId

  return (
    <>
      {page.customCss && <style dangerouslySetInnerHTML={{ __html: page.customCss }} />}
      <PageTracker projectId={id} pageId={page.id} />
      <ImageLightbox />
      <InteractiveRuntime />
      {isOwner && <BackToProjectChip projectId={id} />}
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  )
}
