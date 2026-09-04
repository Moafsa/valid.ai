import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      projectId, sessionId, eventType, step,
      metadata, device, utmParams, leadEmail, timestamp
    } = body

    if (!projectId || !sessionId || !eventType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify project exists
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // If lead capture event, upsert lead
    if (eventType === 'lead_capture' && leadEmail) {
      await db.lead.upsert({
        where: { id: sessionId }, // use sessionId as temporary key
        update: {
          email: metadata?.email as string ?? leadEmail,
          name: metadata?.name as string ?? undefined,
          phone: metadata?.phone as string ?? undefined,
        },
        create: {
          id: sessionId,
          projectId,
          email: metadata?.email as string ?? leadEmail,
          name: metadata?.name as string ?? undefined,
          phone: metadata?.phone as string ?? undefined,
          device,
          utmParams: utmParams ?? {},
          quizAnswers: {},
          timeline: [{ event: 'captured', timestamp }],
        },
      })
    }

    // TODO: In Phase 2, write to ClickHouse for analytics
    // For now, just acknowledge the event
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Track error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// Allow CORS from published funnels
export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
