import { db } from '@funnelai/db'

/**
 * Writes a scan's outcome to the database: the Project flips to READY with one
 * Page per cloned page, or to ERROR. Used by both ways a result can arrive:
 * the scanner handing it over directly (/api/internal/scan-complete — works
 * even if the browser tab was closed) and the browser forwarding it
 * (/api/scan/finalize — the fallback).
 */
export async function persistScanResult(input: {
  jobId?: string
  projectId: string
  result?: any
  scanError?: string
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { jobId, projectId, result, scanError } = input

  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) {
    console.error('Persist scan: project not found', { projectId, jobId })
    return { ok: false, status: 404, error: 'Project not found' }
  }

  if (scanError) {
    // A late "error" must never undo a clone that already finished.
    if (project.status === 'READY' || project.status === 'PUBLISHED') return { ok: true }
    await db.$transaction([
      db.project.update({ where: { id: projectId }, data: { status: 'ERROR' } }),
      // updateMany, not update: a stale/mismatched jobId (retry, a second
      // tab, a race) must never throw and undo the project status update
      // that already succeeded in this same transaction.
      ...(jobId ? [db.scanJob.updateMany({ where: { id: jobId }, data: { status: 'ERROR', errorMsg: scanError } })] : []),
    ])
    return { ok: true }
  }

  const toBlocks = (sections: any[]) =>
    (Array.isArray(sections) ? sections : []).map((s: any, i: number) => ({
      id: s.id ?? `section_${i}`,
      type: (s.type || 'custom-html').toString().toLowerCase(),
      order: s.order ?? i,
      generatedHtml: s.generatedHtml ?? null,
      links: Array.isArray(s.links) ? s.links : [],
    }))

  // result.pages: one entry per page the crawler actually cloned — each
  // becomes its own Page row, reachable at its own /projects/[id]/p/[slug]
  // route (see the isolated page-viewer route).
  //
  // Page.slug MUST be the scanner's own p.slug (e.g. "home", "etapa-2") — the
  // scanner already bakes the links between pages into the HTML using
  // exactly that slug at scan time. project.slug is for the published
  // domain, it has nothing to do with how pages address each other.
  //
  // The steps of a funnel all share one stylesheet: it travels once, as
  // result.shared_css, instead of in every page.
  const pages = Array.isArray(result?.pages) ? result.pages : []
  const pageCreates = pages.map((p: any, i: number) => ({
    projectId,
    name: p.name || p.slug || `Página ${i + 1}`,
    slug: p.slug || `page-${i + 1}`,
    order: i,
    blocks: toBlocks(p.sections),
    // steps of a funnel share one stylesheet: stored once, on the first page (see lib/page-css.ts)
    customCss: p.page_css || (i === 0 ? result?.shared_css || null : null),
    shell: p.shell && typeof p.shell === 'object' ? p.shell : undefined,
  }))

  if (pageCreates.length === 0) {
    console.error('Persist scan: scanner result has no pages', { projectId, jobId })
    return { ok: false, status: 400, error: 'A clonagem não retornou nenhuma página' }
  }

  try {
    await db.$transaction([
      db.page.deleteMany({ where: { projectId } }),
      ...pageCreates.map((data: (typeof pageCreates)[number]) => db.page.create({ data })),
      db.project.update({
        where: { id: projectId },
        data: { status: 'READY', thumbnail: result.thumbnail || null, crawlStats: result.crawlStats || null },
      }),
      // updateMany, not update — see the error branch above for why.
      ...(jobId
        ? [db.scanJob.updateMany({ where: { id: jobId }, data: { status: 'DONE', progress: 100, currentStep: 'Concluído', resultJson: result } })]
        : []),
    ])
  } catch (dbError: any) {
    console.error('Persist scan: DB transaction failed', {
      projectId, jobId, code: dbError?.code, meta: dbError?.meta, message: dbError?.message,
      pageCount: pageCreates.length,
    })
    return { ok: false, status: 500, error: dbError?.message || 'Falha ao salvar no banco de dados' }
  }
  return { ok: true }
}
