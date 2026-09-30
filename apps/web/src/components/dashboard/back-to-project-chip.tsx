'use client'

import { useRouter } from 'next/navigation'

/**
 * A "voltar ao dashboard" control for the isolated clone-viewer route.
 * Deliberately not an <a>/<button> — the captured page_css sitting on
 * this same document can use broad tag selectors (a{}, button{}) that
 * would otherwise restyle this too. A plain div + heavy inline styles
 * (with !important on anything a stray `*{}` rule could clobber) is the
 * defensive choice here, not an oversight.
 */
export function BackToProjectChip({ projectId }: { projectId: string }) {
  const router = useRouter()
  return (
    <div
      onClick={() => router.push(`/projects/${projectId}`)}
      style={{
        position: 'fixed',
        top: '12px',
        left: '12px',
        zIndex: 2147483647,
        background: '#111827',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        fontWeight: 600,
        padding: '8px 14px',
        borderRadius: '999px',
        cursor: 'pointer',
        boxShadow: '0 4px 14px rgba(0,0,0,.4)',
        opacity: 0.85,
      }}
    >
      ← Voltar
    </div>
  )
}
