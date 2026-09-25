'use client'
import { useState } from 'react'
import { Copy, CheckCheck } from 'lucide-react'

export function TrackingSection() {
  const [copied, setCopied] = useState(false)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://be-vallid.com'
  const snippet = `<script src="${appUrl}/sdk.js"></script>
<script>
  window.vai = window.ValidAI.createTracker({ projectId: 'SEU_PROJECT_ID' });
  vai.page('home');
</script>`

  const copy = () => {
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Tracking SDK</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Funis publicados pela plataforma (botão "Publicar" no projeto) já incluem este tracking automaticamente.
          Use este snippet só se for embutir o funil em outro domínio/hospedagem.
        </p>
      </div>
      <div className="p-6">
        <div className="relative rounded-lg bg-gray-900 p-4">
          <button
            onClick={copy}
            className="absolute top-3 right-3 flex items-center gap-1 text-xs text-gray-400 hover:text-white"
          >
            {copied ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
          <pre className="text-xs text-gray-300 overflow-x-auto">{snippet}</pre>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Substitua <code className="bg-gray-100 px-1 rounded">SEU_PROJECT_ID</code> pelo ID do projeto (encontrado na URL do projeto no dashboard).
          Os eventos aparecem na seção <strong>Leads</strong> como a jornada de cada visitante.
        </p>
      </div>
    </div>
  )
}
