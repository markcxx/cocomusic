'use client';

import { useEffect, useState } from 'react';
import { IconButton } from '@/components/ui';
import { usePlatform } from '@/lib/client-only';
import styles from './WindowControls.module.css';

/* Windows-style glyphs drawn at 1px so they sit crisply next to the toolbar's lucide icons. */
const Minimize = () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M1.5 6h9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>;
const Maximize = () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="1.75" y="1.75" width="8.5" height="8.5" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.1" /></svg>;
const Restore = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <rect x="1.5" y="3.5" width="7" height="7" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.1" />
    <path d="M3.8 1.6h5.1a1.6 1.6 0 0 1 1.6 1.6v5.1" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
  </svg>
);
const Close = () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>;

/**
 * Minimize / maximize / close for the frameless window on Windows and Linux,
 * built from the same IconButton as the toolbar (size, radius, hover fill,
 * tooltip). macOS keeps its native traffic lights.
 */
export function WindowControls() {
  const platform = usePlatform();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const bridge = window.coco?.window;
    if (!bridge?.onMaximizeChange) return;
    void bridge.isMaximized().then(setMaximized).catch(() => undefined);
    return bridge.onMaximizeChange(setMaximized);
  }, []);

  // Plain browser preview ('web') still shows the controls so layout matches the design.
  if (platform === 'darwin') return null;

  return (
    <div className={styles.controls}>
      <span className={styles.divider} aria-hidden />
      <IconButton label="最小化" onClick={() => window.coco?.window.minimize()} iconHover={{ y: 1 }}>
        <Minimize />
      </IconButton>
      <IconButton label={maximized ? '向下还原' : '最大化'} onClick={() => window.coco?.window.toggleMaximize()} iconHover={{ scale: 1.1 }}>
        {maximized ? <Restore /> : <Maximize />}
      </IconButton>
      <IconButton label="关闭" tone="danger" onClick={() => window.coco?.window.close()} iconHover={{ rotate: 90 }}>
        <Close />
      </IconButton>
    </div>
  );
}
