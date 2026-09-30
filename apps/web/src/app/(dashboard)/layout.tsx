import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { Zap, Settings } from 'lucide-react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-blue-500 shadow-lg shadow-violet-600/30">
                <Zap className="h-5 w-5 text-white" fill="currentColor" strokeWidth={0} />
              </div>
              <span className="text-xl font-extrabold tracking-tight text-white">be-Vallid</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/settings"
                className="flex items-center gap-1.5 text-sm font-medium text-gray-400 transition-colors hover:text-white"
              >
                <Settings className="h-4 w-4" />
                Configurações
              </Link>
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </nav>

        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </div>
    </div>
  )
}
