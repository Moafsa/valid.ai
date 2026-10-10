import { NextResponse } from 'next/server'
import { db } from '@funnelai/db'

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({
      status: 'healthy',
      service: 'funnelai-web',
      timestamp: new Date().toISOString(),
      database: 'connected',
    })
  } catch (e: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        service: 'funnelai-web',
        timestamp: new Date().toISOString(),
        error: e.message,
      },
      { status: 500 }
    )
  }
}