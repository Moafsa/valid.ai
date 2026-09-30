import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'

/**
 * Persists the scan result produced by the scanner service. The scanner
 * only pushes progress events over Redis — it never writes to Postgres.
 * The client listens for the "done" event and calls this route with the
 * full result payload so we create the Page and flip the project to READY.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthUser()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { jobId, projectId, result, error: scanError } = body as {
      jobId?: string
      projectId?: string
      result?: any
      error?: string
    }

    if (!projectId || (!result && !scanError)) {
      console.error('Finalize scan: missing projectId/result', { projectId, hasResult: !!result, hasScanError: !!scanError })
      return NextResponse.json({ error: 'projectId and (result or error) are required' }, { status: 400 })
    }

    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) {
      console.error('Finalize scan: project not found', { projectId, jobId })
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (scanError) {
      await db.$transaction([
        db.project.update({ where: { id: projectId }, data: { status: 'ERROR' } }),
        // updateMany, not update: a stale/mismatched jobId (retry, a second
        // tab, a race) must never throw and undo the project status update
        // that already succeeded in this same transaction.
        ...(jobId ? [db.scanJob.updateMany({ where: { id: jobId }, data: { status: 'ERROR', errorMsg: scanError } })] : []),
      ])
      return NextResponse.json({ ok: true })
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
    // route (see the isolated page-viewer route), with internal <a href>s
    // already rewritten by the scanner to point at each other.
    const pages = Array.isArray(result.pages) ? result.pages : []
    const pageCreates = pages.map((p: any, i: number) => ({
      projectId,
      name: p.name || p.slug || `Página ${i + 1}`,
      slug: p.slug || `page-${i + 1}`,
      order: i,
      blocks: toBlocks(p.sections),
      customCss: p.page_css || null,
    }))

    if (pageCreates.length === 0) {
      console.error('Finalize scan: scanner result has no pages', { projectId, jobId })
      return NextResponse.json({ error: 'A clonagem não retornou nenhuma página' }, { status: 400 })
    }

    try {
      await db.$transaction([
        db.page.deleteMany({ where: { projectId } }),
        ...pageCreates.map((data: typeof pageCreates[number]) => db.page.create({ data })),
        db.project.update({
          where: { id: projectId },
          data: { status: 'READY', thumbnail: result.thumbnail || null, crawlStats: result.crawlStats || null },
        }),
        // updateMany, not update — see the scanError branch above for why.
        ...(jobId
          ? [db.scanJob.updateMany({ where: { id: jobId }, data: { status: 'DONE', progress: 100, currentStep: 'Concluído', resultJson: result } })]
          : []),
      ])
    } catch (dbError: any) {
      console.error('Finalize scan: DB transaction failed', {
        projectId, jobId, code: dbError?.code, meta: dbError?.meta, message: dbError?.message,
        pageCount: pageCreates.length,
      })
      return NextResponse.json({ error: dbError?.message || 'Falha ao salvar no banco de dados' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Finalize scan error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
