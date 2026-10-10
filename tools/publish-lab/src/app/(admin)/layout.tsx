import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { AdminLogout } from '@/components/dashboard/admin-logout'
import { adminLoginSession } from '@/lib/admin-auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const signedIn = !!(await adminLoginSession().catch(() => null))
  return (
    <div className="min-h-screen bg-[#07050f] text-white">
      <div className="pointer-events-none fixed inset-0 z-0"><div className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-amber-500/10 blur-[130px]" /></div>
      <div className="relative z-10">
        <nav className="border-b border-white/5 bg-[#07050f]/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/admin" className="flex items-center gap-2 text-sm font-semibold text-amber-300"><ShieldCheck className="h-4 w-4" /> be-Vallid · Administração</Link>
            <div className="flex items-center gap-5">
              <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white">Painel do cliente</Link>
              {signedIn && <AdminLogout />}
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </div>
    </div>
  )
}
