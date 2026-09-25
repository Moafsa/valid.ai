'use client'

import { useRef } from 'react'

declare global {
  interface Window {
    vai?: {
      page: (name: string) => void
      event: (type: string, metadata?: Record<string, unknown>) => void
      lead: (data: { email?: string; phone?: string; name?: string }) => void
    }
  }
}

interface VslPlayerProps {
  videoUrl: string
  videoType: string // 'native' | 'youtube' | 'vimeo' | 'wistia' | 'iframe'
  posterUrl: string | null
}

/**
 * Renders the VSL with its real source (re-embedded, not re-hosted) and —
 * for self-hosted <video> tags, which is how VTurb/Converteai-style players
 * work — fires the play/25/50/75/100% checkpoints the product spec asks
 * for ("Play → 25% → 50% → 75% → 100% → CTA"). Iframe embeds (YouTube,
 * Vimeo, Wistia) are cross-origin, so we can only track that the embed was
 * shown, not real playback progress, without each provider's own postMessage API.
 */
export function VslPlayer({ videoUrl, videoType, posterUrl }: VslPlayerProps) {
  const firedMarks = useRef<Set<number>>(new Set())
  const hasPlayed = useRef(false)

  if (videoType !== 'native') {
    // Best-effort iframe re-embed for hosted players we don't control.
    return (
      <div style={{ position: 'relative', paddingTop: '56.25%', background: '#000' }}>
        <iframe
          src={videoUrl}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          onLoad={() => window.vai?.event('video_view', { videoType })}
        />
      </div>
    )
  }

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget
    if (!video.duration) return
    const percent = Math.floor((video.currentTime / video.duration) * 100)
    ;[25, 50, 75, 100].forEach(mark => {
      if (percent >= mark && !firedMarks.current.has(mark)) {
        firedMarks.current.add(mark)
        window.vai?.event('video_progress', { percent: mark })
      }
    })
  }

  const handlePlay = () => {
    if (!hasPlayed.current) {
      hasPlayed.current = true
      window.vai?.event('video_play')
    }
  }

  return (
    <video
      src={videoUrl}
      poster={posterUrl || undefined}
      controls
      playsInline
      style={{ width: '100%', display: 'block', background: '#000' }}
      onPlay={handlePlay}
      onTimeUpdate={handleTimeUpdate}
    />
  )
}
