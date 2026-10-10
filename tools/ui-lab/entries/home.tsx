import React from 'react'
import { createRoot } from 'react-dom/client'
import { CloneHero } from '@/components/dashboard/clone-hero'
import { ProjectGrid } from '@/components/dashboard/project-grid'

// the dashboard home with fake projects (thumbnails are drawn here: coloured page mock-ups)
const mock = (a: string, b: string, title: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><rect width="640" height="400" fill="${a}"/><rect x="0" y="0" width="640" height="64" fill="${b}" opacity=".9"/><rect x="40" y="22" width="90" height="18" rx="9" fill="#fff" opacity=".85"/><text x="320" y="170" font-family="Inter,Arial" font-size="38" font-weight="700" text-anchor="middle" fill="#fff">${title}</text><rect x="210" y="206" width="220" height="14" rx="7" fill="#fff" opacity=".55"/><rect x="250" y="232" width="140" height="14" rx="7" fill="#fff" opacity=".35"/><rect x="240" y="276" width="160" height="46" rx="23" fill="${b}"/></svg>`)
const params = new URLSearchParams(location.search)
const empty = params.get('empty') === '1'
const projects = empty ? [] : [
  { id: '1', name: 'Quiz Reconquista (26 etapas)', sourceUrl: 'https://reconquista-ela-hoje.lovable.app/', status: 'PUBLISHED', thumbnail: mock('#1f1147', '#7c3aed', 'Reconquista') },
  { id: '2', name: 'VSL Glúteo Brasileiro', sourceUrl: 'https://www.gluteobrasileno.online/?step=result', status: 'READY', thumbnail: mock('#0b2a3f', '#0ea5e9', 'Resultado') },
  { id: '3', name: 'Clone de recantodalagoa.com.br', sourceUrl: 'https://recantodalagoa.com.br/', status: 'SCANNING', thumbnail: null },
  { id: '4', name: 'Oferta Calistenia', sourceUrl: 'https://inlead.digital/calistenia-hTZQKf/', status: 'PUBLISHED', thumbnail: mock('#2a1010', '#ef4444', 'Calistenia') },
  { id: '5', name: 'Página que falhou', sourceUrl: 'https://exemplo.com/falhou', status: 'ERROR', thumbnail: null },
]
createRoot(document.getElementById('root')!).render(
  <div style={{ background: '#07050f', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif', position: 'relative' }}>
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: -160, left: '50%', width: 900, height: 560, transform: 'translateX(-50%)', borderRadius: 9999, background: 'rgba(124,58,237,0.15)', filter: 'blur(130px)' }} />
    </div>
    <main style={{ position: 'relative', maxWidth: 1152, margin: '0 auto', padding: '40px 24px' }}>
      <div className="space-y-14">
        <CloneHero variant="workspace" initialUrl={params.get('url') || ''} />
        <ProjectGrid projects={projects} />
      </div>
    </main>
  </div>
)
