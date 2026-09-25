import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { z } from 'zod'

/**
 * Replaces a page's entire blocks array in one shot. save-block can only
 * patch one existing block's generatedHtml — it can't add, remove, or
 * reorder entries, which is exactly what the visual editor's duplicate/
 * reorder/create-section operations need (they change the array's shape,
 * not just one block's content).
 */
const blockSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    order: z.number(),
  })
  .passthrough()

const bodySchema = z.object({
  pageId: z.string(),
  blocks: z.array(blockSchema),
})

export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthUser()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { pageId, blocks } = bodySchema.parse(await req.json())

    const page = await db.page.findUnique({ where: { id: pageId } })
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    await db.page.update({ where: { id: pageId }, data: { blocks: blocks as any } })

    return NextResponse.json({ ok: true, blocksCount: blocks.length })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 })
    }
    console.error('Save page error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
