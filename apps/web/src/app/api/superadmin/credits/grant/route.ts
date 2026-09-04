import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'

export async function POST(req: NextRequest) {
  const { userId } = await getAuthUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isClerkKeyValid = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').length > 30
  let admin = isClerkKeyValid ? await db.superAdmin.findFirst({ where: { clerkUserId: userId } }) : null
  if (!admin && !isClerkKeyValid) {
    admin = await db.superAdmin.findFirst()
  }
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { workspaceId, amount } = await req.json()

  const workspace = await db.workspace.update({
    where: { id: workspaceId },
    data: { aiCredits: { increment: amount } },
  })

  await db.creditTransaction.create({
    data: {
      workspaceId,
      type: 'GRANT',
      amount,
      balanceAfter: workspace.aiCredits,
      description: `Créditos adicionados pelo superadmin (${admin.email})`,
    },
  })

  return NextResponse.json({ success: true, newBalance: workspace.aiCredits })
}
