import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // REMOVED: output: 'export' - Azure Static Web Apps supports Next.js SSR
  // This allows dynamic routes to work without generateStaticParams()

  // Enable React strict mode
  reactStrictMode: true,

  // Silence the Turbopack warning by adding empty config
  turbopack: {},

  // Image optimization
  images: {
    unoptimized: true, // Keep this for Azure SWA compatibility
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'layoutaistorage.blob.core.windows.net',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
    minimumCacheTTL: 60 * 60 * 24 * 60,
  },

  // Add trailing slash for better static hosting compatibility
  trailingSlash: true,

  // Security headers
  poweredByHeader: false,
  generateEtags: true,

  // Azure Static Web Apps will handle routing and headers
  // Configure additional settings in staticwebapp.config.json if needed
};

export default nextConfig;
