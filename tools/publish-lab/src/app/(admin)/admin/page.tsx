import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Activity, AlertTriangle, Layers, CreditCard, Inbox, Package, Server, ShieldCheck, Users } from 'lucide-react'
import { currentAdmin } from '@/lib/admin'
import { AdminPasswordForm } from '@/components/dashboard/admin-login-form'
import { ErrorsTab, FeedbackTab, PaymentsTab, PlansTab, ProjectsTab, Summary, SystemTab, UsersTab } from '@/components/dashboard/admin-tabs'
import { DAY } from '@/lib/admin-data'

export const dynamic = 'force-dynamic'

const TABS = [
  { k: 'resumo', l: 'Resumo', icon: Activity }, { k: 'usuarios', l: 'Usuários', icon: Users }, { k: 'projetos', l: 'Projetos', icon: Layers }, { k: 'planos', l: 'Planos', icon: Package }, { k: 'pagamentos', l: 'Pagamentos', icon: CreditCard },
  { k: 'feedback', l: 'Mensagens', icon: Inbox }, { k: 'erros', l: 'Erros de clonagem', icon: AlertTriangle }, { k: 'sistema', l: 'Sistema', icon: Server },
]

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ aba?: string; st?: string; q?: string }> }) {
  // opening /admin is also where a person on the allow-list becomes the administrator (see lib/admin.ts)
  if (!(await currentAdmin({ claim: true }))) redirect('/admin/login')
  const { aba = 'resumo', st, q } = await searchParams
  const now = Date.now()
  const d7 = new Date(now - 7 * DAY), d30 = new Date(now - 30 * DAY)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20"><ShieldCheck className="h-5 w-5 text-amber-300" /></div>
        <div><h1 className="text-2xl font-bold text-white">Administração</h1><p className="text-sm text-gray-500">Quem usa, quem paga, o que precisa de atenção.</p></div>
      </div>
      <div className="flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
        {TABS.map(t => (
          <Link key={t.k} href={`/admin?aba=${t.k}`} className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition ${aba === t.k ? 'bg-white/10 font-semibold text-white' : 'text-gray-400 hover:text-gray-200'}`}><t.icon className="h-4 w-4" />{t.l}</Link>
        ))}
      </div>
      {aba === 'resumo' && <Summary d7={d7} d30={d30} />}
      {aba === 'usuarios' && <UsersTab q={q} st={st} />}
      {aba === 'projetos' && <ProjectsTab q={q} st={st} />}
      {aba === 'planos' && <PlansTab />}
      {aba === 'pagamentos' && <PaymentsTab />}
      {aba === 'feedback' && <FeedbackTab st={st} />}
      {aba === 'erros' && <ErrorsTab />}
      {aba === 'sistema' && <><SystemTab /><div className="h-4" /><AdminPasswordForm /></>}
    </div>
  )
}

