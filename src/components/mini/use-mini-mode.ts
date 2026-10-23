'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the window is in mini player mode. The main process owns the state and
 * announces changes; in a plain browser (`dev:web`) `?mini` previews the layout.
 */
export function useMiniMode() {
  const [mini, setMini] = useState(false);
  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).has('mini');
    const timer = preview ? setTimeout(() => setMini(true), 0) : undefined;
    const off = window.coco?.window.onMiniChange?.(setMini);
    return () => { clearTimeout(timer); off?.(); };
  }, []);
  return mini;
}

/** Leave mini mode (desktop), or drop the preview flag (browser). */
export function exitMini() {
  if (window.coco) { window.coco.window.toggleMini(); return; }
  const url = new URL(window.location.href);
  url.searchParams.delete('mini');
  window.location.href = url.toString();
}
