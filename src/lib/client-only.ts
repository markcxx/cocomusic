'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => undefined;

/** False during server render and hydration, true afterwards (for portals and browser-only values). */
export function useIsClient() {
  return useSyncExternalStore(noop, () => true, () => false);
}

/** Desktop platform from the preload bridge; 'web' in a plain browser or on the server. */
export function usePlatform(): NodeJS.Platform | 'web' {
  return useSyncExternalStore(noop, () => window.coco?.platform ?? 'web', () => 'web');
}
