'use client'

import { useState } from 'react'
import { Sidebar } from './sidebar'
import { TopBar } from './topbar'

interface WorkspaceCredits {
  aiCredits: number
  plan: string
}

export function DashboardShell({
  children,
  workspace,
}: {
  children: React.ReactNode
  workspace: WorkspaceCredits
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} workspace={workspace} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
