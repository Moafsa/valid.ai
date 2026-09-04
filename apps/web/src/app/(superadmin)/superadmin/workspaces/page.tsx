export const dynamic = 'force-dynamic'

import { db } from '@funnelai/db'
import { WorkspaceRow } from '@/components/superadmin/workspace-row'

export default async function WorkspacesPage() {
  const workspaces = await db.workspace.findMany({
    include: {
      _count: { select: { projects: true, members: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Workspaces</h2>
        <p className="text-gray-400 mt-1">{workspaces.length} workspaces ativos na plataforma</p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-4 py-3 text-left text-gray-400 font-medium">Workspace</th>
              <th className="px-4 py-3 text-left text-gray-400 font-medium">Plano</th>
              <th className="px-4 py-3 text-left text-gray-400 font-medium">Créditos</th>
              <th className="px-4 py-3 text-left text-gray-400 font-medium">Projetos</th>
              <th className="px-4 py-3 text-left text-gray-400 font-medium">Membros</th>
              <th className="px-4 py-3 text-left text-gray-400 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map(ws => (
              <WorkspaceRow key={ws.id} workspace={ws} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
