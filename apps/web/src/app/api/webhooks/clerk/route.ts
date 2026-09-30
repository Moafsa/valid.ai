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

  // Plain user signup (no Clerk Organizations involved — that feature was
  // never actually turned on in this app) is what fires for every real
  // signup, so a personal workspace is provisioned right here rather than
  // relying on organization.created, which only fires if/when Organizations
  // gets enabled later.
  if (payload.type === 'user.created') {
    const user = payload.data
    const email = user.email_addresses?.[0]?.email_address ?? null
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || email || 'Minha Workspace'
    const workspace = await db.workspace.create({
      data: {
        clerkOrgId: `user:${user.id}`,
        name,
        slug: user.id,
        plan: 'FREE',
        aiCredits: 50,
      },
    })
    await db.workspaceMember.create({
      data: { workspaceId: workspace.id, clerkUserId: user.id, role: 'OWNER' },
    })
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
