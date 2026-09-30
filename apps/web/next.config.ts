import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: 'cdn.funnelai.com' },
      { hostname: 'placeholder.funnelai.com' },
      { hostname: '*.amazonaws.com' },
      { hostname: 'img.clerk.com' },
    ],
  },
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
        ],
      },
    ]
  },
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000', 'localhost:3005', 'be-vallid.com', 'www.be-vallid.com', 'app.funnelai.com'] },
  },
}

export default nextConfig
