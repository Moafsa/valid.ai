import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { MessageSquareHeart, ScanSearch, Settings, ShieldCheck } from 'lucide-react'
import { db } from '@funnelai/db'
import { getAuthUser, getCurrentWorkspace } from '@/lib/auth-helper'
import { isAdminUser } from '@/lib/admin'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // a dot when the administrator has answered something the user has not read yet; the admin entry only for the administrator
  // (the workspace first: a brand-new account is set up there, and that is also where an administrator is recognised)
  const workspace = await getCurrentWorkspace().catch(() => null)
  const { userId } = await getAuthUser()
  const [admin, unread] = await Promise.all([
    isAdminUser(userId),
    workspace ? db.feedback.count({ where: { workspaceId: workspace.id, userRead: false } }).catch(() => 0) : 0,
  ])
  const link = 'flex items-center gap-1.5 text-sm font-medium text-gray-400 transition-colors hover:text-white'
  return (
    <div className="min-h-screen bg-[#07050f] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-blue-600/10 blur-[120px]" />
      </div>

      <div className="relative z-10">
        <nav className="sticky top-0 z-20 border-b border-white/5 bg-[#07050f]/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="be-Vallid" className="h-8 w-auto" />
            </Link>
            <div className="flex items-center gap-5">
              <Link href="/cloaker" className={link}><ScanSearch className="h-4 w-4" /><span className="hidden sm:inline">Detector de cloaker</span></Link>
              <Link href="/feedback" className={`${link} relative`}>
                <MessageSquareHeart className="h-4 w-4" /><span className="hidden sm:inline">Feedback</span>
                {unread > 0 && <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-bold text-white">{unread}</span>}
              </Link>
              {admin && <Link href="/admin" className="flex items-center gap-1.5 text-sm font-semibold text-amber-300 transition-colors hover:text-amber-200"><ShieldCheck className="h-4 w-4" /><span className="hidden sm:inline">Admin</span></Link>}
              <Link href="/settings" className={link}><Settings className="h-4 w-4" /><span className="hidden sm:inline">Configurações</span></Link>
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </nav>

        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </div>
    </div>
  )
}
