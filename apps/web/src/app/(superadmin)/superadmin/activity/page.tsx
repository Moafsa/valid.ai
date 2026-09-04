export const dynamic = 'force-dynamic'

import { db } from '@funnelai/db'
import { RecentActivity } from '@/components/superadmin/recent-activity'

export default async function ActivityPage() {
  const logs = await db.aiUsageLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-white">Registro de Atividades</h2>
        <p className="text-gray-400 mt-1">Histórico completo de uso da IA, tokens e chamadas de API</p>
      </div>

      <RecentActivity logs={logs} />
    </div>
  )
}