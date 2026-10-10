import React from 'react'
import { createRoot } from 'react-dom/client'
import { CloakerTool } from '@/components/dashboard/cloaker-tool'

createRoot(document.getElementById('root')!).render(
  <div style={{ background: 'radial-gradient(1200px 500px at 20% -10%, #2a1b5e 0%, #0a0714 60%)', minHeight: '100vh', padding: 28, color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}><CloakerTool /></div>
)
