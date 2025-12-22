import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // REQUIRED for Azure Static Web Apps - creates 'out' folder
  output: 'export',

  // Must be disabled for static export
  images: {
    unoptimized: true,
  },

  // Better compatibility with static hosting
  trailingSlash: true,

  // Security & Performance
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;