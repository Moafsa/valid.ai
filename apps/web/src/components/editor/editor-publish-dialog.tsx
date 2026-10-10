'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Globe2, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Publish = freeze what is saved right now as the public site, at be-vallid.com/s/<slug>.
 * The editor keeps working on its own copy: nothing reaches visitors until Publicar is clicked again.
 */
export function EditorPublishDialog({
  projectId, currentSlug, onClose, onPublished, beforePublish,
}: {
  projectId: string
  currentSlug: string | null
  onClose: () => void
  onPublished: (slug: string) => void
  /** save the page first, so what gets published is what is on screen */
  beforePublish: () => Promise<boolean>
}) {
  const [slug, setSlug] = useState(currentSlug ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [done, setDone] = useState<string | null>(currentSlug)
  const [status, setStatus] = useState<{ published: boolean; unpublishedChanges: boolean; publishedAt: string | null } | null>(null)
  const [taking, setTaking] = useState(false)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/publish`).then(r => (r.ok ? r.json() : null)).then(d => d && setStatus(d)).catch(() => {})
  }, [projectId])

  const publish = async () => {
    const trimmed = slug.trim()
    if (!trimmed) return
    setSaving(true); setError(null)
    try {
      if (!(await beforePublish())) throw new Error('Não deu pra salvar a página antes de publicar.')
      const res = await fetch(`/api/projects/${projectId}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: trimmed }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao publicar')
      setDone(data.slug || trimmed)
      setStatus({ published: true, unpublishedChanges: false, publishedAt: new Date().toISOString() })
      onPublished(data.slug || trimmed)
      toast.success('Publicado! O site já está no ar com essa versão.')
    } catch (e: any) {
      setError(e.message || 'Erro ao publicar')
    } finally { setSaving(false) }
  }

  const takeDown = async () => {
    setTaking(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/publish`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Não deu pra tirar do ar')
      setStatus({ published: false, unpublishedChanges: false, publishedAt: null })
      toast.success('Site tirado do ar.')
    } catch (e: any) { setError(e.message || 'Erro') } finally { setTaking(false) }
  }

  const live = status ? status.published : !!currentSlug
  const link = done && live ? `${done}.be-vallid.com` : null
  return (
    <>
      <div className="ed-overlay" onClick={onClose} />
      <div className="ed-modal" role="dialog" aria-label="Publicar">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="ed-insp-ico"><Globe2 size={17} /></span>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.01em' }}>Publicar projeto</h3>
          </div>
          <button className="ed-ibtn ed-ibtn-sm" onClick={onClose} aria-label="Fechar"><X size={15} /></button>
        </div>
        <p className="ed-hint" style={{ margin: '0 0 16px', fontSize: 12 }}>
          Ao publicar, a versão que você editou vira o site de verdade, só a página clonada, sem nada do editor. Pode continuar editando: o site só muda quando você publicar de novo.
        </p>
        {status?.published && (
          <p className="ed-hint" style={{ margin: '-6px 0 12px', fontSize: 12, color: status.unpublishedChanges ? 'var(--ed-warn, #b7791f)' : 'var(--ed-ok)' }}>
            {status.unpublishedChanges ? 'Tem alterações que ainda não estão no site publicado.' : 'O site publicado está igual ao que você vê aqui.'}
          </p>
        )}
        <div className="ed-color" style={{ height: 42, paddingLeft: 12, display: 'flex', alignItems: 'center' }}>
          <input type="text" value={slug} autoFocus onChange={e => setSlug(e.target.value)} onKeyDown={e => e.key === 'Enter' && publish()} placeholder="meu-projeto" style={{ fontFamily: 'inherit', fontSize: 14, flex: 1 }} />
          <span style={{ fontSize: 13, color: 'var(--ed-text-3)', paddingRight: 12 }}>.be-vallid.com</span>
        </div>
        {error && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ed-danger)' }}>{error}</p>}
        {link && (
          <div className="ed-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, padding: '9px 12px', background: 'rgba(47,165,106,.08)', borderColor: 'rgba(47,165,106,.3)', fontSize: 12.5, color: 'var(--ed-ok)' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{link}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <a className="ed-btn ed-btn-sm" href={`https://${done}.be-vallid.com`} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Abrir</a>
              <button className="ed-btn ed-btn-sm" onClick={() => navigator.clipboard.writeText(`https://${done}.be-vallid.com`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}>
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copiado' : 'Copiar'}
              </button>
            </span>
          </div>
        )}
        <button className="ed-btn ed-btn-primary ed-btn-block" style={{ height: 40, marginTop: 16, fontSize: 13.5 }} disabled={saving || !slug.trim()} onClick={publish}>
          {saving ? <Loader2 size={15} className="ed-spin" /> : <Globe2 size={15} />}
          {live ? 'Salvar e atualizar o site' : 'Salvar e publicar'}
        </button>
        {live && (
          <button className="ed-btn ed-btn-block" style={{ height: 34, marginTop: 8, fontSize: 12.5 }} disabled={taking} onClick={takeDown}>
            {taking ? <Loader2 size={13} className="ed-spin" /> : null} Tirar do ar
          </button>
        )}
      </div>
    </>
  )
}
