import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'

export const dynamic = 'force-dynamic'

/**
 * The page as it was CLONED, before any edit: one section of the scanner's saved result (scan_jobs.result_json).
 * The editor's AI reads it to bring a section back to its original look and to copy its identity instead of inventing one.
 * Only the owner of the project can read it. ?pageId=...&blockId=home_section_6 (or &index=6 when the block has no id).
 */
export async function GET(req: NextRequest) {
  const workspace = await getCurrentWorkspace()
  if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const pageId = req.nextUrl.searchParams.get('pageId') || ''
  const blockId = req.nextUrl.searchParams.get('blockId') || ''
  const index = req.nextUrl.searchParams.get('index')
  const page = pageId ? await db.page.findUnique({ where: { id: pageId }, include: { project: { select: { workspaceId: true, scanJobId: true } } } }) : null
  if (!page || page.project.workspaceId !== workspace.id) return NextResponse.json({ error: 'Página não encontrada' }, { status: 404 })
  const job = page.project.scanJobId ? await db.scanJob.findUnique({ where: { id: page.project.scanJobId }, select: { resultJson: true } }) : null
  const pages: any[] = Array.isArray((job?.resultJson as any)?.pages) ? (job!.resultJson as any).pages : []
  const orig = pages.find(p => p?.slug === page.slug)
  const sections: any[] = Array.isArray(orig?.sections) ? orig.sections : []
  if (!sections.length) return NextResponse.json({ error: 'O original desta página não está guardado.' }, { status: 404 })
  if (req.nextUrl.searchParams.get('digest') === '1') {
    // which CSS classes each original section used: enough to tell whether the section in the editor still is that section
    const classesOf = (html: string) => { const set = new Set<string>(); for (const m of html.matchAll(/\bclass="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) set.add(c); return [...set].slice(0, 400) }
    return NextResponse.json({ sections: sections.map((s, i) => ({ id: s.id, index: i, classes: classesOf(String(s.generatedHtml || '')) })) })
  }
  if (!blockId && index === null) return NextResponse.json({ sections: sections.map((s, i) => ({ id: s.id, index: i, size: String(s.generatedHtml || '').length })) })
  const found = blockId ? sections.find(s => s?.id === blockId) : sections[Number(index)]
  if (!found?.generatedHtml) return NextResponse.json({ error: 'Esta seção não existia no original.' }, { status: 404 })
  return NextResponse.json({ id: found.id, html: String(found.generatedHtml) })
}
