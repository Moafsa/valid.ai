'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Settings, Users, UserCheck, Receipt, DollarSign, Activity, Shield, ArrowLeft } from 'lucide-react'

const items = [
  { href: '/superadmin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/superadmin/config', label: 'Credenciais & Config', icon: Settings },
  { href: '/superadmin/users', label: 'Controle de Usuários', icon: UserCheck },
  { href: '/superadmin/subscriptions', label: 'Faturas & Assinaturas', icon: Receipt },
  { href: '/superadmin/workspaces', label: 'Workspaces', icon: Users },
  { href: '/superadmin/costs', label: 'Custos de IA', icon: DollarSign },
  { href: '/superadmin/activity', label: 'Atividade', icon: Activity },
]

export function SuperAdminSidebar({ admin }: { admin: any }) {
  const pathname = usePathname()
  return (
    <aside className="flex h-full w-64 flex-col border-r border-gray-800 bg-gray-950">
      <div className="flex h-16 items-center gap-3 px-5 border-b border-gray-800">
        <div className="h-8 w-8 rounded-lg bg-red-600 flex items-center justify-center">
          <Shield className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">SuperAdmin</p>
          <p className="text-xs text-gray-500">Valid.ai Platform</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map(item => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-red-950 text-red-400' : 'text-gray-400 hover:bg-gray-900 hover:text-white'
              )}
            >
              <Icon className={cn('h-4 w-4', active ? 'text-red-400' : 'text-gray-500')} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-gray-800 p-4">
        <Link href="/dashboard"
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300"
        >
          <ArrowLeft className="h-3 w-3" />
          Voltar ao Dashboard
        </Link>
        <p className="text-xs text-gray-600 mt-2 truncate">{admin?.email ?? 'admin@funnelai.com'}</p>
      </div>
    </aside>
  )
}
