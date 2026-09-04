import type { EventType, TrackerConfig, FunnelAITracker } from './types'

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function getUtmParams(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  const utms: Record<string, string> = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ttclid']) {
    const val = params.get(key)
    if (val) utms[key] = val
  }
  return utms
}

function getDevice(): 'mobile' | 'desktop' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet'
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) return 'mobile'
  return 'desktop'
}

export function createTracker(config: TrackerConfig): FunnelAITracker {
  const sessionId = config.sessionId || generateSessionId()
  const utmParams = getUtmParams()
  const device = getDevice()
  let leadEmail: string | undefined

  // Store session in sessionStorage
  if (typeof sessionStorage !== 'undefined') {
    const existing = sessionStorage.getItem('fai_session')
    if (!existing) sessionStorage.setItem('fai_session', sessionId)
  }

  function sendEvent(eventType: EventType, step?: string, metadata?: Record<string, unknown>) {
    const payload = {
      projectId: config.projectId,
      sessionId,
      eventType,
      step: step ?? 'unknown',
      metadata: metadata ?? {},
      device,
      utmParams,
      leadEmail,
      timestamp: new Date().toISOString(),
    }

    if (config.debug) console.log('[FunnelAI]', payload)

    // Use sendBeacon for reliability (works on page unload)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(
        `${config.endpoint}/api/track`,
        JSON.stringify(payload)
      )
    } else {
      fetch(`${config.endpoint}/api/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {})
    }
  }

  // Auto-track scroll depth
  if (typeof window !== 'undefined') {
    const scrollMilestones = new Set<string>()
    window.addEventListener('scroll', () => {
      const scrollPct = Math.round(
        (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
      )
      for (const milestone of [25, 50, 75, 100]) {
        const key = `scroll_${milestone}`
        if (scrollPct >= milestone && !scrollMilestones.has(key)) {
          scrollMilestones.add(key)
          sendEvent(`scroll_${milestone}` as EventType)
        }
      }
    }, { passive: true })
  }

  return {
    track(eventType, step, metadata) {
      sendEvent(eventType, step, metadata)
    },
    identify(email, name, phone) {
      leadEmail = email
      sendEvent('lead_capture', undefined, { email, name, phone })
    },
    page(step) {
      sendEvent('view', step)
    },
  }
}
