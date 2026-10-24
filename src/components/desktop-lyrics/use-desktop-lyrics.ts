'use client';

import { useEffect, useState } from 'react';

/** Desktop lyrics window visibility (main process owns it). Unavailable in a plain browser. */
export function useDesktopLyrics() {
  const [visible, setVisible] = useState(false);
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const bridge = window.coco?.lyrics;
    if (!bridge) return;
    const timer = setTimeout(() => setAvailable(true), 0);
    const off = bridge.onDesktopChange(setVisible);
    return () => { clearTimeout(timer); off(); };
  }, []);
  return {
    available,
    visible,
    toggle: () => window.coco?.lyrics?.setDesktop('toggle'),
  };
}
