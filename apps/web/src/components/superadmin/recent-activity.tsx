import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const PROVIDER_BADGE: Record<string, string> = {
  openai:    'bg-emerald-900/50 text-emerald-400',
  anthropic: 'bg-orange-900/50 text-orange-400',
  google:    'bg-blue-900/50 text-blue-400',
}

export function RecentActivity({ logs }: { logs: any[] }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800">
        <h3 className="font-semibold text-white">Atividade Recente de IA</h3>
      </div>
      <div className="divide-y divide-gray-800">
        {logs.length === 0 && (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">
            Nenhuma operação de IA registrada ainda
          </div>
        )}
        {logs.map(log => (
          <div key={log.id} className="flex items-center gap-4 px-6 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-200 font-mono">{log.operation}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${PROVIDER_BADGE[log.provider] ?? 'bg-gray-800 text-gray-400'}`}>
                  {log.model}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                workspace: {log.workspaceId.slice(0, 8)}...
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono text-orange-400">${log.costUsd.toFixed(4)}</p>
              <p className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: ptBR })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
