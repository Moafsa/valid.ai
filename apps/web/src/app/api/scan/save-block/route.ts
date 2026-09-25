import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { z } from 'zod'

const schema = z.object({
  pageId: z.string(),
  blockId: z.string(),
  generatedHtml: z.string(),
})

/**
 * Persists a single block's generatedHtml after a prompt-based edit
 * (PromptEditModal -> /api/editor/update-prompt only returns the new code,
 * it never writes it anywhere — this route is that missing write).
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthUser()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { pageId, blockId, generatedHtml } = schema.parse(await req.json())

    const page = await db.page.findUnique({ where: { id: pageId } })
    if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

    const blocks = Array.isArray(page.blocks) ? (page.blocks as any[]) : []
    const index = blocks.findIndex((b: any) => b.id === blockId)
    if (index === -1) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 })
    }

    blocks[index] = { ...blocks[index], generatedHtml }

    await db.page.update({
      where: { id: pageId },
      data: { blocks },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 })
    }
    console.error('Save block error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
