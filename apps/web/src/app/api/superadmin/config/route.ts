import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { db, setConfig } from '@funnelai/db'

async function isSuperAdmin(userId: string): Promise<boolean> {
  const isClerkKeyValid = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').length > 30
  if (!isClerkKeyValid) return true // Allow dev mode superadmin configuration
  const admin = await db.superAdmin.findFirst({ where: { clerkUserId: userId } })
  return !!admin
}

export async function POST(req: NextRequest) {
  const { userId } = await getAuthUser()
  if (!userId || !(await isSuperAdmin(userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { configs } = await req.json()
  
  for (const config of configs) {
    await setConfig(
      config.key,
      config.value,
      { label: config.label, category: config.category, isSecret: config.isSecret },
      userId
    )
  }

  // Invalida cache das credenciais no scanner service
  await fetch(`${process.env.SCANNER_SERVICE_URL}/api/scanner/invalidate-cache`, {
    method: 'POST',
    headers: { 'X-Internal-Token': process.env.INTERNAL_API_TOKEN ?? '' },
  }).catch(() => null)

  return NextResponse.json({ success: true, count: configs.length })
}
