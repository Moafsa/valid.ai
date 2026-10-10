import { NextRequest, NextResponse } from 'next/server'
import { ownedProject, testEvents } from '@/lib/pixels-server'

export const dynamic = 'force-dynamic'

/** What the test run of the published page has sent in the last minutes (the Pixels tab polls it while the person tries the page). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const o = await ownedProject(id)
  if (!o) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ events: await testEvents(id) }, { headers: { 'cache-control': 'no-store' } })
}
