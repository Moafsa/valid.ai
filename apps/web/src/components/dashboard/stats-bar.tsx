interface StatsBarProps {
  projectCount: number
  publishedCount: number
  leadsCount: number
  aiCredits: number
  creditLimit: number
}

export function StatsBar({ projectCount, publishedCount, leadsCount, aiCredits, creditLimit }: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {[
        { label: 'Total de Projetos', value: projectCount, icon: '📁' },
        { label: 'Publicados', value: publishedCount, icon: '🌐' },
        { label: 'Leads Capturados', value: leadsCount, icon: '👥' },
        { label: 'Créditos IA', value: `${aiCredits}/${creditLimit}`, icon: '⚡' },
      ].map(stat => (
        <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <span>{stat.icon}</span>
            <span className="text-xs font-medium text-gray-500">{stat.label}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
        </div>
      ))}
    </div>
  )
}
