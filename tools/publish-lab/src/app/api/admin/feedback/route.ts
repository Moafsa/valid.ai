import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { currentAdmin } from '@/lib/admin'

const schema = z.object({ id: z.string(), status: z.enum(['open', 'seen', 'answered', 'done']).optional(), reply: z.string().max(4000).optional() })

/** The administrator answers a message and/or changes its status. */
export async function POST(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const b = schema.parse(await req.json())
    const reply = b.reply?.trim()
    await db.feedback.update({
      where: { id: b.id },
      data: { ...(b.status ? { status: b.status } : {}), ...(reply ? { reply, repliedAt: new Date(), userRead: false, status: b.status ?? 'answered' } : {}) },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }
}
