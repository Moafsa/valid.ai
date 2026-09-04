import { getAuthUser } from '@/lib/auth-helper'
import { redirect } from 'next/navigation'
import { db } from '@funnelai/db'
import { SuperAdminSidebar } from '@/components/superadmin/sidebar'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await getAuthUser()
  if (!userId) redirect('/sign-in')

  // Check if this userId is a registered superadmin (fallback to first superadmin in dev mode)
  let admin = userId ? await db.superAdmin.findFirst({ where: { clerkUserId: userId } }) : null
  if (!admin) {
    admin = await db.superAdmin.findFirst()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <SuperAdminSidebar admin={admin} />
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">{children}</div>
      </div>
    </div>
  )
}
