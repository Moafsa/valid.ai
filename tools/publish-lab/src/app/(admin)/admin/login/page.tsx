import { redirect } from 'next/navigation'
import { currentAdmin } from '@/lib/admin'
import { AdminLoginForm } from '@/components/dashboard/admin-login-form'

export const dynamic = 'force-dynamic'

export default async function AdminLoginPage() {
  if (await currentAdmin()) redirect('/admin')
  return <AdminLoginForm />
}
