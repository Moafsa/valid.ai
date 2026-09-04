import { getAuthUser } from '@/lib/auth-helper'
import { NextResponse } from 'next/server'
import { db } from '@funnelai/db'

export async function GET() {
  const { userId } = await getAuthUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await db.workspace.findFirst({
    select: { aiCredits: true, plan: true },
  })

  return NextResponse.json({
    balance: workspace?.aiCredits ?? 0,
    plan: workspace?.plan ?? 'FREE',
  })
}
