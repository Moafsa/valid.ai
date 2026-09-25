export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth-helper'
import { db } from '@funnelai/db'
import { VisualEditor } from '@/components/editor/visual-editor'

export default async function VisualEditorPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>
}) {
  const { userId } = await getAuthUser()
  const isClerkKeyValid = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').length > 30
  if (!userId && isClerkKeyValid) redirect('/sign-in')

  const { id, pageId } = await params

  const page = await db.page.findUnique({ where: { id: pageId } })
  if (!page || page.projectId !== id) notFound()

  const blocks = Array.isArray(page.blocks) ? (page.blocks as any[]) : []

  return <VisualEditor projectId={id} pageId={pageId} blocks={blocks} />
}
