import { notFound } from 'next/navigation'
import { db } from '@funnelai/db'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function ProjectLeadsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  })
  if (!project) notFound()

  const leads = await db.lead.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/leads" className="p-2 rounded-lg text-gray-400 hover:bg-gray-100">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Leads — {project.name}</h1>
          <p className="text-sm text-gray-500">{leads.length} leads capturados</p>
        </div>
        <button className="ml-auto flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          ⬇ Exportar CSV
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {leads.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p>Nenhum lead capturado neste projeto ainda.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Lead</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Respostas Quiz</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">UTM Source</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => {
                const utms = lead.utmParams as Record<string, string>
                const answers = lead.quizAnswers as Record<string, string>
                return (
                  <tr key={lead.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{lead.name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{lead.email ?? lead.phone ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {Object.keys(answers).length > 0
                        ? `${Object.keys(answers).length} respostas`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{utms.utm_source ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
