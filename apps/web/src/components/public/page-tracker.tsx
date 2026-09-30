'use client'

import { useEffect } from 'react'

/**
 * Sits on the public clone-viewer page (real anonymous visitors, not the
 * owner's dashboard) and does two things with zero visible UI:
 *
 * 1. Fires a "view" beacon once on load — this is what "visitantes" counts
 *    in the dashboard.
 * 2. Intercepts every <form> submit on the page. A cloned page's forms
 *    point at whatever backend the ORIGINAL site used, which doesn't exist
 *    here — left alone they'd just 404. Capturing the fields as a "lead"
 *    and replacing the form with a thank-you message is what "conversões"
 *    counts, and is the whole point of cloning a page: keep the fields the
 *    original owner already designed and tested, but the submission is
 *    now yours.
 */
export function PageTracker({ projectId, pageId }: { projectId: string; pageId: string }) {
  useEffect(() => {
    const beacon = (body: Record<string, unknown>) => {
      const payload = JSON.stringify({ projectId, pageId, ...body })
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }))
      } else {
        fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true })
      }
    }

    beacon({ type: 'view', path: location.pathname, referrer: document.referrer || null })

    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement
      if (form.tagName !== 'FORM') return
      e.preventDefault()

      const formData: Record<string, string> = {}
      new FormData(form).forEach((value, key) => {
        if (typeof value === 'string') formData[key] = value
      })

      beacon({ type: 'lead', path: location.pathname, formData })

      const thankYou = document.createElement('p')
      thankYou.textContent = 'Obrigado! Recebemos suas informações.'
      thankYou.style.cssText = 'padding:1rem;text-align:center;font-weight:600;'
      form.replaceWith(thankYou)
    }

    document.addEventListener('submit', onSubmit, true)
    return () => document.removeEventListener('submit', onSubmit, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
