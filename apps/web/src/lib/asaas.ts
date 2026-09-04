/**
 * Asaas API Client — suporte a PIX, Boleto e Cartão de Crédito.
 * Suporta ambiente Sandbox e Produção.
 */
import { getConfig } from '@funnelai/db'

export class AsaasClient {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, isSandbox = true) {
    this.apiKey = apiKey
    this.baseUrl = isSandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://www.asaas.com/api/v3'
  }

  static async init(): Promise<AsaasClient> {
    const apiKey = (await getConfig('asaas_api_key')) || process.env.ASAAS_API_KEY || ''
    const env = (await getConfig('asaas_environment')) || 'sandbox'
    return new AsaasClient(apiKey, env === 'sandbox')
  }

  private async request(endpoint: string, method = 'GET', body?: any) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'access_token': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.errors?.[0]?.description || 'Erro na requisição Asaas')
    return data
  }

  /** Criar cliente no Asaas */
  async createCustomer(customer: { name: string; email: string; cpfCnpj?: string; phone?: string }) {
    return this.request('/customers', 'POST', customer)
  }

  /** Criar cobrança PIX instantânea */
  async createPixCharge(params: {
    customerId: string
    value: number
    description: string
    dueDate: string
  }) {
    const payment = await this.request('/payments', 'POST', {
      customer: params.customerId,
      billingType: 'PIX',
      value: params.value,
      dueDate: params.dueDate,
      description: params.description,
    })

    // Buscar QR Code PIX
    const pixData = await this.request(`/payments/${payment.id}/pixQrCode`, 'GET')
    return {
      paymentId: payment.id,
      invoiceUrl: payment.invoiceUrl,
      pixCopyPaste: pixData.payload,
      pixQrCodeBase64: pixData.encodedImage,
      expirationDate: pixData.expirationDate,
    }
  }

  /** Criar Assinatura Recorrente */
  async createSubscription(params: {
    customerId: string
    value: number
    cycle: 'MONTHLY' | 'YEARLY'
    description: string
    billingType: 'CREDIT_CARD' | 'PIX' | 'BOLETO'
  }) {
    return this.request('/subscriptions', 'POST', {
      customer: params.customerId,
      value: params.value,
      nextDueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      cycle: params.cycle,
      description: params.description,
      billingType: params.billingType,
    })
  }
}
