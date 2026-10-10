import { NextResponse } from 'next/server'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { aiCreditsState } from '@/lib/plans'

export const dynamic = 'force-dynamic'

/** The signed-in account's AI credits this month (shown in the editor's assistant). */
export async function GET() {
  const workspace = await getCurrentWorkspace()
  if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await aiCreditsState(workspace))
}
