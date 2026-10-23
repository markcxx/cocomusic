import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Images come from remote music CDNs and load from the local app server;
      // next/image optimisation is disabled (images.unoptimized) by design.
      '@next/next/no-img-element': 'off',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'dist-electron/**', 'release/**', 'next-env.d.ts']),
]);
