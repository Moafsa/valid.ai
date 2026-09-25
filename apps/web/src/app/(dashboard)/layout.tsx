export const dynamic = 'force-dynamic'

import { getAuthUser } from '@/lib/auth-helper'
import { redirect } from 'next/navigation'
import { db } from '@funnelai/db'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await getAuthUser()
  const isClerkKeyValid = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').length > 30
  if (!userId && isClerkKeyValid) redirect('/sign-in')

  // TODO: scope by workspace (same as dashboard/projects pages)
  const workspace = await db.workspace.findFirst({ select: { aiCredits: true, plan: true } })

  return (
    <DashboardShell workspace={{ aiCredits: workspace?.aiCredits ?? 0, plan: workspace?.plan ?? 'FREE' }}>
      {children}
    </DashboardShell>
  )
}
