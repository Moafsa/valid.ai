import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { event, payment } = body

    // Eventos de confirmação de pagamento PIX, Boleto ou Cartão
    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
      const asaasPaymentId = payment.id
      const paymentRecord = await db.asaasPayment.findUnique({
        where: { asaasPaymentId },
      })

      if (paymentRecord) {
        // Atualiza status do pagamento
        await db.asaasPayment.update({
          where: { asaasPaymentId },
          data: { status: 'RECEIVED' },
        })

        // Determina o plano ou pacote de créditos baseado no valor
        let plan: 'FREE' | 'PRO' | 'SCALE' = 'PRO'
        let creditsToGrant = 500

        if (payment.value >= 497) {
          plan = 'SCALE'
          creditsToGrant = 3000
        } else if (payment.value >= 197) {
          plan = 'PRO'
          creditsToGrant = 500
        }

        // Atualiza o workspace e adiciona créditos de IA
        const workspace = await db.workspace.update({
          where: { id: paymentRecord.workspaceId },
          data: {
            plan,
            aiCredits: { increment: creditsToGrant },
          },
        })

        // Log da transação
        await db.creditTransaction.create({
          data: {
            workspaceId: workspace.id,
            type: 'PURCHASE',
            amount: creditsToGrant,
            balanceAfter: workspace.aiCredits,
            description: `Pagamento Asaas (${payment.billingType}) — Plano ${plan}`,
          },
        })

        console.log(`✅ Pagamento Asaas confirmado para workspace ${workspace.id}`)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Asaas webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
