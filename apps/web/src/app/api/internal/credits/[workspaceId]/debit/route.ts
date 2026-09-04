import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const token = req.headers.get('x-internal-token')
  if (token !== process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { operation, amount, description, project_id, model, cost_usd, input_tokens, output_tokens } = body

  // Check balance first
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { aiCredits: true },
  })
  if (!workspace || workspace.aiCredits < amount) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }

  // Debit credits
  const updated = await db.workspace.update({
    where: { id: workspaceId },
    data: { aiCredits: { decrement: amount } },
  })

  // Log transaction
  await db.creditTransaction.create({
    data: {
      workspaceId,
      type: 'CONSUME',
      amount: -amount,
      balanceAfter: updated.aiCredits,
      description,
      operation,
    },
  })

  // Log AI usage cost
  if (model) {
    const provider = model.startsWith('gpt') || model.startsWith('whisper') ? 'openai'
      : model.startsWith('claude') ? 'anthropic'
      : model.startsWith('gemini') ? 'google' : 'other'

    await db.aiUsageLog.create({
      data: {
        workspaceId,
        projectId: project_id ?? null,
        operation,
        model,
        provider,
        inputTokens: input_tokens ?? 0,
        outputTokens: output_tokens ?? 0,
        costUsd: cost_usd ?? 0,
        creditsUsed: amount,
      },
    })
  }

  return NextResponse.json({ success: true, balance_after: updated.aiCredits })
}
