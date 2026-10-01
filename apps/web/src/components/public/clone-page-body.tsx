import { PageTracker } from '@/components/public/page-tracker'
import { ImageLightbox } from '@/components/public/image-lightbox'
import { InteractiveRuntime } from '@/components/public/interactive-runtime'
import { BackToProjectChip } from '@/components/dashboard/back-to-project-chip'

interface Block {
  order?: number
  generatedHtml?: string | null
  [key: string]: any
}

/**
 * The actual rendered body of a cloned page — shared by every route that
 * can serve one (the canonical /projects/[id]/p/[slug], and the prettier
 * /s/[slug] alias) so there's exactly one place that assembles blocks into
 * HTML and wires up tracking/lightbox/interactivity, instead of two copies
 * drifting apart.
 */
export function ClonePageBody({
  projectId,
  pageId,
  blocks,
  customCss,
  isOwner,
}: {
  projectId: string
  pageId: string
  blocks: Block[]
  customCss: string | null
  isOwner: boolean
}) {
  const sorted = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const body = sorted.map(b => b.generatedHtml || '').join('\n')

  return (
    <>
      {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}
      <PageTracker projectId={projectId} pageId={pageId} />
      <ImageLightbox />
      <InteractiveRuntime />
      {isOwner && <BackToProjectChip projectId={projectId} />}
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  )
}
