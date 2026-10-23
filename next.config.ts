import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server.js that Electron runs in a utility process.
  output: 'standalone',
  poweredByHeader: false,
  devIndicators: false,
  images: { unoptimized: true },
};

export default nextConfig;
