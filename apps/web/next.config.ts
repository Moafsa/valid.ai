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
  // the country lookup reads its database files at run time: keep the package out of the bundle and ship its data
  serverExternalPackages: ['geoip-lite'],
  outputFileTracingIncludes: {
    '/api/collect': ['../../node_modules/geoip-lite/**/*'],
    '/api/collect/rec': ['../../node_modules/geoip-lite/**/*'],
    '/api/track': ['../../node_modules/geoip-lite/**/*'],
  },
  async headers() {
    return [
      // the player's own copy of hls.js never changes; the two scripts every clone loads are re-checked every few minutes
      { source: '/hls.min.js', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, immutable' }] },
      { source: '/vai-player.js', headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=86400' }] },
      { source: '/vai-m.js', headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=86400' }] },
      { source: '/vendor/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, immutable' }] },
      { source: '/vai-runtime.js', headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=86400' }] },
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
