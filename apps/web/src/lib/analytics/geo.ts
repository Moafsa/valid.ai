import { isIP } from 'node:net'

/**
 * Country / region / city of a visit.
 *
 * From the address of the request, looked up in a local database (geoip-lite: nothing leaves this server, and the
 * address itself is never stored). When there is no usable address (a private network, a proxy that hides it, the
 * library missing) the visitor's own time zone gives the country, which is right for the vast majority of people.
 */
export interface GeoInfo { country: string | null; region: string | null; city: string | null }

let lookup: ((ip: string) => { country?: string; region?: string; city?: string } | null) | null | undefined

function loader() {
  if (lookup !== undefined) return lookup
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require('geoip-lite')
    lookup = (ip: string) => lib.lookup(ip)
  } catch {
    lookup = null
  }
  return lookup
}

const PRIVATE = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc|fd|fe80)/i

/** the address the visitor really has, read from the proxy's headers (nginx puts it there) */
export function clientIp(headers: Headers): string | null {
  const raw = headers.get('x-real-ip') || (headers.get('x-forwarded-for') || '').split(',')[0] || ''
  const ip = raw.trim().replace(/^\[|\]$/g, '').replace(/^::ffff:/i, '')
  return isIP(ip) ? ip : null
}

const TZ_COUNTRY: Record<string, string> = {
  'America/Sao_Paulo': 'BR', 'America/Bahia': 'BR', 'America/Fortaleza': 'BR', 'America/Recife': 'BR', 'America/Belem': 'BR', 'America/Manaus': 'BR',
  'America/Cuiaba': 'BR', 'America/Campo_Grande': 'BR', 'America/Porto_Velho': 'BR', 'America/Rio_Branco': 'BR', 'America/Maceio': 'BR', 'America/Araguaina': 'BR',
  'America/Noronha': 'BR', 'America/Boa_Vista': 'BR', 'America/Santarem': 'BR', 'America/Eirunepe': 'BR',
  'Europe/Lisbon': 'PT', 'Atlantic/Azores': 'PT', 'Atlantic/Madeira': 'PT',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US', 'America/Detroit': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Halifax': 'CA', 'America/Winnipeg': 'CA', 'America/Montreal': 'CA',
  'America/Mexico_City': 'MX', 'America/Cancun': 'MX', 'America/Monterrey': 'MX', 'America/Tijuana': 'MX',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Buenos_Aires': 'AR', 'America/Santiago': 'CL', 'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Caracas': 'VE',
  'America/Montevideo': 'UY', 'America/Asuncion': 'PY', 'America/La_Paz': 'BO', 'America/Guayaquil': 'EC', 'America/Panama': 'PA', 'America/Costa_Rica': 'CR',
  'Europe/Madrid': 'ES', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Rome': 'IT', 'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI',
  'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Athens': 'GR', 'Europe/Istanbul': 'TR', 'Europe/Moscow': 'RU', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Bucharest': 'RO',
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Singapore': 'SG', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dubai': 'AE',
  'Asia/Jerusalem': 'IL', 'Asia/Bangkok': 'TH', 'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH', 'Asia/Karachi': 'PK', 'Asia/Riyadh': 'SA',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Perth': 'AU', 'Australia/Brisbane': 'AU', 'Pacific/Auckland': 'NZ',
  'Africa/Johannesburg': 'ZA', 'Africa/Lagos': 'NG', 'Africa/Cairo': 'EG', 'Africa/Luanda': 'AO', 'Africa/Maputo': 'MZ',
}

export function geoFor(ip: string | null, tz?: string | null, lang?: string | null): GeoInfo {
  if (ip && !PRIVATE.test(ip)) {
    const l = loader()
    if (l) {
      try {
        const r = l(ip)
        if (r?.country) return { country: r.country, region: r.region || null, city: r.city || null }
      } catch { /* fall through to the time zone */ }
    }
  }
  const byTz = tz ? TZ_COUNTRY[tz] : undefined
  if (byTz) return { country: byTz, region: null, city: null }
  const m = (lang || '').match(/-([A-Za-z]{2})$/)
  return { country: m ? m[1].toUpperCase() : null, region: null, city: null }
}

const countryNames = (() => {
  try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }) } catch { return null }
})()
export function countryName(code: string | null | undefined): string {
  if (!code) return 'Desconhecido'
  try { return countryNames?.of(code) || code } catch { return code }
}
