/**
 * What a user-agent string says about the visitor: device kind, browser, system, and whether it is a robot.
 * Small on purpose (no dependency): the dashboard only groups by these names, it does not need every model of phone.
 */
export interface UaInfo {
  device: 'mobile' | 'tablet' | 'desktop'
  browser: string
  browserVersion: string | null
  os: string
  osVersion: string | null
  bot: boolean
  /** Apple, Samsung, Xiaomi, Motorola... */
  brand: string | null
  /** "Galaxy A54", "Pixel 7", "iPhone 12/13/14"... */
  model: string | null
  /** the app whose own browser opened the link (Instagram, Facebook, TikTok...), null in a normal browser */
  inApp: string | null
}

/** iPhones do not tell their model: the size of the screen (in CSS pixels, portrait) is the closest thing to a name */
const IPHONE_BY_SCREEN: Record<string, string> = {
  '320x568': 'iPhone 5/SE (1ª)', '375x667': 'iPhone 6/7/8/SE', '414x736': 'iPhone 6/7/8 Plus', '375x812': 'iPhone X/XS/11 Pro/12 mini/13 mini',
  '414x896': 'iPhone XR/11/XS Max', '390x844': 'iPhone 12/13/14', '428x926': 'iPhone 12/13/14 Plus', '393x852': 'iPhone 14 Pro/15/16', '430x932': 'iPhone 14 Pro Max/15 Plus/16 Plus',
  '402x874': 'iPhone 16 Pro', '440x956': 'iPhone 16 Pro Max',
}
/** the first letters of a Samsung code say which phone it is (SM-A546E -> A546 -> Galaxy A54) */
const SAMSUNG: Record<string, string> = {
  A546: 'Galaxy A54', A346: 'Galaxy A34', A146: 'Galaxy A14', A156: 'Galaxy A15', A055: 'Galaxy A05', A057: 'Galaxy A05s', A236: 'Galaxy A23', A245: 'Galaxy A24', A135: 'Galaxy A13', A137: 'Galaxy A13',
  A127: 'Galaxy A12', A125: 'Galaxy A12', A115: 'Galaxy A11', A032: 'Galaxy A03 Core', A037: 'Galaxy A03s', A035: 'Galaxy A03', A525: 'Galaxy A52', A526: 'Galaxy A52 5G', A528: 'Galaxy A52s', A536: 'Galaxy A53 5G',
  A725: 'Galaxy A72', A736: 'Galaxy A73', A516: 'Galaxy A51 5G', A515: 'Galaxy A51', A715: 'Galaxy A71', A505: 'Galaxy A50', A307: 'Galaxy A30s', A207: 'Galaxy A20s', A107: 'Galaxy A10s', A217: 'Galaxy A21s',
  G991: 'Galaxy S21', G996: 'Galaxy S21+', G998: 'Galaxy S21 Ultra', G990: 'Galaxy S21 FE', S901: 'Galaxy S22', S906: 'Galaxy S22+', S908: 'Galaxy S22 Ultra', S911: 'Galaxy S23', S916: 'Galaxy S23+', S918: 'Galaxy S23 Ultra',
  S921: 'Galaxy S24', S926: 'Galaxy S24+', S928: 'Galaxy S24 Ultra', S711: 'Galaxy S23 FE', G973: 'Galaxy S10', G975: 'Galaxy S10+', G960: 'Galaxy S9', G965: 'Galaxy S9+', G950: 'Galaxy S8', G781: 'Galaxy S20 FE',
  M236: 'Galaxy M23', M346: 'Galaxy M34', M546: 'Galaxy M54', M127: 'Galaxy M12', M135: 'Galaxy M13', M326: 'Galaxy M32 5G', M336: 'Galaxy M33', M515: 'Galaxy M51', J701: 'Galaxy J7 Neo', J610: 'Galaxy J6+', J415: 'Galaxy J4+',
  F146: 'Galaxy F14', F236: 'Galaxy F23', N986: 'Galaxy Note 20 Ultra', N975: 'Galaxy Note 10+', X710: 'Galaxy Tab S9', T295: 'Galaxy Tab A 8"', X200: 'Galaxy Tab A8',
}

function deviceNames(ua: string, os: string, hints?: { sw?: number; sh?: number }): { brand: string | null; model: string | null } {
  let m: RegExpMatchArray | null
  if (/iPhone/.test(ua)) {
    const w = Math.min(hints?.sw || 0, hints?.sh || 0), h = Math.max(hints?.sw || 0, hints?.sh || 0)
    return { brand: 'Apple', model: IPHONE_BY_SCREEN[`${w}x${h}`] || 'iPhone' }
  }
  if (/iPad/.test(ua)) return { brand: 'Apple', model: 'iPad' }
  if (os === 'macOS') return { brand: 'Apple', model: 'Mac' }
  if (os === 'Android') {
    const dev = (ua.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build|;|\))/) || [])[1]?.trim() || ''
    if ((m = dev.match(/^SM-([A-Z]\d{3})/))) return { brand: 'Samsung', model: SAMSUNG[m[1]] || `SM-${m[1]}…` }
    if (/^Pixel/i.test(dev)) return { brand: 'Google', model: dev }
    if (/^(Redmi|POCO|Mi |M2\d{3}|2\d{7}[A-Z]|Xiaomi)/i.test(dev)) return { brand: 'Xiaomi', model: dev.replace(/^Xiaomi\s*/i, '') }
    if (/^(moto|XT\d{4})/i.test(dev)) return { brand: 'Motorola', model: dev }
    if (/^(RMX|realme)/i.test(dev)) return { brand: 'Realme', model: dev }
    if (/^(CPH|OPPO)/i.test(dev)) return { brand: 'OPPO', model: dev }
    if (/^(V\d{4}|vivo)/i.test(dev)) return { brand: 'Vivo', model: dev }
    if (/^(LM-|LG)/i.test(dev)) return { brand: 'LG', model: dev }
    if (/^(ASUS|ZenFone|AI\d{4})/i.test(dev)) return { brand: 'Asus', model: dev }
    if (/^(Infinix|TECNO|itel)/i.test(dev)) return { brand: dev.split(/[\s-]/)[0], model: dev }
    if (/^(IN\d{4}|LE\d{4}|OnePlus)/i.test(dev)) return { brand: 'OnePlus', model: dev }
    if (/^(Nokia|TA-)/i.test(dev)) return { brand: 'Nokia', model: dev }
    return { brand: dev ? 'Android' : null, model: dev || null }
  }
  return { brand: null, model: null }
}

/** the app a link was opened in: its in-app browser leaves a name in the user-agent */
function inAppName(ua: string): string | null {
  if (/Instagram/i.test(ua)) return 'Instagram'
  if (/FBAN\/Orca|Orca-Android|Messenger/i.test(ua)) return 'Messenger'
  if (/FBAN|FBAV|FB_IAB|FB4A/i.test(ua)) return 'Facebook'
  if (/musical_ly|BytedanceWebview|TikTok|trill/i.test(ua)) return 'TikTok'
  if (/Kwai|KwaiApp/i.test(ua)) return 'Kwai'
  if (/Snapchat/i.test(ua)) return 'Snapchat'
  if (/Pinterest/i.test(ua)) return 'Pinterest'
  if (/LinkedInApp/i.test(ua)) return 'LinkedIn'
  if (/Twitter|TwitterAndroid/i.test(ua)) return 'X / Twitter'
  if (/\bLine\//i.test(ua)) return 'Line'
  if (/Telegram/i.test(ua)) return 'Telegram'
  if (/GSA\//.test(ua)) return 'App do Google'
  return null
}

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|python-requests|curl\/|wget|axios|go-http|java\/|scrapy|phantomjs|httpclient/i

function major(v: string | undefined | null): string | null {
  if (!v) return null
  const m = String(v).replace(/_/g, '.').match(/^\d+(\.\d+)?/)
  return m ? m[0] : null
}

export function parseUa(ua: string | null | undefined, hints?: { touch?: boolean; sw?: number; sh?: number; vw?: number }): UaInfo {
  const s = ua || ''
  let os = 'Outro', osVersion: string | null = null
  let m: RegExpMatchArray | null
  if ((m = s.match(/Windows NT (\d+\.\d+)/))) {
    os = 'Windows'
    osVersion = ({ '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' } as Record<string, string>)[m[1]] ?? m[1]
  } else if ((m = s.match(/Android[ /]?([\d.]+)?/))) { os = 'Android'; osVersion = major(m[1]) }
  else if ((m = s.match(/(?:iPhone|CPU) OS ([\d_]+)/)) || /iPhone|iPad|iPod/.test(s)) { os = 'iOS'; osVersion = major(m?.[1]) }
  else if ((m = s.match(/Mac OS X ([\d_.]+)/))) { os = /Mobile/.test(s) ? 'iOS' : 'macOS'; osVersion = major(m[1]) }
  else if (/CrOS/.test(s)) os = 'ChromeOS'
  else if (/Linux/.test(s)) os = 'Linux'

  let browser = 'Outro', browserVersion: string | null = null
  if ((m = s.match(/(?:Edg|EdgA|EdgiOS)\/([\d.]+)/))) { browser = 'Edge'; browserVersion = major(m[1]) }
  else if ((m = s.match(/OPR\/([\d.]+)|Opera\/([\d.]+)/))) { browser = 'Opera'; browserVersion = major(m[1] || m[2]) }
  else if ((m = s.match(/SamsungBrowser\/([\d.]+)/))) { browser = 'Samsung Internet'; browserVersion = major(m[1]) }
  else if ((m = s.match(/(?:FBAN|FBAV|FB_IAB)[^;]*;?(?:FBAV\/([\d.]+))?/)) && /FBAN|FBAV|FB_IAB/.test(s)) { browser = 'Facebook (in-app)'; browserVersion = major(m[1]) }
  else if (/Instagram/.test(s)) { browser = 'Instagram (in-app)'; browserVersion = major(s.match(/Instagram ([\d.]+)/)?.[1]) }
  else if (/TikTok|musical_ly|BytedanceWebview/.test(s)) browser = 'TikTok (in-app)'
  else if (/; wv\)|WebView/.test(s) && /Android/.test(s)) browser = 'WebView (in-app)'
  else if ((m = s.match(/(?:Firefox|FxiOS)\/([\d.]+)/))) { browser = 'Firefox'; browserVersion = major(m[1]) }
  else if ((m = s.match(/(?:Chrome|CriOS)\/([\d.]+)/))) { browser = 'Chrome'; browserVersion = major(m[1]) }
  else if ((m = s.match(/Version\/([\d.]+).*Safari/))) { browser = 'Safari'; browserVersion = major(m[1]) }
  else if (/Safari/.test(s)) browser = 'Safari'

  let device: UaInfo['device'] = 'desktop'
  if (/iPad|Tablet|PlayBook|Silk/.test(s) || (/Android/.test(s) && !/Mobile/.test(s))) device = 'tablet'
  else if (/iPhone|iPod|Android.+Mobile|Windows Phone|Mobile Safari|BlackBerry|Opera Mini|IEMobile/.test(s)) device = 'mobile'
  // an iPad that says it is a Mac: macOS with a touch screen
  else if (os === 'macOS' && hints?.touch) device = 'tablet'
  // a phone's "desktop site" mode: the screen is small even though the string says desktop
  else if (hints?.touch && hints.sw && hints.sw < 700 && (os === 'Android' || os === 'iOS' || os === 'Linux')) device = 'mobile'

  const inApp = inAppName(s)
  // inside an app the browser is the phone's own engine: say that (Chrome / Safari), and keep the app apart
  if (inApp) { browser = os === 'iOS' ? 'Safari' : 'Chrome'; }
  const names = deviceNames(s, os, hints)
  return { device, browser, browserVersion, os, osVersion, bot: !s || (BOT.test(s) && !/Instagram|FBAN|FBAV|FB_IAB/.test(s)), brand: names.brand, model: names.model, inApp }
}
