'use client'
import { useState } from 'react'
import { BarChart3, Users, TrendingDown, Clock } from 'lucide-react'
import { ProjectHeader } from '@/components/project/project-header'

const MOCK_FUNNEL = [
  { step: 'hero', label: 'Visitantes', sessions: 1000, dropoff: 0 },
  { step: 'benefits', label: 'Benefícios', sessions: 780, dropoff: 22 },
  { step: 'vsl', label: 'VSL', sessions: 520, dropoff: 33.3 },
  { step: 'offer', label: 'Oferta', sessions: 340, dropoff: 34.6 },
  { step: 'checkout', label: 'Checkout', sessions: 95, dropoff: 72.1 },
  { step: 'conversion', label: 'Converteu', sessions: 42, dropoff: 55.8 },
]

export function AnalyticsDetail({ project }: { project: any }) {
  const [period, setPeriod] = useState('7d')

  return (
    <div className="space-y-6">
      <ProjectHeader project={project} />

      {/* Period selector */}
      <div className="flex items-center gap-2">
        {['1d', '7d', '30d', '90d'].map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === p ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p === '1d' ? 'Hoje' : p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Sessões', value: '1.000', icon: Users, delta: '+12%' },
          { label: 'Taxa de conversão', value: '4,2%', icon: TrendingDown, delta: '-0.8%' },
          { label: 'Tempo médio', value: '3m 42s', icon: Clock, delta: '+18s' },
          { label: 'Leads capturados', value: '87', icon: BarChart3, delta: '+5%' },
        ].map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <Icon className="h-4 w-4 text-gray-400" />
                <span className={`text-xs font-medium ${stat.delta.startsWith('+') ? 'text-green-600' : 'text-red-500'}`}>
                  {stat.delta}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          )
        })}
      </div>

      {/* Funnel chart */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 mb-6">Funil de Conversão</h3>
        <div className="space-y-3">
          {MOCK_FUNNEL.map((step, i) => {
            const width = (step.sessions / MOCK_FUNNEL[0].sessions) * 100
            return (
              <div key={step.step} className="flex items-center gap-4">
                <div className="w-28 text-sm text-gray-600 text-right">{step.label}</div>
                <div className="flex-1 h-10 bg-gray-100 rounded-lg overflow-hidden relative">
                  <div
                    className="h-full bg-brand-500 rounded-lg flex items-center px-3 transition-all duration-700"
                    style={{ width: `${width}%` }}
                  >
                    <span className="text-white text-xs font-semibold">{step.sessions.toLocaleString()}</span>
                  </div>
                </div>
                {i > 0 && (
                  <div className="w-16 text-right text-xs text-red-500 font-medium">
                    -{step.dropoff.toFixed(1)}%
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-gray-400 mt-4 text-center">
          📊 Dados reais aparecerão após publicar o funil com o tracking SDK instalado
        </p>
      </div>
    </div>
  )
}
