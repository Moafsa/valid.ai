'use client'

import { useEffect } from 'react'

/**
 * Every original <script> is stripped during cloning (running arbitrary
 * third-party JS on our own hosted domain is a real XSS/exfiltration risk
 * — see image-lightbox.tsx for the same reasoning applied to galleries).
 * That means every JS-driven interaction — mobile nav toggle, dropdowns,
 * smooth-scroll anchor links — is dead on a cloned page by default.
 *
 * Rather than re-executing the original site's script, this reconstructs
 * the most common, generic interaction patterns from markup the original
 * page already carries:
 *
 * - `aria-expanded`/`aria-controls`: a real, already-present accessibility
 *   contract most menu-toggle/dropdown widgets already declare regardless
 *   of which JS framework built them. Clicking the toggle flips it and
 *   shows/hides the controlled panel — no guessing about class names.
 * - `data-vai-toggle-btn`/`data-vai-toggle-panel`: most sites have NO
 *   aria-expanded at all (plain React/Vue state + a CSS class the scanner
 *   has no way to know). The scanner itself proved which buttons are real
 *   toggles by clicking them during capture (playwright_scraper.py's
 *   `_expand_accordions`) and tagged each button/panel pair it observed
 *   toggle real content — this just rebuilds the click on top of that.
 * - `a[href="#id"]`: same-page anchor links get a smooth scroll instead of
 *   the default instant jump, since the site's own smooth-scroll script
 *   (if any) is gone.
 */
export function InteractiveRuntime() {
  useEffect(() => {
    const onScanTaggedToggleClick = (e: Event) => {
      const btn = (e.target as HTMLElement)?.closest('[data-vai-toggle-btn]') as HTMLElement | null
      if (!btn) return
      const id = btn.getAttribute('data-vai-toggle-btn')
      const panel = document.querySelector(`[data-vai-toggle-panel="${id}"]`) as HTMLElement | null
      if (!panel) return
      // Read the panel's LIVE state rather than trusting whatever it was
      // tagged with at scan time — later scan-time passes (e.g. closing a
      // stray full-screen overlay) can have changed it since.
      const isHidden = getComputedStyle(panel).display === 'none'
      panel.style.setProperty('display', isHidden ? '' : 'none', 'important')
    }
    document.addEventListener('click', onScanTaggedToggleClick, true)

    const onToggleClick = (e: Event) => {
      const target = (e.target as HTMLElement)?.closest('[aria-expanded]') as HTMLElement | null
      if (!target) return

      const wasExpanded = target.getAttribute('aria-expanded') === 'true'
      target.setAttribute('aria-expanded', String(!wasExpanded))

      const controlsId = target.getAttribute('aria-controls')
      let panel = controlsId ? document.getElementById(controlsId) : null

      // No aria-controls given — fall back to the nearest nav/menu-looking
      // sibling inside the same header/nav scope, the common shape for a
      // hamburger button that only ever talked to a sibling via JS classes.
      if (!panel) {
        const scope = target.closest('header, nav, [class*="header"], [class*="navbar"]') || target.parentElement
        const guess = scope?.querySelector('nav, [class*="menu"], [class*="nav-list"], ul') as HTMLElement | null
        if (guess && guess !== target && !guess.contains(target) && !target.contains(guess)) {
          panel = guess
        }
      }

      if (panel) {
        panel.style.setProperty('display', wasExpanded ? 'none' : '', 'important')
      }
    }
    document.addEventListener('click', onToggleClick, true)

    const onAnchorClick = (e: Event) => {
      const a = (e.target as HTMLElement)?.closest('a[href^="#"]') as HTMLAnchorElement | null
      if (!a) return
      const id = a.getAttribute('href')?.slice(1)
      if (!id) return
      const el = document.getElementById(id)
      if (!el) return
      e.preventDefault()
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    document.addEventListener('click', onAnchorClick, true)

    return () => {
      document.removeEventListener('click', onScanTaggedToggleClick, true)
      document.removeEventListener('click', onToggleClick, true)
      document.removeEventListener('click', onAnchorClick, true)
    }
  }, [])

  return null
}
