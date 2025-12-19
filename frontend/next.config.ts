import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // REMOVED: output: 'export' - This prevents dynamic routes from working
  // For Azure deployment, use Azure App Service or Azure Static Web Apps with SSR
  
  // Enable React strict mode
  reactStrictMode: true,

  // Image optimization configuration
  images: {
    unoptimized: false, // Changed to false for dynamic rendering
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

  // Changed to false for better dynamic routing
  trailingSlash: false,

  // Security headers
  poweredByHeader: false,
  generateEtags: true,
};

export default nextConfig;