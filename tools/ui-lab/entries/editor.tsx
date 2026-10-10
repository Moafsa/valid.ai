import React from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { VisualEditor } from '@/components/editor/visual-editor'

const F = (window as any).__FIXTURE
const pages = [
  { id: F.pageId, slug: F.slug, name: 'Página inicial', order: 0 },
  { id: 'p2', slug: 'obrigado', name: 'Obrigado', order: 1 },
]
createRoot(document.getElementById('root')!).render(
  <>
    <VisualEditor projectId={F.projectId} pageId={F.pageId} blocks={F.blocks} pageCss={F.pageCss} pages={pages} shell={F.shell} projectName="AppLanPage" projectSlug={null} phoneSlug={F.shell?.mobileSlug ?? null} desktopSlug={F.shell?.variant === "mobile" ? F.shell.of : null} pageName="Página inicial (celular)" />
    <Toaster richColors position="top-right" />
  </>
)
