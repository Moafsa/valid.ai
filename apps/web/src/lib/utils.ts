import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function truncateUrl(url: string, maxLength = 40): string {
  if (url.length <= maxLength) return url
  return url.substring(0, maxLength) + '...'
}

// Shared between project creation (naming only, no slug involved anymore)
// and the publish endpoint (where a slug becomes the project's domain) —
// lowercase, non-alphanumeric collapsed to a single "-", no leading/
// trailing "-", so "Minha Oferta!!" and a scanner-derived slug end up in
// the same shape.
export function normalizeSlug(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
