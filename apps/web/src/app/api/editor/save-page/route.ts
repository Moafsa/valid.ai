import { getCurrentWorkspace } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { z } from 'zod'

const blockSchema = z.object({
  id: z.string(),
  type: z.string(),
  order: z.number(),
  generatedHtml: z.string().nullable().optional(),
}).passthrough()

const schema = z.object({
  pageId: z.string(),
  blocks: z.array(blockSchema),
})

/**
 * Replaces a page's entire blocks array — the editor sends back the full,
 * final component tree on every save (not a diff), same as GrapesJS's own
 * model: the canvas is the source of truth at save time.
 */
export async function POST(req: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace()
    if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { pageId, blocks } = schema.parse(await req.json())

    const page = await db.page.findUnique({ where: { id: pageId }, include: { project: true } })
    if (!page || page.project.workspaceId !== workspace.id) {
      return NextResponse.json({ error: 'Página não encontrada' }, { status: 404 })
    }

    await db.page.update({ where: { id: pageId }, data: { blocks: blocks as any } })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 })
    }
    console.error('Save page error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
