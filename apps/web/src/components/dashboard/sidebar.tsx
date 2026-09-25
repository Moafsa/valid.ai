'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { creditLimitForPlan } from '@/lib/credits'
import {
  LayoutDashboard,
  FolderOpen,
  BarChart3,
  Users,
  Settings,
  Zap,
  Globe,
  X,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projetos', icon: FolderOpen },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/domains', label: 'Domínios', icon: Globe },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

interface SidebarProps {
  mobileOpen?: boolean
  onClose?: () => void
  workspace: { aiCredits: number; plan: string }
}

const PLAN_LABELS: Record<string, string> = {
  FREE: 'Plano Free',
  BASIC: 'Plano Basic',
  PRO: 'Plano Pro',
  SCALE: 'Plano Scale',
}

export function Sidebar({ mobileOpen = false, onClose, workspace }: SidebarProps) {
  const pathname = usePathname()
  const creditLimit = creditLimitForPlan(workspace.plan)
  const creditPercent = creditLimit > 0 ? Math.max(0, Math.min(100, (workspace.aiCredits / creditLimit) * 100)) : 0

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-full w-60 flex-col border-r border-gray-200 bg-white transition-transform duration-200 ease-in-out',
          'md:static md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900">Valid.ai</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 md:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <Icon className={cn('h-4 w-4', isActive ? 'text-brand-600' : 'text-gray-400')} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Credits */}
        <div className="border-t border-gray-100 p-4">
          <div className="rounded-lg bg-brand-50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-brand-700">Créditos IA</span>
              <span className="text-xs text-brand-600">{workspace.aiCredits}/{creditLimit}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-brand-100">
              <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${creditPercent}%` }} />
            </div>
            <p className="text-xs text-brand-600 mt-2">{PLAN_LABELS[workspace.plan] ?? workspace.plan}</p>
          </div>
        </div>
      </aside>
    </>
  )
}
