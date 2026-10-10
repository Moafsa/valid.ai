import { notFound, redirect } from 'next/navigation'
import { currentAdmin } from '@/lib/admin'
import { UserProfile } from '@/components/dashboard/admin-profile'

export const dynamic = 'force-dynamic'

/** The whole account of one customer, opened from the Usuários list. */
export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) redirect('/admin/login')
  const { id } = await params
  const profile = await UserProfile({ id })
  if (!profile) notFound()
  return profile
}
