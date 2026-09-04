export const dynamic = 'force-dynamic'

import { db } from '@funnelai/db'
import { Receipt, CreditCard, DollarSign, CheckCircle2, Clock, AlertCircle } from 'lucide-react'

export default async function SubscriptionsPage() {
  const [asaasPayments, creditPurchases, workspaces] = await Promise.all([
    db.asaasPayment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.creditTransaction.findMany({
      where: { type: 'PURCHASE' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.workspace.findMany({
      select: { id: true, name: true, plan: true },
    }),
  ])

  const wsMap = Object.fromEntries(workspaces.map(w => [w.id, w]))

  const totalAsaasPaid = asaasPayments
    .filter(p => p.status === 'RECEIVED' || p.status === 'CONFIRMED')
    .reduce((acc, p) => acc + p.value, 0)

  const pendingAsaas = asaasPayments.filter(p => p.status === 'PENDING').length

  const proCount = workspaces.filter(w => w.plan === 'PRO').length
  const scaleCount = workspaces.filter(w => w.plan === 'SCALE').length

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-bold text-white">Faturas & Assinaturas</h2>
        <p className="text-gray-400 mt-1">
          Gestão financeira da plataforma: faturas do Asaas (PIX/Boleto) e pagamentos Stripe.
        </p>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-green-900 bg-green-950/30 p-4">
          <div className="flex items-center justify-between text-green-400 text-xs font-semibold">
            <span>💰 Receita Total (Asaas)</span>
            <DollarSign className="h-4 w-4" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">R$ {totalAsaasPaid.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">Faturas PIX/Boleto confirmadas</p>
        </div>

        <div className="rounded-xl border border-yellow-900 bg-yellow-950/30 p-4">
          <div className="flex items-center justify-between text-yellow-400 text-xs font-semibold">
            <span>⏳ Faturas Pendentes</span>
            <Clock className="h-4 w-4" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{pendingAsaas}</p>
          <p className="text-xs text-gray-500 mt-1">Aguardando pagamento PIX</p>
        </div>

        <div className="rounded-xl border border-blue-900 bg-blue-950/30 p-4">
          <div className="flex items-center justify-between text-blue-400 text-xs font-semibold">
            <span>⚡ Assinantes Pro</span>
            <CreditCard className="h-4 w-4" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{proCount}</p>
          <p className="text-xs text-gray-500 mt-1">Planos Pro ativos (R$197/mês)</p>
        </div>

        <div className="rounded-xl border border-purple-900 bg-purple-950/30 p-4">
          <div className="flex items-center justify-between text-purple-400 text-xs font-semibold">
            <span>🚀 Assinantes Scale</span>
            <Receipt className="h-4 w-4" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{scaleCount}</p>
          <p className="text-xs text-gray-500 mt-1">Planos Scale ativos (R$497/mês)</p>
        </div>
      </div>

      {/* Asaas Invoices Table */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Receipt className="h-4 w-4 text-green-400" />
            Faturas Asaas (PIX / Cartão / Boleto)
          </h3>
        </div>

        {asaasPayments.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Nenhuma fatura gerada no Asaas ainda. As faturas aparecerão aqui automaticamente via Webhook.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left bg-gray-950">
                <th className="px-4 py-3 font-medium">ID Fatura</th>
                <th className="px-4 py-3 font-medium">Workspace</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {asaasPayments.map(p => {
                const ws = wsMap[p.workspaceId]
                return (
                  <tr key={p.id} className="border-b border-gray-800/60 hover:bg-gray-800/40">
                    <td className="px-4 py-3 font-mono text-xs text-gray-300">{p.asaasPaymentId}</td>
                    <td className="px-4 py-3 font-medium text-white">{ws?.name ?? p.workspaceId}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{p.billingType}</td>
                    <td className="px-4 py-3 font-bold text-green-400">R$ {p.value.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        p.status === 'RECEIVED' || p.status === 'CONFIRMED'
                          ? 'bg-green-900/60 text-green-300'
                          : p.status === 'PENDING'
                          ? 'bg-yellow-900/60 text-yellow-300'
                          : 'bg-red-900/60 text-red-300'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}