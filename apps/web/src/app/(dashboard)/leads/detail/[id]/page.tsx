export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { db } from '@funnelai/db'
import Link from 'next/link'
import {
  ArrowLeft, Smartphone, Monitor, Globe2, Calendar,
  Eye, MousePointerClick, UserPlus, CreditCard, HelpCircle, PlayCircle, Circle,
} from 'lucide-react'

const EVENT_META: Record<string, { label: string; icon: any }> = {
  page_view: { label: 'Visualizou a página', icon: Eye },
  scroll: { label: 'Rolou a página', icon: MousePointerClick },
  cta_click: { label: 'Clicou em um CTA', icon: MousePointerClick },
  lead_capture: { label: 'Preencheu formulário', icon: UserPlus },
  quiz_answer: { label: 'Respondeu uma pergunta', icon: HelpCircle },
  video_progress: { label: 'Assistiu ao vídeo', icon: PlayCircle },
  checkout: { label: 'Iniciou checkout', icon: CreditCard },
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lead = await db.lead.findUnique({ where: { id } })
  if (!lead) notFound()

  const project = await db.project.findUnique({
    where: { id: lead.projectId },
    select: { id: true, name: true },
  })

  const timeline = Array.isArray(lead.timeline) ? (lead.timeline as any[]) : []
  const sorted = [...timeline].sort(
    (a, b) => new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime()
  )
  const utm = (lead.utmParams as Record<string, string>) ?? {}
  const answers = (lead.quizAnswers as Record<string, string>) ?? {}

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/leads" className="p-2 rounded-lg text-gray-400 hover:bg-gray-100">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{lead.name ?? lead.email ?? lead.phone ?? 'Visitante anônimo'}</h1>
          {project && <p className="text-sm text-gray-500">{project.name}</p>}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            {lead.device === 'mobile' ? <Smartphone className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
            Dispositivo
          </p>
          <p className="text-sm font-semibold text-gray-900">{lead.device ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            <Globe2 className="h-3.5 w-3.5" /> Origem
          </p>
          <p className="text-sm font-semibold text-gray-900 truncate">{utm.utm_source ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> Primeiro contato
          </p>
          <p className="text-sm font-semibold text-gray-900">{new Date(lead.createdAt).toLocaleString('pt-BR')}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-400 mb-1">Contato</p>
          <p className="text-sm font-semibold text-gray-900 truncate">{lead.email ?? lead.phone ?? '—'}</p>
        </div>
      </div>

      {Object.keys(answers).length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Respostas do quiz</h2>
          <div className="space-y-1.5">
            {Object.entries(answers).map(([q, a]) => (
              <div key={q} className="flex justify-between text-sm">
                <span className="text-gray-500">{q}</span>
                <span className="font-medium text-gray-800">{String(a)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Jornada</h2>
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum evento registrado ainda.</p>
        ) : (
          <ol className="relative border-l border-gray-200 ml-2 space-y-6">
            {sorted.map((entry, i) => {
              const meta = EVENT_META[entry.event] ?? { label: entry.event, icon: Circle }
              const Icon = meta.icon
              return (
                <li key={i} className="ml-5">
                  <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 ring-4 ring-white">
                    <Icon className="h-2.5 w-2.5 text-white" />
                  </span>
                  <p className="text-sm font-medium text-gray-900">
                    {meta.label}
                    {entry.step ? <span className="text-gray-400 font-normal"> — {entry.step}</span> : null}
                  </p>
                  <p className="text-xs text-gray-400">
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleString('pt-BR') : '—'}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
