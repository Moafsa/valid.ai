import { CloakerTool } from '@/components/dashboard/cloaker-tool'
import { PlanUpsell } from '@/components/dashboard/plan-upsell'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { featureGate } from '@/lib/plans'

export const dynamic = 'force-dynamic'

export default async function CloakerPage() {
  const workspace = await getCurrentWorkspace()
  const allowed = workspace ? await featureGate(workspace, 'cloaker') : { ok: true as const }
  if (!allowed.ok) return <PlanUpsell title="Identificação de cloaker" message={allowed.message} />
  return <CloakerTool />
}
