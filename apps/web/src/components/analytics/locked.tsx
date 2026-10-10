import Link from 'next/link'
import { Activity, Lock } from 'lucide-react'
import { EDITOR_CSS } from '@/components/editor/editor-theme'
import { ANALYTICS_CSS } from './theme'

/** Métricas only exist for the published site: until then there is nothing to measure (the editor link is never counted). */
export function MetricsLocked({ projectId, name }: { projectId: string; name: string }) {
  return (
    <div className="vai-ed vai-an" data-theme="light" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <style>{EDITOR_CSS}</style>
      <style>{ANALYTICS_CSS}</style>
      <div className="an-card" style={{ maxWidth: 460, textAlign: 'center', padding: '36px 32px' }}>
        <div className="an-logo" style={{ margin: '0 auto 16px', width: 44, height: 44, borderRadius: 13 }}><Activity size={20} /></div>
        <h1 className="an-h1" style={{ fontSize: 19 }}>Métricas de {name}</h1>
        <p className="an-sub" style={{ margin: '10px auto 20px' }}>
          <Lock size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />
          As métricas liberam quando o site for publicado. Elas mostram só as visitas da página publicada, nunca as do link de edição.
        </p>
        <Link className="ed-btn ed-btn-primary" href={`/projects/${projectId}`}>Voltar ao projeto e publicar</Link>
      </div>
    </div>
  )
}
