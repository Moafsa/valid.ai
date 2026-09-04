export const dynamic = 'force-dynamic'

import { db } from '@funnelai/db'
import { CostChart } from '@/components/superadmin/cost-chart'

export default async function CostsPage() {
  const logs = await db.aiUsageLog.groupBy({
    by: ['model', 'provider'],
    _sum: { costUsd: true, creditsUsed: true, inputTokens: true, outputTokens: true },
    _count: { id: true },
    orderBy: { _sum: { costUsd: 'desc' } },
  })

  const byOperation = await db.aiUsageLog.groupBy({
    by: ['operation'],
    _sum: { costUsd: true, creditsUsed: true },
    _count: { id: true },
    orderBy: { _sum: { costUsd: 'desc' } },
  })

  const total = logs.reduce((acc, l) => acc + (l._sum.costUsd ?? 0), 0)
  const totalCredits = logs.reduce((acc, l) => acc + (l._sum.creditsUsed ?? 0), 0)
  const margin = totalCredits > 0 ? ((totalCredits * 0.10 - total) / (totalCredits * 0.10)) * 100 : 0

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-white">Custos de IA</h2>
        <p className="text-gray-400 mt-1">Custo real vs. créditos cobrados dos usuários</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-red-900 bg-red-950/30 p-4">
          <p className="text-xs text-red-400 font-medium">💸 Custo Real (tokens)</p>
          <p className="text-2xl font-bold text-white mt-1">${total.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-0.5">pago aos providers de IA</p>
        </div>
        <div className="rounded-xl border border-green-900 bg-green-950/30 p-4">
          <p className="text-xs text-green-400 font-medium">💰 Receita (créditos)</p>
          <p className="text-2xl font-bold text-white mt-1">R$ {(totalCredits * 0.10).toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-0.5">{totalCredits} créditos @ R$0.10</p>
        </div>
        <div className="rounded-xl border border-blue-900 bg-blue-950/30 p-4">
          <p className="text-xs text-blue-400 font-medium">📈 Margem</p>
          <p className="text-2xl font-bold text-white mt-1">{margin.toFixed(1)}%</p>
          <p className="text-xs text-gray-500 mt-0.5">sobre custo de IA</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h3 className="text-white font-semibold mb-4">Por Modelo</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="pb-3 text-left text-gray-400">Modelo</th>
              <th className="pb-3 text-left text-gray-400">Provider</th>
              <th className="pb-3 text-right text-gray-400">Requisições</th>
              <th className="pb-3 text-right text-gray-400">Tokens (in/out)</th>
              <th className="pb-3 text-right text-gray-400">Custo USD</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr key={i} className="border-b border-gray-800/50">
                <td className="py-3 text-white font-mono text-xs">{log.model}</td>
                <td className="py-3 text-gray-400">{log.provider}</td>
                <td className="py-3 text-right text-gray-300">{log._count.id}</td>
                <td className="py-3 text-right text-gray-300 font-mono text-xs">
                  {(log._sum.inputTokens ?? 0).toLocaleString()} / {(log._sum.outputTokens ?? 0).toLocaleString()}
                </td>
                <td className="py-3 text-right text-orange-400 font-mono">
                  ${(log._sum.costUsd ?? 0).toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h3 className="text-white font-semibold mb-4">Por Operação</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="pb-3 text-left text-gray-400">Operação</th>
              <th className="pb-3 text-right text-gray-400">Usos</th>
              <th className="pb-3 text-right text-gray-400">Créditos cobrados</th>
              <th className="pb-3 text-right text-gray-400">Custo real</th>
              <th className="pb-3 text-right text-gray-400">Margem</th>
            </tr>
          </thead>
          <tbody>
            {byOperation.map((op, i) => {
              const cost = op._sum.costUsd ?? 0
              const revenue = (op._sum.creditsUsed ?? 0) * 0.10
              const opMargin = revenue > 0 ? ((revenue - cost) / revenue * 100) : 0
              return (
                <tr key={i} className="border-b border-gray-800/50">
                  <td className="py-3 text-white font-mono text-xs">{op.operation}</td>
                  <td className="py-3 text-right text-gray-300">{op._count.id}</td>
                  <td className="py-3 text-right text-green-400">{op._sum.creditsUsed ?? 0}</td>
                  <td className="py-3 text-right text-orange-400 font-mono">${cost.toFixed(4)}</td>
                  <td className={`py-3 text-right font-semibold ${opMargin > 60 ? 'text-green-400' : opMargin > 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {opMargin.toFixed(0)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
