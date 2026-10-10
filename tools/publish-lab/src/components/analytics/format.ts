import { CHANNEL_LABEL } from '@/lib/analytics/channel'

export const nf = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '0' : Math.round(v).toLocaleString('pt-BR'))
export const pf = (v: number | null | undefined, d = 1) => {
  if (v == null || !Number.isFinite(v)) return '0%'
  const r = Math.round(v * 10 ** d) / 10 ** d
  return `${r.toLocaleString('pt-BR', { maximumFractionDigits: d })}%`
}
export const clock = (sec: number | null | undefined) => {
  const s = Math.max(0, Math.round(sec || 0))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}
/** "1min 20s" / "45s" for tiles */
export const dur = (sec: number | null | undefined) => {
  const s = Math.max(0, Math.round(sec || 0))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60), r = s % 60
  return r ? `${m}min ${r}s` : `${m}min`
}
export const delta = (now: number, before: number): number | null => (before > 0 ? ((now - before) / before) * 100 : now > 0 ? null : 0)

export const DEVICE_LABEL: Record<string, string> = { mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet' }
export const SOURCE_LABEL = (s: string) => ({ direct: 'Direto', facebook: 'Facebook', instagram: 'Instagram', google: 'Google', youtube: 'YouTube', tiktok: 'TikTok', twitter: 'X / Twitter', whatsapp: 'WhatsApp', telegram: 'Telegram', kwai: 'Kwai', bing: 'Bing', linkedin: 'LinkedIn', pinterest: 'Pinterest' } as Record<string, string>)[s] || s
export const channelLabel = (c: string) => CHANNEL_LABEL[c] || c
export const modeLabel = (m: string) => (m === 'draft' ? 'Rascunho' : 'Publicado')

/** a flag from a two-letter country code */
export const flag = (code: string | null | undefined) => {
  if (!code || code.length !== 2 || code === '??') return '🌐'
  return String.fromCodePoint(...code.toUpperCase().split('').map(c => 0x1f1a5 + c.charCodeAt(0)))
}

export const BR_STATES: Record<string, string> = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' }

const countryNames = (() => { try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }) } catch { return null } })()
export const countryName = (code: string | null | undefined) => { if (!code || code === '??') return 'Desconhecido'; try { return countryNames?.of(code) || code } catch { return code } }
export const regionLabel = (key: string) => {
  const [c, r] = key.split('/')
  if (!r) return `${flag(c)} ${countryName(c)}`
  return `${flag(c)} ${c === 'BR' ? BR_STATES[r] || r : r}${c === 'BR' ? '' : `, ${countryName(c)}`}`
}

export const when = (iso: string | Date) => {
  const d = new Date(iso)
  const now = Date.now(), diff = (now - d.getTime()) / 1000
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** a readable name for a css path: what kind of thing it is, without the nth-of-type noise */
export const selName = (sel: string | null | undefined) => {
  if (!sel) return 'elemento'
  const last = (sel.split('>').pop() || sel).replace(/:nth-of-type\(\d+\)/g, '')
  const tag = last.replace(/^#.*/, '').replace(/[.[#].*$/, '')
  const kind: Record<string, string> = { path: 'ícone', svg: 'ícone', img: 'imagem', picture: 'imagem', video: 'vídeo', button: 'botão', a: 'link', input: 'campo', textarea: 'campo', select: 'campo', label: 'rótulo', div: 'área', section: 'seção', span: 'texto', p: 'texto', li: 'item de lista', h1: 'título', h2: 'título', h3: 'título', h4: 'título' }
  if (last.startsWith('#')) return last
  return kind[tag] ? `${kind[tag]} (${last})` : last
}
