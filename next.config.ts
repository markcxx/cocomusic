import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server.js that Electron runs in a utility process.
  output: 'standalone',
  poweredByHeader: false,
  devIndicators: false,
  images: { unoptimized: true },
  // File tracing cannot see through the dynamic paths in src/server/local (user
  // folders), so it falls back to copying the whole project into the standalone
  // server. Nothing at runtime reads these: keep sources, git data, build output
  // and tooling out of the installer.
  outputFileTracingExcludes: {
    '*': [
      './.git/**', './.github/**', './src/**', './electron/**', './scripts/**', './build/**',
      './dist-electron/**', './release/**', './README.md', './LICENSE', './*.log',
      './eslint.config.mjs', './next.config.ts', './tsconfig.json', './tsconfig.tsbuildinfo',
      './electron-builder.yml', './package-lock.json',
      // Traced by Next but unused at runtime: TypeScript (config loading only) and
      // sharp (image optimisation is off: images.unoptimized).
      './node_modules/typescript/**', './node_modules/sharp/**', './node_modules/@img/**',
    ],
  },
};

export default nextConfig;
