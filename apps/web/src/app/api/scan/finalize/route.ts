import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'

/**
 * Persists the scan result produced by the scanner service.
 * The scanner only pushes progress events over SSE (via Redis) — it never
 * writes to Postgres. The client listens for the "done" event and calls this
 * route with the full result payload so we can create the Page(s) and flip
 * the project to READY.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthUser()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { jobId, projectId, result, error: scanError } = body as {
      jobId?: string
      projectId?: string
      result?: any
      error?: string
    }

    if (!projectId || (!result && !scanError)) {
      return NextResponse.json(
        { error: 'projectId and (result or error) are required' },
        { status: 400 }
      )
    }

    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Scan failed — just mark the project/job as errored, nothing to persist.
    if (scanError) {
      await db.$transaction([
        db.project.update({ where: { id: projectId }, data: { status: 'ERROR' } }),
        ...(jobId
          ? [
              db.scanJob.update({
                where: { id: jobId },
                data: { status: 'ERROR', errorMsg: scanError },
              }),
            ]
          : []),
      ])
      return NextResponse.json({ ok: true })
    }

    const trackingTypeMap: Record<string, string> = {
      meta_pixel: 'META_PIXEL',
      tiktok_pixel: 'TIKTOK_PIXEL',
      google_tag: 'GOOGLE_TAG',
      google_analytics: 'GOOGLE_ANALYTICS',
      gtm: 'GTM',
    }
    const trackings = Array.isArray(result.trackings) ? result.trackings : []

    // A quiz isn't "one page with sections" — it's N steps, each its own
    // question/options/progress bar. It gets one Page per step (slug
    // step-1, step-2, ...) holding a single structured "quiz-step" block,
    // instead of collapsing everything into one page like an LP would.
    const pageCreates = result.quiz
      ? (result.quiz.steps as any[]).map((step, i) => ({
          projectId,
          name: `Etapa ${i + 1}`,
          slug: `step-${i + 1}`,
          order: step.order ?? i,
          blocks: [
            {
              id: step.id ?? `step_${i + 1}`,
              type: 'quiz-step',
              order: 0,
              question: step.question ?? null,
              subtitle: step.subtitle ?? null,
              questionType: step.questionType ?? 'single',
              progressPercent: step.progressPercent ?? Math.round(((i + 1) / result.quiz.steps.length) * 100),
              hasLeadCapture: !!step.hasLeadCapture,
              answers: Array.isArray(step.answers) ? step.answers : [],
              screenshot: step.screenshot ?? null,
              generatedHtml: step.generatedCode ?? null,
              isLastStep: i === result.quiz.steps.length - 1,
            },
          ],
        }))
      : (() => {
          const sections = Array.isArray(result.sections) ? result.sections : []
          const blocks = sections.map((s: any, i: number) => ({
            id: s.id ?? `section_${i}`,
            type: (s.type || 'custom-html').toString().toLowerCase(),
            order: s.order ?? i,
            screenshot: s.screenshot ?? null,
            generatedHtml: s.generatedCode ?? null,
            // VSL block only: the real playable source, not just a screenshot.
            ...(s.video
              ? {
                  videoUrl: s.video.url ?? null,
                  videoType: s.video.type ?? 'iframe',
                  videoDuration: s.video.duration ?? null,
                }
              : {}),
          }))
          return [{ projectId, name: 'Página 1', slug: 'home', order: 0, blocks }]
        })()

    const typeMap: Record<string, 'LP' | 'QUIZ' | 'VSL' | 'CHECKOUT' | 'FUNNEL'> = {
      lp: 'LP',
      quiz: 'QUIZ',
      vsl: 'VSL',
      checkout: 'CHECKOUT',
      funnel: 'FUNNEL',
    }
    const projectType = typeMap[(result.pageType || '').toString().toLowerCase()] ?? project.type

    await db.$transaction([
      db.page.deleteMany({ where: { projectId } }),
      ...pageCreates.map(data => db.page.create({ data })),
      db.projectTracking.deleteMany({ where: { projectId } }),
      ...(trackings.length > 0
        ? [
            db.projectTracking.createMany({
              data: trackings.map((t: any) => ({
                projectId,
                type: (trackingTypeMap[(t.type || '').toLowerCase()] ?? 'CUSTOM') as any,
                pixelId: t.id ?? null,
                config: t,
              })),
            }),
          ]
        : []),
      db.project.update({
        where: { id: projectId },
        data: { status: 'READY', type: projectType },
      }),
      ...(jobId
        ? [
            db.scanJob.update({
              where: { id: jobId },
              data: {
                status: 'DONE',
                progress: 100,
                currentStep: 'Concluído',
                resultJson: result,
              },
            }),
          ]
        : []),
    ])

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Finalize scan error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
