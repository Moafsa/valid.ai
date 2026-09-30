import { getCurrentWorkspace } from '@/lib/auth-helper'
import { notFound } from 'next/navigation'
import { WorkspaceSettingsForm } from '@/components/dashboard/workspace-settings-form'
import { Sparkles } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const workspace = await getCurrentWorkspace()
  if (!workspace) notFound()

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-white">Configurações</h1>

      <WorkspaceSettingsForm name={workspace.name} />

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-200">Plano</h3>
        </div>
        <p className="text-sm text-gray-400">
          Plano {workspace.plan}, {workspace.aiCredits} créditos disponíveis
        </p>
      </div>
    </div>
  )
}
