import React from 'react'
import { createRoot } from 'react-dom/client'
import { AnalyticsCenter } from '@/components/analytics/center'

const F = (window as any).__FIXTURE
createRoot(document.getElementById('root')!).render(<AnalyticsCenter projectId={F.projectId} projectName={F.name} slug={F.slug} published />)
