import { notFound } from 'next/navigation'
import { MessageSquareHeart } from 'lucide-react'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { FeedbackForm } from '@/components/dashboard/feedback-form'

export const dynamic = 'force-dynamic'

const KIND: Record<string, string> = { site_not_cloning: 'Site não clonou direito', clone_error: 'Erro ao clonar', bug: 'Problema no sistema', idea: 'Ideia', praise: 'Elogio', other: 'Outro' }
const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: 'Enviada', cls: 'bg-white/10 text-gray-300' },
  seen: { label: 'Vista', cls: 'bg-blue-500/15 text-blue-300' },
  answered: { label: 'Respondida', cls: 'bg-emerald-500/15 text-emerald-300' },
  done: { label: 'Resolvida', cls: 'bg-violet-500/15 text-violet-300' },
}

export default async function FeedbackPage() {
  const workspace = await getCurrentWorkspace()
  if (!workspace) notFound()
  const [items, projects] = await Promise.all([
    db.feedback.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.project.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true }, take: 60 }),
  ])
  // opening this page is seeing the answers
  const unread = new Set(items.filter(i => !i.userRead).map(i => i.id))
  if (unread.size) await db.feedback.updateMany({ where: { workspaceId: workspace.id, userRead: false }, data: { userRead: true } })

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20"><MessageSquareHeart className="h-5 w-5 text-violet-300" /></div>
          <h1 className="text-2xl font-bold text-white">Feedback e problemas</h1>
        </div>
        <p className="mt-2 text-sm text-gray-400">Um site que não clonou direito, um erro, uma ideia: conta aqui. A mensagem chega para mim com o que você estava fazendo, e a resposta aparece nesta página.</p>
      </div>
      <FeedbackForm projects={projects} />
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Suas mensagens</h2>
        {items.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-gray-500">Você ainda não enviou nenhuma.</p> : (
          <div className="space-y-3">
            {items.map(i => (
              <div key={i.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-gray-200">{KIND[i.kind] || i.kind}</span>
                  <span className={`rounded-full px-2 py-0.5 ${STATUS[i.status]?.cls}`}>{STATUS[i.status]?.label || i.status}</span>
                  {unread.has(i.id) && <span className="rounded-full bg-violet-500 px-2 py-0.5 font-semibold text-white">resposta nova</span>}
                  <span className="ml-auto text-gray-500">{new Date(i.createdAt).toLocaleString('pt-BR')}</span>
                </div>
                {i.siteUrl && <p className="mt-1 truncate text-xs text-violet-300">{i.siteUrl}</p>}
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">{i.message}</p>
                {i.reply && (
                  <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Resposta{i.repliedAt ? ` · ${new Date(i.repliedAt).toLocaleString('pt-BR')}` : ''}</p>
                    <p className="whitespace-pre-wrap text-sm text-gray-200">{i.reply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
