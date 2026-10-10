import React from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { FlowDashboard } from '@/components/dashboard/flow-dashboard'
import { listFlowLinks } from '@/lib/clone-flow'

const F = (window as any).__FIXTURE
const steps = F.pages.map((p: any) => ({
  slug: p.slug, name: p.name, links: listFlowLinks(p.blocks || []),
  rules: Array.isArray(p.shell?.rules) ? p.shell.rules : [],
}))
const withData = new URLSearchParams(location.search).get('data') === '1'
const stats = withData ? {
  windowDays: 30, sessions: 412, leads: 38, reachedEnd: 96, hasData: true,
  steps: Object.fromEntries(steps.map((s: any, i: number) => [s.slug, { views: 400 - i * 38, visitors: 412 - i * 44 > 0 ? 412 - i * 44 : 20, stopped: Math.round((412 - i * 44) * (i === 3 ? 0.34 : 0.12)), secs: 6 + i * 3 }])),
  moves: Object.fromEntries(steps.slice(0, -1).map((s: any, i: number) => [`${s.slug}>${steps[i + 1].slug}`, 360 - i * 40])),
  clicks: { [steps[0].slug]: [{ label: 'Quero começar', to: steps[1].slug, n: 311 }, { label: 'Saber mais', to: steps[1].slug, n: 98 }] },
} : { windowDays: 30, sessions: 0, leads: 0, reachedEnd: 0, hasData: false, steps: {}, moves: {}, clicks: {} }
createRoot(document.getElementById('root')!).render(
  <div style={{ background: '#09090b', minHeight: '100vh', padding: 28, color: '#fff' }}>
    <FlowDashboard projectId={F.projectId} steps={steps} stats={stats as any} sourceHost="inlead.digital" basePath={`/projects/${F.projectId}/p`} />
    <Toaster richColors position="top-right" />
  </div>
)
