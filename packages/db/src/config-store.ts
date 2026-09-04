/**
 * SystemConfig store — lê e escreve configurações do superadmin no banco.
 * Valores sensíveis são encriptados com AES-256-GCM antes de salvar.
 */
import { db } from './index'
import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY || 'funnelai-default-key-change-in-prod-32b'
const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  return crypto.scryptSync(ENCRYPTION_KEY, 'funnelai-salt', 32)
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const key = getKey()
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':')
  if (!ivHex || !authTagHex || !encrypted) throw new Error('Invalid encrypted value')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const key = getKey()
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

/** Lê uma configuração do banco (decriptada) */
export async function getConfig(key: string): Promise<string | null> {
  const row = await db.systemConfig.findUnique({ where: { key } })
  if (!row) return null
  try {
    return decrypt(row.value)
  } catch {
    return row.value // fallback se não estiver encriptado
  }
}

/** Escreve uma configuração (encriptada) */
export async function setConfig(
  key: string,
  value: string,
  meta: { label: string; category: string; description?: string; isSecret?: boolean },
  updatedBy?: string
): Promise<void> {
  const encrypted = meta.isSecret !== false ? encrypt(value) : value
  await db.systemConfig.upsert({
    where: { key },
    update: { value: encrypted, updatedBy: updatedBy ?? null, updatedAt: new Date() },
    create: {
      key,
      value: encrypted,
      label: meta.label,
      category: meta.category as any,
      description: meta.description,
      isSecret: meta.isSecret !== false,
      updatedBy: updatedBy ?? null,
    },
  })
}

/** Retorna todas as configs de uma categoria (valores mascarados para secrets) */
export async function getConfigsByCategory(category: string) {
  const rows = await db.systemConfig.findMany({
    where: { category: category as any },
    orderBy: { key: 'asc' },
  })
  return rows.map(row => ({
    ...row,
    value: row.isSecret ? '••••••••••••••••' : row.value,
  }))
}

/** Lê as chaves de IA configuradas pelo superadmin */
export async function getAiCredentials() {
  const [openai, anthropic, gemini, replicate] = await Promise.all([
    getConfig('openai_api_key'),
    getConfig('anthropic_api_key'),
    getConfig('gemini_api_key'),
    getConfig('replicate_api_key'),
  ])
  return { openai, anthropic, gemini, replicate }
}

/** Seed inicial das chaves de configuração (sem valores) */
export const CONFIG_DEFINITIONS = [
  // AI
  { key: 'openai_api_key', label: 'OpenAI API Key', category: 'AI', description: 'Chave para GPT-4o, GPT-4o-mini e Whisper', isSecret: true },
  { key: 'anthropic_api_key', label: 'Anthropic API Key', category: 'AI', description: 'Chave para Claude Opus/Sonnet/Haiku', isSecret: true },
  { key: 'gemini_api_key', label: 'Google Gemini API Key', category: 'AI', description: 'Chave para Gemini 1.5 Pro/Flash e asset extraction', isSecret: true },
  { key: 'replicate_api_key', label: 'Replicate API Key', category: 'AI', description: 'Para geração de imagens e background removal no S2C', isSecret: true },
  { key: 'ai_default_provider', label: 'Provider Padrão', category: 'AI', description: 'openai | anthropic | google', isSecret: false },
  // Storage (S3 / MinIO local)
  { key: 'aws_access_key_id', label: 'S3 / MinIO Access Key ID', category: 'STORAGE', isSecret: true },
  { key: 'aws_secret_access_key', label: 'S3 / MinIO Secret Access Key', category: 'STORAGE', isSecret: true },
  { key: 'aws_region', label: 'AWS Region', category: 'STORAGE', description: 'us-east-1 (ou us-east-1 para MinIO)', isSecret: false },
  { key: 's3_bucket_name', label: 'S3 / MinIO Bucket Name', category: 'STORAGE', isSecret: false },
  { key: 's3_endpoint_url', label: 'S3 Endpoint URL (MinIO)', category: 'STORAGE', description: 'Vazio para AWS S3 real ou http://minio:9000 para MinIO local no container', isSecret: false },
  { key: 'cdn_url', label: 'CDN / Public URL', category: 'STORAGE', isSecret: false },
  // Proxy
  { key: 'proxy_url', label: 'Proxy URL (Residencial)', category: 'PROXY', description: 'BrightData ou Oxylabs — para scanner stealth', isSecret: true },
  // Email (Resend ou SMTP próprio)
  { key: 'resend_api_key', label: 'Resend API Key', category: 'EMAIL', isSecret: true },
  { key: 'smtp_host', label: 'SMTP Host', category: 'EMAIL', description: 'Ex: smtp.sendgrid.net ou mail.seudominio.com', isSecret: false },
  { key: 'smtp_port', label: 'SMTP Port', category: 'EMAIL', description: '587 (TLS) ou 465 (SSL)', isSecret: false },
  { key: 'smtp_user', label: 'SMTP Usuário / Login', category: 'EMAIL', isSecret: true },
  { key: 'smtp_pass', label: 'SMTP Senha', category: 'EMAIL', isSecret: true },
  { key: 'email_from', label: 'E-mail remetente', category: 'EMAIL', description: 'Ex: contato@funnelai.com', isSecret: false },
  // Payment
  { key: 'stripe_secret_key', label: 'Stripe Secret Key', category: 'PAYMENT', isSecret: true },
  { key: 'stripe_webhook_secret', label: 'Stripe Webhook Secret', category: 'PAYMENT', isSecret: true },
  { key: 'asaas_api_key', label: 'Asaas API Key', category: 'PAYMENT', description: 'Chave de API do Asaas (Sandbox ou Produção)', isSecret: true },
  { key: 'asaas_wallet_id', label: 'Asaas Wallet ID', category: 'PAYMENT', description: 'ID da carteira Asaas para split/recebimento', isSecret: true },
  { key: 'asaas_environment', label: 'Asaas Ambiente', category: 'PAYMENT', description: 'sandbox | production', isSecret: false },
  // General
  { key: 'app_url', label: 'URL da Aplicação', category: 'GENERAL', isSecret: false },
  { key: 'credits_scan_lp', label: 'Créditos: Scan LP', category: 'GENERAL', description: 'Custo em créditos por scan de LP', isSecret: false },
  { key: 'credits_quiz_step', label: 'Créditos: Quiz por etapa', category: 'GENERAL', isSecret: false },
  { key: 'credits_translate', label: 'Créditos: Tradução', category: 'GENERAL', isSecret: false },
  { key: 'credits_cloaker', label: 'Créditos: Anti-Cloaker', category: 'GENERAL', isSecret: false },
] as const
