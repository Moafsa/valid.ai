import { getAuthUser } from '@/lib/auth-helper'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { TopBar } from '@/components/dashboard/topbar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await getAuthUser()
  const isClerkKeyValid = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').length > 30
  if (!userId && isClerkKeyValid) redirect('/sign-in')

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
