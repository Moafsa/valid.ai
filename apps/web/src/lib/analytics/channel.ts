/**
 * Where a visit came from, in the words a marketer uses: a channel (paid, organic, social, email, referral, direct)
 * and one "source" name (facebook, google, instagram...) that the dashboard groups by.
 */
export type Channel = 'direct' | 'organic' | 'social' | 'paid' | 'email' | 'referral' | 'internal'

export const CHANNEL_LABEL: Record<string, string> = {
  direct: 'Direto', organic: 'Busca orgânica', social: 'Rede social', paid: 'Anúncio pago', email: 'E-mail', referral: 'Outro site', internal: 'Interno',
}

const SOCIAL: [RegExp, string][] = [
  [/(^|\.)(facebook|fb|fbcdn|messenger)\.com$|^l\.facebook|^lm\.facebook|^m\.facebook|(^|\.)fb\.me$/, 'facebook'],
  [/(^|\.)instagram\.com$|(^|\.)l\.instagram\.com$/, 'instagram'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(tiktok\.com)$/, 'tiktok'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'twitter'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'linkedin'],
  [/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, 'pinterest'],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, 'whatsapp'],
  [/(^|\.)(t\.me|telegram\.org)$/, 'telegram'],
  [/(^|\.)(reddit\.com)$/, 'reddit'],
  [/(^|\.)(kwai\.com|kwai-video\.com)$/, 'kwai'],
]
const SEARCH: [RegExp, string][] = [
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)(yahoo\.[a-z.]+)$/, 'yahoo'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)ecosia\.org$/, 'ecosia'],
  [/(^|\.)baidu\.com$/, 'baidu'],
  [/(^|\.)yandex\.[a-z.]+$/, 'yandex'],
]
const MAIL = /(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com|webmail|mailchimp|sendgrid|mailgun|activehosted|hotmart\.mail)/

const PAID_MEDIUM = /^(cpc|ppc|paid|paidsocial|paid[-_ ]?social|cpm|cpv|display|banner|ads?|retargeting|remarketing|sponsored|trafego[-_ ]?pago)$/i
const MAIL_MEDIUM = /^(e-?mail|newsletter|crm|mail)$/i
const SOCIAL_MEDIUM = /^(social|social[-_ ]?media|organic[-_ ]?social|sm)$/i
const ORGANIC_MEDIUM = /^(organic|seo)$/i

const rootOf = (h: string) => h.split('.').slice(-2).join('.')

/** utm_source / host written as people write them -> one canonical name */
export function normalizeSource(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = String(raw).trim().toLowerCase().replace(/^www\./, '')
  if (!s) return null
  const alias: Record<string, string> = {
    fb: 'facebook', facebook: 'facebook', 'facebook.com': 'facebook', face: 'facebook', meta: 'facebook', 'fb-ads': 'facebook', 'facebook-ads': 'facebook', 'facebookads': 'facebook',
    ig: 'instagram', instagram: 'instagram', 'instagram.com': 'instagram',
    yt: 'youtube', youtube: 'youtube', 'youtube.com': 'youtube',
    tt: 'tiktok', tiktok: 'tiktok', 'tiktok.com': 'tiktok',
    google: 'google', 'google.com': 'google', adwords: 'google', 'google-ads': 'google', googleads: 'google', gads: 'google',
    twitter: 'twitter', x: 'twitter', 'x.com': 'twitter', 't.co': 'twitter',
    wa: 'whatsapp', whatsapp: 'whatsapp', zap: 'whatsapp',
    tg: 'telegram', telegram: 'telegram', kwai: 'kwai', taboola: 'taboola', outbrain: 'outbrain',
  }
  if (alias[s]) return alias[s]
  for (const [re, name] of [...SOCIAL, ...SEARCH]) if (re.test(s)) return name
  return s.length > 60 ? s.slice(0, 60) : s
}

export interface ChannelInput {
  referrerDomain: string | null
  ownHost: string | null
  utmSource?: string | null
  utmMedium?: string | null
  clickIdType?: string | null
}

export function classifyChannel(i: ChannelInput): { channel: Channel; source: string } {
  const medium = (i.utmMedium || '').trim()
  const utmSource = normalizeSource(i.utmSource)
  const host = (i.referrerDomain || '').toLowerCase().replace(/^www\./, '')
  const refSource = host ? normalizeSource(host) : null
  const isSocialHost = !!host && SOCIAL.some(([re]) => re.test(host))
  const isSearchHost = !!host && SEARCH.some(([re]) => re.test(host))

  const source = utmSource || (i.clickIdType === 'fbclid' ? (refSource && isSocialHost ? refSource : 'facebook') : i.clickIdType === 'gclid' || i.clickIdType === 'gbraid' || i.clickIdType === 'wbraid' ? 'google' : i.clickIdType === 'ttclid' ? 'tiktok' : i.clickIdType === 'msclkid' ? 'bing' : null) || refSource || 'direct'

  // an ad: the visitor carries an ad click id, or the link says so (utm_medium=cpc ...)
  if (i.clickIdType || (medium && PAID_MEDIUM.test(medium))) return { channel: 'paid', source }
  if (medium && MAIL_MEDIUM.test(medium)) return { channel: 'email', source }
  if (medium && SOCIAL_MEDIUM.test(medium)) return { channel: 'social', source }
  if (medium && ORGANIC_MEDIUM.test(medium)) return { channel: isSocialHost ? 'social' : 'organic', source }
  if (utmSource && !host) return { channel: SOCIAL.some(([, n]) => n === utmSource) ? 'social' : SEARCH.some(([, n]) => n === utmSource) ? 'organic' : 'referral', source }
  if (!host) return { channel: 'direct', source }
  if (i.ownHost && rootOf(host) === rootOf(i.ownHost.toLowerCase().replace(/^www\./, '').split(':')[0])) return { channel: 'internal', source: 'direct' }
  if (MAIL.test(host)) return { channel: 'email', source }
  if (isSocialHost) return { channel: 'social', source }
  if (isSearchHost) return { channel: 'organic', source }
  return { channel: 'referral', source }
}
