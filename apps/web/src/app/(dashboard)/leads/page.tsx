export const dynamic = 'force-dynamic'

import { db } from '@funnelai/db'
import Link from 'next/link'
import { Users } from 'lucide-react'

export default async function LeadsPage() {
  const projects = await db.project.findMany({
    where: { status: { in: ['READY', 'PUBLISHED'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, type: true },
  })

  const totalLeads = await db.lead.count()
  const recentLeads = await db.lead.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">{totalLeads} leads capturados no total</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          ⬇ Exportar CSV
        </button>
      </div>

      {/* Project selector */}
      <div className="flex gap-3 flex-wrap">
        <Link href="/leads" className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium">
          Todos os projetos
        </Link>
        {projects.map(p => (
          <Link key={p.id} href={`/leads/${p.id}`}
            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
          >
            {p.name}
          </Link>
        ))}
      </div>

      {/* Leads table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {recentLeads.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Users className="h-10 w-10 text-gray-200 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-600">Nenhum lead ainda</h3>
            <p className="text-sm text-gray-400 mt-1">Leads capturados via formulários e quizzes aparecerão aqui</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Lead</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Dispositivo</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">País</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Capturado em</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {recentLeads.map(lead => (
                <tr key={lead.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{lead.name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{lead.email ?? lead.phone ?? '—'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{lead.device ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{lead.country ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/leads/detail/${lead.id}`}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Ver timeline →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
