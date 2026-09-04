export const dynamic = 'force-dynamic'

import { db } from '@funnelai/db'
import Link from 'next/link'
import { BarChart3, TrendingUp, Users, MousePointer } from 'lucide-react'

export default async function AnalyticsPage() {
  const projects = await db.project.findMany({
    where: { status: { in: ['READY', 'PUBLISHED'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, type: true, status: true, createdAt: true },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Selecione um projeto para ver os dados detalhados</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Projetos ativos', value: projects.length, icon: BarChart3, color: 'text-brand-600 bg-brand-50' },
          { label: 'Sessões totais', value: '—', icon: Users, color: 'text-green-600 bg-green-50' },
          { label: 'Taxa de conversão', value: '—', icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
          { label: 'Cliques em CTA', value: '—', icon: MousePointer, color: 'text-orange-600 bg-orange-50' },
        ].map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className={`inline-flex rounded-lg p-2 mb-3 ${stat.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Projetos com Analytics</h2>
        </div>
        {projects.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <BarChart3 className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nenhum projeto ativo ainda</p>
            <p className="text-sm text-gray-400 mt-1">Analytics aparecerão após publicar seu primeiro funil</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {projects.map(project => (
              <Link key={project.id} href={`/analytics/${project.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{project.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{project.type}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-gray-500">0 sessões</p>
                  <p className="text-xs text-gray-400">0% conversão</p>
                </div>
                <div className="text-brand-500 text-sm">→</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
