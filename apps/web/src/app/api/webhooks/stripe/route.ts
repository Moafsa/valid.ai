import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { db } from '@funnelai/db'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = sub.customer as string
      const priceId = sub.items.data[0]?.price.id
      
      // Map price ID to plan
      const planMap: Record<string, string> = {
        [process.env.STRIPE_PRO_PRICE_ID ?? '']: 'PRO',
        [process.env.STRIPE_SCALE_PRICE_ID ?? '']: 'SCALE',
      }
      const plan = planMap[priceId ?? ''] ?? 'FREE'
      const creditsByPlan: Record<string, number> = { FREE: 50, PRO: 500, SCALE: 3000 }

      // Find workspace by stripe customer id (stored in metadata)
      const workspaceId = sub.metadata?.workspaceId
      if (workspaceId) {
        await db.workspace.update({
          where: { id: workspaceId },
          data: {
            plan: plan as any,
            aiCredits: creditsByPlan[plan] ?? 50,
          },
        })
        await db.creditTransaction.create({
          data: {
            workspaceId,
            type: 'GRANT',
            amount: creditsByPlan[plan] ?? 50,
            balanceAfter: creditsByPlan[plan] ?? 50,
            description: `Renovação de plano ${plan}`,
            stripePaymentId: event.id,
          },
        })
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const workspaceId = sub.metadata?.workspaceId
      if (workspaceId) {
        await db.workspace.update({
          where: { id: workspaceId },
          data: { plan: 'FREE', aiCredits: 50 },
        })
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
