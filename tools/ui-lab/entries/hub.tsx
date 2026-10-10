import React from 'react'
import { createRoot } from 'react-dom/client'
import { MetricsHubView } from '@/components/dashboard/metrics-hub'

// the Métricas tab's card: not published (blurred, with the reason) and published (with the real numbers of the lab project, handed in by the test)
const F = (window as any).__FIXTURE
createRoot(document.getElementById('root')!).render(
  <div style={{ background: 'radial-gradient(1200px 500px at 20% -10%, #2a1b5e 0%, #0a0714 60%)', minHeight: '100vh', padding: 28, display: 'grid', gap: 22, alignContent: 'start', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}>
    <div style={{ maxWidth: 1100, display: 'grid', gap: 22, width: '100%', margin: '0 auto' }}>
      <MetricsHubView projectId="p" data={null} />
      <MetricsHubView projectId="p" data={F.data} />
      <MetricsHubView projectId="p" data={{ ...F.data, totals: { ...F.data.totals, sessions: 0 } }} />
    </div>
  </div>
)
