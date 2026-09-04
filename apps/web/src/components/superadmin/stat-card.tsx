const COLOR_MAP = {
  blue:   'border-blue-900 bg-blue-950/30 text-blue-400',
  purple: 'border-purple-900 bg-purple-950/30 text-purple-400',
  green:  'border-green-900 bg-green-950/30 text-green-400',
  orange: 'border-orange-900 bg-orange-950/30 text-orange-400',
} as const

interface Props {
  label: string
  value: string | number
  icon: string
  color: keyof typeof COLOR_MAP
  subtitle?: string
}

export function AdminStatCard({ label, value, icon, color, subtitle }: Props) {
  return (
    <div className={`rounded-xl border p-4 ${COLOR_MAP[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <span>{icon}</span>
        <span className="text-xs font-medium opacity-80">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subtitle && <p className="text-xs opacity-60 mt-0.5">{subtitle}</p>}
    </div>
  )
}
