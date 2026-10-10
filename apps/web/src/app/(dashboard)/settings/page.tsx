import { getCurrentWorkspace } from '@/lib/auth-helper'
import { notFound } from 'next/navigation'
import { WorkspaceSettingsForm } from '@/components/dashboard/workspace-settings-form'
import { PlanCard } from '@/components/dashboard/plan-card'
import { entitlementsOf, publicPlans, usageOf } from '@/lib/plans'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const workspace = await getCurrentWorkspace()
  if (!workspace) notFound()
  const [ent, usage, plans] = await Promise.all([entitlementsOf(workspace), usageOf(workspace.id), publicPlans()])

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-white">Configurações</h1>

      <WorkspaceSettingsForm name={workspace.name} />

      <PlanCard ent={ent} usage={usage} credits={workspace.bonusCredits} until={workspace.planUntil} plans={plans} />
    </div>
  )
}
