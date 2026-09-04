'use client'

import { useState, useRef, useEffect } from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'

interface VslPlayerProps {
  src: string           // HLS .m3u8 or mp4 video URL
  poster?: string       // Poster thumbnail image
  ctaTimeSeconds?: number // Show CTA button after X seconds
  ctaText?: string
  ctaUrl?: string
  onProgress?: (seconds: number, percent: number) => void
}

export function VslPlayer({
  src,
  poster,
  ctaTimeSeconds = 30,
  ctaText = 'Quero Começar Agora!',
  ctaUrl = '#checkout',
  onProgress,
}: VslPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showCta, setShowCta] = useState(false)

  const togglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleTimeUpdate = () => {
    if (!videoRef.current) return
    const curr = videoRef.current.currentTime
    const dur = videoRef.current.duration || 1
    const pct = (curr / dur) * 100

    setCurrentTime(curr)
    setDuration(dur)
    setProgress(pct)

    if (curr >= ctaTimeSeconds && !showCta) {
      setShowCta(true)
    }

    onProgress?.(Math.round(curr), Math.round(pct))
  }

  return (
    <div className="space-y-6">
      <div className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl bg-black shadow-2xl group">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          className="w-full aspect-video object-cover cursor-pointer"
          onClick={togglePlay}
          playsInline
        />

        {/* Big play button overlay when paused */}
        {!isPlaying && (
          <div
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer transition-opacity"
          >
            <div className="h-20 w-20 rounded-full bg-brand-600 flex items-center justify-center shadow-2xl hover:scale-105 transition-transform">
              <Play className="h-8 w-8 text-white fill-white ml-1" />
            </div>
          </div>
        )}

        {/* Minimal Control Bar */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={togglePlay} className="text-white hover:text-brand-400">
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <div className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <button
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.muted = !isMuted
                setIsMuted(!isMuted)
              }
            }}
            className="text-white hover:text-brand-400"
          >
            {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Timed CTA Button */}
      {showCta && (
        <div className="text-center animate-in fade-in zoom-in duration-500">
          <a
            href={ctaUrl}
            className="inline-flex items-center justify-center rounded-2xl bg-green-600 px-10 py-5 text-xl font-extrabold text-white shadow-2xl hover:bg-green-700 hover:scale-105 transition-all animate-bounce"
          >
            👉 {ctaText}
          </a>
        </div>
      )}
    </div>
  )
}
