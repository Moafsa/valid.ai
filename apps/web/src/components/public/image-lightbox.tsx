'use client'

import { useEffect } from 'react'

/**
 * A cloned page's real photo gallery/lightbox is always JS-driven (click
 * thumbnail → modal), and that JS is gone (sanitize() strips every
 * <script> during cloning — we don't re-execute arbitrary third-party
 * code on our own hosted clone). Rather than leave every photo inert,
 * this gives EVERY image on the page a generic "click to enlarge"
 * fullscreen view. Not a reproduction of the original gallery/carousel —
 * just enough that clicking a photo does something instead of nothing.
 */
export function ImageLightbox() {
  useEffect(() => {
    const overlay = document.createElement('div')
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,.88);cursor:zoom-out;padding:24px;'
    const img = document.createElement('img')
    img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;'
    overlay.appendChild(img)
    document.body.appendChild(overlay)

    const close = () => {
      overlay.style.display = 'none'
    }
    overlay.addEventListener('click', close)

    const onClick = (e: Event) => {
      const target = e.target as HTMLElement
      if (target.tagName !== 'IMG') return
      const el = target as HTMLImageElement
      const src = el.currentSrc || el.src
      if (!src) return
      // Skip tiny decorative images (icons, logos) — only real photos are
      // worth a fullscreen view.
      const rect = el.getBoundingClientRect()
      if (rect.width < 80 || rect.height < 80) return
      img.src = src
      overlay.style.display = 'flex'
    }
    document.addEventListener('click', onClick, true)

    return () => {
      document.removeEventListener('click', onClick, true)
      overlay.remove()
    }
  }, [])

  return null
}
