import { Globe, Plus, ExternalLink, CheckCircle, XCircle } from 'lucide-react'

export default function DomainsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Domínios</h1>
          <p className="text-sm text-gray-500 mt-1">Conecte domínios próprios aos seus funis publicados</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          <Plus className="h-4 w-4" />
          Adicionar domínio
        </button>
      </div>

      {/* Default subdomain */}
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-green-800">Subdomínio padrão ativo</p>
            <p className="text-sm text-green-600">Todos os funis publicados ficam em <code className="bg-green-100 px-1 rounded">seuslug.valid.ai</code></p>
          </div>
        </div>
      </div>

      {/* Custom domains */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Domínios Customizados</h2>
        </div>
        <div className="px-6 py-16 text-center">
          <Globe className="h-10 w-10 text-gray-200 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-600">Nenhum domínio adicionado</h3>
          <p className="text-sm text-gray-400 mt-1 mb-4">
            Adicione seu domínio próprio para publicar funis em <code>seudominio.com</code>
          </p>
          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-4 text-left max-w-sm mx-auto">
            <p className="font-semibold text-gray-600 mb-2">Como configurar:</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li>Adicione o domínio aqui</li>
              <li>Crie um registro CNAME no seu DNS</li>
              <li>Aponte para: <code className="bg-gray-100 px-1 rounded">cname.valid.ai</code></li>
              <li>Aguarde a propagação (até 48h)</li>
            </ol>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            🔒 SSL automático via Cloudflare — disponível no plano Pro e Scale
          </p>
        </div>
      </div>
    </div>
  )
}
