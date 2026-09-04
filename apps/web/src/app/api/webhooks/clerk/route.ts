import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { db } from '@funnelai/db'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const svixId = req.headers.get('svix-id') ?? ''
  const svixTimestamp = req.headers.get('svix-timestamp') ?? ''
  const svixSignature = req.headers.get('svix-signature') ?? ''

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET ?? '')
  let payload: any
  try {
    payload = wh.verify(body, { 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': svixSignature })
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (payload.type === 'organization.created') {
    const org = payload.data
    const slug = org.slug ?? org.id.slice(0, 20)
    await db.workspace.upsert({
      where: { clerkOrgId: org.id },
      update: {},
      create: {
        clerkOrgId: org.id,
        name: org.name,
        slug,
        plan: 'FREE',
        aiCredits: 50,
      },
    })
  }

  if (payload.type === 'organizationMembership.created') {
    const m = payload.data
    const workspace = await db.workspace.findUnique({ where: { clerkOrgId: m.organization.id } })
    if (workspace) {
      await db.workspaceMember.upsert({
        where: { workspaceId_clerkUserId: { workspaceId: workspace.id, clerkUserId: m.public_user_data.user_id } },
        update: {},
        create: {
          workspaceId: workspace.id,
          clerkUserId: m.public_user_data.user_id,
          role: m.role === 'org:admin' ? 'ADMIN' : 'MEMBER',
        },
      })
    }
  }

  return NextResponse.json({ received: true })
}
