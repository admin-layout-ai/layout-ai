import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',  // Enable static HTML export
  images: {
    unoptimized: true,  // Required for static export
  },
  trailingSlash: true,  // Better compatibility with static hosting
};

export default nextConfig;