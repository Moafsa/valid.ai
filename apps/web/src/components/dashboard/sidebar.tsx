'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FolderOpen,
  BarChart3,
  Users,
  Settings,
  Zap,
  Globe,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projetos', icon: FolderOpen },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/domains', label: 'Domínios', icon: Globe },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-60 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">Valid.ai</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(item => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
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
            <span className="text-xs text-brand-600">50/50</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-brand-100">
            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: '80%' }} />
          </div>
          <p className="text-xs text-brand-600 mt-2">Plano Free</p>
        </div>
      </div>
    </aside>
  )
}
