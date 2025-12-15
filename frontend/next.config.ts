import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable static export for Azure Static Web Apps
  output: 'export',

  // Enable React strict mode
  reactStrictMode: true,

  // Silence the Turbopack warning by adding empty config
  turbopack: {},

  // Image optimization - must be disabled for static export
  images: {
    unoptimized: true, // Required for static export
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

  // Note: headers() and rewrites() are not supported with output: 'export'
  // These will be ignored during static export
  // You'll need to configure headers in Azure Static Web Apps configuration instead
};

export default nextConfig;