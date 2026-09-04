export const dynamic = 'force-dynamic'

import { getAuthUser } from '@/lib/auth-helper'
import { db } from '@funnelai/db'
import { BillingSection } from '@/components/settings/billing-section'
import { ProfileSection } from '@/components/settings/profile-section'
import { TrackingSection } from '@/components/settings/tracking-section'

export default async function SettingsPage() {
  const { userId } = await getAuthUser()
  const workspace = await db.workspace.findFirst({
    where: { plan: { in: ['FREE', 'PRO', 'SCALE'] } },
  })

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie sua conta, plano e configurações de rastreamento</p>
      </div>

      <ProfileSection user={null} />
      <BillingSection workspace={workspace} />
      <TrackingSection />
    </div>
  )
}
