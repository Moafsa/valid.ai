export const dynamic = 'force-dynamic'

import { db } from '@funnelai/db'
import { UserCheck, Shield, Plus, Zap } from 'lucide-react'
import { UserRow } from '@/components/superadmin/user-row'

export default async function UsersPage() {
  const members = await db.workspaceMember.findMany({
    include: {
      workspace: {
        select: { id: true, name: true, plan: true, aiCredits: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const superAdmins = await db.superAdmin.findMany()

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Controle de Usuários</h2>
          <p className="text-gray-400 mt-1">
            {members.length} membros de workspaces e {superAdmins.length} superadministradores registrados.
          </p>
        </div>
      </div>

      {/* SuperAdmins */}
      <div className="rounded-xl border border-red-900 bg-red-950/20 p-5 space-y-3">
        <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
          <Shield className="h-4 w-4" />
          <span>Superadministradores da Plataforma</span>
        </div>
        <div className="divide-y divide-red-900/40">
          {superAdmins.map(admin => (
            <div key={admin.id} className="flex items-center justify-between py-2 text-sm text-gray-200">
              <div>
                <p className="font-semibold text-white">{admin.name}</p>
                <p className="text-xs text-gray-400 font-mono">{admin.email} — {admin.clerkUserId}</p>
              </div>
              <span className="text-xs bg-red-900/60 text-red-300 font-medium px-2.5 py-1 rounded-full">
                SuperAdmin Geral
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Workspace Members Table */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-brand-400" />
            Usuários da Plataforma (Workspaces)
          </h3>
        </div>
        {members.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Nenhum usuário registrado ainda.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left bg-gray-950">
                <th className="px-4 py-3 font-medium">Usuário (Clerk ID)</th>
                <th className="px-4 py-3 font-medium">Workspace</th>
                <th className="px-4 py-3 font-medium">Função</th>
                <th className="px-4 py-3 font-medium">Plano</th>
                <th className="px-4 py-3 font-medium">Créditos IA</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {members.map(member => (
                <UserRow key={member.id} member={member} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}