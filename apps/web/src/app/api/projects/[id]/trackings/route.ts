import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { z } from 'zod'

const trackingSchema = z.object({
  type: z.enum(['META_PIXEL', 'TIKTOK_PIXEL', 'GOOGLE_TAG', 'GOOGLE_ANALYTICS', 'GTM', 'CUSTOM']),
  pixelId: z.string().min(1),
  isActive: z.boolean(),
})

/**
 * Replaces the project's tracking list. This is what "review, edit and
 * activate before publishing" actually means: the scan already detects
 * pixels (ProjectTracking rows created in /api/scan/finalize), but until
 * now there was no screen to see, edit or toggle them — and the published
 * page never read them either (see the tracking injection in
 * /f/[projectId]/[slug]/page.tsx).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthUser()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: projectId } = await params
    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const body = await req.json()
    const list = z.array(trackingSchema).parse(body.trackings)

    await db.$transaction([
      db.projectTracking.deleteMany({ where: { projectId } }),
      ...(list.length > 0
        ? [
            db.projectTracking.createMany({
              data: list.map(t => ({
                projectId,
                type: t.type,
                pixelId: t.pixelId,
                isActive: t.isActive,
                config: {},
              })),
            }),
          ]
        : []),
    ])

    const trackings = await db.projectTracking.findMany({ where: { projectId } })
    return NextResponse.json({ trackings })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 })
    }
    console.error('Update trackings error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
