import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { z } from 'zod'

/**
 * Public ingestion endpoint (no auth — see middleware.ts) called by the
 * PageTracker beacon on every cloned page. "view" feeds the visitor count,
 * "lead" also writes a Lead row so the owner can see the actual submitted
 * fields, not just a count.
 */
const schema = z.object({
  projectId: z.string(),
  pageId: z.string().optional(),
  type: z.enum(['view', 'lead']),
  path: z.string().nullable().optional(),
  referrer: z.string().nullable().optional(),
  formData: z.record(z.string(), z.string()).optional(),
})

const EMAIL_KEYS = ['email', 'e-mail', 'seu-email', 'seu_email']
const PHONE_KEYS = ['phone', 'telefone', 'celular', 'whatsapp', 'tel']
const NAME_KEYS = ['name', 'nome', 'seu-nome', 'seu_nome', 'fullname']

function pick(formData: Record<string, string>, keys: string[]): string | undefined {
  const lower = Object.fromEntries(Object.entries(formData).map(([k, v]) => [k.toLowerCase(), v]))
  for (const key of keys) {
    if (lower[key]) return lower[key]
  }
  return undefined
}

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json())

    const project = await db.project.findUnique({ where: { id: body.projectId } })
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await db.pageEvent.create({
      data: {
        projectId: body.projectId,
        pageId: body.pageId,
        type: body.type,
        path: body.path ?? undefined,
        referrer: body.referrer ?? undefined,
      },
    })

    if (body.type === 'lead' && body.formData) {
      await db.lead.create({
        data: {
          projectId: body.projectId,
          email: pick(body.formData, EMAIL_KEYS),
          phone: pick(body.formData, PHONE_KEYS),
          name: pick(body.formData, NAME_KEYS),
          quizAnswers: body.formData,
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 })
    }
    console.error('Track error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
