import { Users, TrendingUp, UserCheck, Activity } from 'lucide-react'
import { ProjectHeader } from '@/components/project/project-header'

interface FunnelStep {
  event: string
  step?: string
  label: string
  sessions: number
  widthPercent: number
  dropoffPercent: number
}

interface Stats {
  totalSessions: number
  leadsCaptured: number
  conversionRate: number
}

/**
 * Real retention/funnel analytics, built from the same Lead.timeline data
 * sdk.js writes on every published page (see /api/track). This used to be
 * MOCK_FUNNEL — six hardcoded rows (1000 visitors → 42 conversions) that
 * never changed no matter what actually happened on the funnel.
 */
export function AnalyticsDetail({
  project,
  stats,
  funnel,
}: {
  project: any
  stats: Stats
  funnel: FunnelStep[]
}) {
  return (
    <div className="space-y-6">
      <ProjectHeader project={project} />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { label: 'Sessões', value: stats.totalSessions.toLocaleString('pt-BR'), icon: Users },
          { label: 'Leads capturados', value: stats.leadsCaptured.toLocaleString('pt-BR'), icon: UserCheck },
          { label: 'Taxa de conversão', value: `${stats.conversionRate.toFixed(1).replace('.', ',')}%`, icon: TrendingUp },
        ].map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <Icon className="h-4 w-4 text-gray-400 mb-2" />
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          )
        })}
      </div>

      {/* Retention / funnel chart */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 mb-1">Retenção por etapa</h3>
        <p className="text-xs text-gray-400 mb-6">
          Onde as pessoas realmente abandonam — calculado a partir dos eventos capturados na página publicada.
        </p>

        {funnel.length === 0 ? (
          <div className="text-center py-10">
            <Activity className="h-8 w-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Ainda não há eventos registrados para este projeto.</p>
            <p className="text-xs text-gray-400 mt-1">
              Publique o funil e receba visitas reais — o gráfico aparece assim que os primeiros eventos chegarem.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {funnel.map((step, i) => (
              <div key={`${step.event}-${step.step ?? ''}`} className="flex items-center gap-4">
                <div className="w-44 text-sm text-gray-600 text-right flex-shrink-0">{step.label}</div>
                <div className="flex-1 h-10 bg-gray-100 rounded-lg overflow-hidden relative">
                  <div
                    className="h-full bg-brand-500 rounded-lg flex items-center px-3 transition-all duration-700"
                    style={{ width: `${Math.max(step.widthPercent, 4)}%` }}
                  >
                    <span className="text-white text-xs font-semibold">{step.sessions.toLocaleString('pt-BR')}</span>
                  </div>
                </div>
                <div className="w-16 text-right text-xs font-medium flex-shrink-0">
                  {i === 0 ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    <span className={step.dropoffPercent > 0 ? 'text-red-500' : 'text-gray-300'}>
                      {step.dropoffPercent > 0 ? `-${step.dropoffPercent.toFixed(1)}%` : '—'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
