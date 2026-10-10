'use client'
import { LogOut } from 'lucide-react'

export function AdminLogout() {
  return (
    <button className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white" onClick={async () => { await fetch('/api/admin/logout', { method: 'POST' }); window.location.href = '/admin/login' }}>
      <LogOut className="h-4 w-4" /> Sair
    </button>
  )
}
