import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'

/**
 * Ingests events from sdk.js on published funnels and builds each visitor's
 * timeline (Entrou → respondeu → assistiu vídeo → clicou → checkout).
 * Previously this only ever wrote a single "captured" entry on the very
 * first lead_capture event and silently dropped every other event type —
 * so there was never really a timeline, just a one-line stub.
 */
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

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // sdk.js's generic .event(type, metadata) call (used for quiz_answer,
    // video_progress, cta_click, ...) never sends a top-level "step" — the
    // useful bit lives inside metadata (e.g. { percent: 25 }), which used to
    // get silently dropped here, leaving every video_progress row as
    // "step": null with no way to tell 25% from 100% apart afterwards.
    const resolvedStep =
      step ?? (metadata?.percent != null ? `${metadata.percent}%` : null) ?? metadata?.step ?? null
    const timelineEntry = { event: eventType, step: resolvedStep, timestamp: timestamp ?? new Date().toISOString() }

    // sdk.js's sessionId lives in localStorage, which is scoped to this
    // origin — not to one project. The same visitor clicking through two
    // different published funnels on be-vallid.com carries the SAME
    // sessionId into both. Using that raw value as the Lead's id used to
    // merge both journeys into one row, permanently stuck on whichever
    // project happened to create it first. Scoping the id to this project
    // keeps each funnel's timeline independent, the way "leads per project"
    // is supposed to work.
    const leadId = `${projectId}_${sessionId}`

    const existing = await db.lead.findUnique({ where: { id: leadId } })
    const existingTimeline = Array.isArray(existing?.timeline) ? (existing!.timeline as any[]) : []

    const identity =
      eventType === 'lead_capture'
        ? {
            email: (metadata?.email as string) ?? leadEmail ?? existing?.email ?? undefined,
            name: (metadata?.name as string) ?? existing?.name ?? undefined,
            phone: (metadata?.phone as string) ?? existing?.phone ?? undefined,
          }
        : {}

    await db.lead.upsert({
      where: { id: leadId },
      update: {
        ...identity,
        timeline: [...existingTimeline, timelineEntry],
      },
      create: {
        id: leadId,
        projectId,
        device,
        utmParams: utmParams ?? {},
        quizAnswers: {},
        timeline: [timelineEntry],
        ...identity,
      },
    })

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
