export const dynamic = 'force-dynamic'

import { db } from '@funnelai/db'
import { ConfigSection } from '@/components/superadmin/config-section'
import { CONFIG_DEFINITIONS } from '@funnelai/db'

export default async function ConfigPage() {
  const savedConfigs = await db.systemConfig.findMany()
  const savedMap = Object.fromEntries(savedConfigs.map(c => [c.key, c]))

  const categories = [
    { id: 'AI', label: '🤖 Credenciais de IA', description: 'Chaves de API dos provedores de IA. São compartilhadas por todos os usuários da plataforma.' },
    { id: 'STORAGE', label: '🗄️ Storage (AWS S3)', description: 'Configurações de armazenamento de arquivos, vídeos e screenshots.' },
    { id: 'EMAIL', label: '📧 E-mail (Resend)', description: 'Chave para envio de e-mails transacionais.' },
    { id: 'PROXY', label: '🔒 Proxy Residencial', description: 'Para scanner stealth e anti-cloaker. BrightData ou Oxylabs.' },
    { id: 'PAYMENT', label: '💳 Pagamentos (Stripe)', description: 'Chaves do Stripe para assinaturas e recarga de créditos.' },
    { id: 'GENERAL', label: '⚙️ Configurações Gerais', description: 'Custos de crédito por operação e configurações da plataforma.' },
  ]

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-white">Configurações da Plataforma</h2>
        <p className="text-gray-400 mt-1">
          Todas as chaves são encriptadas com AES-256-GCM antes de serem salvas no banco de dados.
        </p>
      </div>

      {categories.map(cat => (
        <ConfigSection
          key={cat.id}
          category={cat}
          fields={CONFIG_DEFINITIONS.filter(d => d.category === cat.id)}
          savedMap={savedMap}
        />
      ))}
    </div>
  )
}
