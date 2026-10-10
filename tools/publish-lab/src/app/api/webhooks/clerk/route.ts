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

  // Clerk's own "Delete account" button (Security tab) only deletes the
  // auth user — it has no idea our app keeps a Workspace/Project/Page tree
  // keyed by clerkUserId, so without this handler that data just sits
  // there forever, orphaned, with nobody able to log back in to manage or
  // delete it. Only cleans up a workspace when the deleted user was its
  // SOLE member — a real multi-member workspace (via Clerk Organizations)
  // should survive one member leaving; that case just drops the membership.
  if (payload.type === 'user.deleted') {
    const clerkUserId = payload.data.id as string
    const memberships = await db.workspaceMember.findMany({
      where: { clerkUserId },
      include: { workspace: { include: { members: true } } },
    })

    for (const membership of memberships) {
      if (membership.workspace.members.length > 1) continue

      const projects = await db.project.findMany({
        where: { workspaceId: membership.workspaceId },
        select: { id: true },
      })
      const projectIds = projects.map(p => p.id)
      if (projectIds.length) {
        // Lead/AiUsageLog carry a plain projectId column, not a Prisma
        // relation — they don't cascade with the Project like Page,
        // ProjectTracking and PageEvent do.
        await db.lead.deleteMany({ where: { projectId: { in: projectIds } } })
        await db.aiUsageLog.deleteMany({ where: { projectId: { in: projectIds } } })
      }
      // Cascades WorkspaceMember and Project (which cascades Page,
      // ProjectTracking, PageEvent in turn).
      await db.workspace.delete({ where: { id: membership.workspaceId } })
    }

    // Any workspace skipped above (shared, other members remain) still
    // needs this one membership row gone.
    await db.workspaceMember.deleteMany({ where: { clerkUserId } })
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
