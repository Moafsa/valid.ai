'use client'

import { useEffect } from 'react'

// Pinned versions from a CDN we trust, loaded only when the clone's own
// markup signals it was built with that library — never anything derived
// from the cloned site's own scripts (those are still stripped entirely,
// see image-lightbox.tsx / interactive-runtime.tsx for why). AOS's
// `data-aos="..."` attributes and Swiper's `.swiper`/`.swiper-slide`
// class convention are consistent enough across the sites that use them
// to be a reliable "this site used library X" signal, not a per-site guess.
const CDN = {
  aosCss: 'https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.css',
  aosJs: 'https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.js',
  swiperCss: 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css',
  swiperJs: 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js',
}

function loadStyle(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      if ((existing as any)._loaded) resolve()
      else existing.addEventListener('load', () => resolve())
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.onload = () => {
      ;(script as any)._loaded = true
      resolve()
    }
    script.onerror = () => reject(new Error(`failed to load ${src}`))
    document.body.appendChild(script)
  })
}

/**
 * Re-attaches a small allowlist of well-known, open-source, purely-visual
 * libraries when a clone's markup shows it was built with one — our own
 * pinned copy from a trusted CDN, initialized with sensible defaults (not
 * the original site's exact custom config, which only ever existed in the
 * stripped <script>). This recovers real scroll-reveal/carousel behavior
 * for the large share of sites that use one of these two libraries,
 * without re-introducing the risk of running a site's own arbitrary JS on
 * our hosted domain.
 */
export function LibraryAutoInit() {
  useEffect(() => {
    let cancelled = false

    if (document.querySelector('[data-aos]')) {
      loadStyle(CDN.aosCss)
      loadScript(CDN.aosJs)
        .then(() => {
          if (cancelled) return
          ;(window as any).AOS?.init({ once: true, duration: 700, offset: 80 })
        })
        .catch(() => {})
    }

    if (document.querySelector('.swiper, .swiper-container')) {
      loadStyle(CDN.swiperCss)
      loadScript(CDN.swiperJs)
        .then(() => {
          if (cancelled) return
          const Swiper = (window as any).Swiper
          if (!Swiper) return
          document.querySelectorAll('.swiper, .swiper-container').forEach(el => {
            if ((el as any).swiper) return
            new Swiper(el, {
              loop: true,
              autoplay: { delay: 4000, disableOnInteraction: false },
              pagination: { el: el.querySelector('.swiper-pagination'), clickable: true },
              navigation: {
                nextEl: el.querySelector('.swiper-button-next'),
                prevEl: el.querySelector('.swiper-button-prev'),
              },
            })
          })
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
