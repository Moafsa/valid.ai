import React from 'react'
import { createRoot } from 'react-dom/client'
import { PixelsPanel } from '@/components/dashboard/pixels-panel'
import { DEFAULT_EVENTS, defaultMap } from '@/lib/pixels'

const events = DEFAULT_EVENTS.map(e => e.id === 'video' ? { ...e, on: true } : e.id === 'purchase' ? { ...e, on: true, trigger: { type: 'page' as const, match: 'obrigado' }, value: 97 } : e)
events.push({ id: 'c_wpp123', kind: 'custom', name: 'Clicou no WhatsApp', on: true, trigger: { type: 'click', match: 'WhatsApp' }, value: null, goal: true } as any)
const map = (t: any) => defaultMap(t, events)
const initial: any = {
  projectId: 'p1', published: new URLSearchParams(location.search).get('draft') !== '1', slug: 'oferta',
  settings: { consent: { required: false, respectDnt: true, text: 'Usamos cookies e pixels para medir os resultados dos anúncios. Você aceita?' }, currency: 'BRL', events },
  integrations: [
    { id: 'i1', type: 'META_PIXEL', pixelId: '123456789012345', isActive: true, config: { label: 'Campanha principal', map: map('META_PIXEL'), hasCode: false } },
    { id: 'i2', type: 'GOOGLE_ANALYTICS', pixelId: 'G-ABCDEF1234', isActive: true, config: { map: map('GOOGLE_ANALYTICS'), hasCode: false } },
    { id: 'i3', type: 'GOOGLE_TAG', pixelId: 'AW-1234567890', isActive: true, config: { map: { ...map('GOOGLE_TAG'), lead: { on: true, label: 'AbC-D_efG' } }, hasCode: false } },
    { id: 'i4', type: 'GTM', pixelId: 'GTM-ABCD123', isActive: false, config: { map: map('GTM'), hasCode: false } },
  ],
  detected: { pages: [{ slug: 'home', name: 'Etapa 1' }, { slug: 'quiz', name: 'Quiz' }, { slug: 'obrigado', name: 'Obrigado pela compra' }], forms: 2, formPages: ['home'], ctas: 14, checkoutLinks: 3, checkoutHosts: ['pay.hotmart.com'], videos: 1, thanks: [{ slug: 'obrigado', name: 'Obrigado pela compra' }] },
  overview: {
    stats: [
      { integration: 'META_PIXEL', event: 'PageView', key: 'pageview', state: 'sent', count: 412 }, { integration: 'META_PIXEL', event: 'Lead', key: 'lead', state: 'sent', count: 38 }, { integration: 'META_PIXEL', event: 'PageView', key: 'pageview', state: 'unconfirmed', count: 21 },
      { integration: 'META_PIXEL', event: 'Purchase', key: 'purchase', state: 'sent', count: 6 }, { integration: 'GOOGLE_ANALYTICS', event: 'page_view', key: 'pageview', state: 'sent', count: 380 }, { integration: 'GOOGLE_ANALYTICS', event: 'page_view', key: 'pageview', state: 'blocked', count: 44 },
    ],
    visitsByKey: { pageview: 433, lead: 38, purchase: 6 }, lastSeen: { i1: new Date(Date.now() - 4 * 60_000).toISOString(), i2: new Date(Date.now() - 9 * 3600_000).toISOString() },
    revenue: { total: 582, purchases: 6, currency: 'BRL' }, native: { sessions: 487, leads: 41 },
    recent: [
      { id: 'r1', integration: 'META_PIXEL', event: 'Lead', key: 'lead', slug: 'home', state: 'sent', value: null, test: false, at: new Date(Date.now() - 4 * 60_000).toISOString() },
      { id: 'r2', integration: 'META_PIXEL', event: 'Purchase', key: 'purchase', slug: 'obrigado', state: 'sent', value: 97, test: false, at: new Date(Date.now() - 20 * 60_000).toISOString() },
      { id: 'r3', integration: 'GOOGLE_ANALYTICS', event: 'page_view', key: 'pageview', slug: 'quiz', state: 'blocked', value: null, test: false, at: new Date(Date.now() - 50 * 60_000).toISOString() },
      { id: 'r4', integration: 'META_PIXEL', event: 'PageView', key: 'pageview', slug: 'home', state: 'unconfirmed', value: null, test: false, at: new Date(Date.now() - 80 * 60_000).toISOString() },
    ],
  },
}
createRoot(document.getElementById('root')!).render(
  <div style={{ background: 'radial-gradient(1200px 500px at 20% -10%, #2a1b5e 0%, #0a0714 60%)', minHeight: '100vh', padding: 28, color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}>
    <div style={{ maxWidth: 1152, margin: '0 auto' }}><PixelsPanel initial={initial} /></div>
  </div>
)
