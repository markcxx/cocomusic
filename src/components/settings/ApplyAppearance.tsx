'use client';

import { MotionConfig } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { ACCENTS, useSettings } from '@/lib/settings';

/**
 * Applies appearance settings as CSS variables on <html>, so every surface that
 * uses the glass tokens (sheet, player, cards, menus) follows the sliders live.
 *
 * Glass opacity scales each surface's alpha relative to its designed value
 * (50 = as designed). Blur sets --glass-blur.
 */
const SURFACES: Array<[name: string, rgb: string, alpha: number]> = [
  ['--sheet', '246, 246, 255', 0.5],
  ['--sheet-pinned', '238, 237, 252', 0.9],
  ['--card', '255, 255, 255', 0.46],
  ['--card-hover', '255, 255, 255', 0.72],
  ['--player', '244, 244, 255', 0.58],
  ['--nav-active', '255, 255, 255', 0.7],
];

/** opacity 0 → ×0.15, 50 → ×1, 100 → fully opaque. Never fully invisible (text must stay readable). */
function scale(alpha: number, opacity: number) {
  if (opacity <= 50) return alpha * (0.15 + (opacity / 50) * 0.85);
  return alpha + (1 - alpha) * ((opacity - 50) / 50);
}

const hexToRgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
};

export function ApplyAppearance({ children }: { children: ReactNode }) {
  const s = useSettings();

  useEffect(() => {
    const root = document.documentElement.style;
    for (const [name, rgb, alpha] of SURFACES) root.setProperty(name, `rgba(${rgb}, ${scale(alpha, s.glassOpacity).toFixed(3)})`);
    root.setProperty('--glass-blur', s.glassBlur ? `blur(${s.glassBlur}px) saturate(1.5)` : 'none');
    // Backdrop strength follows the slider too: a very clear glass shows more of it.
    root.setProperty('--glass-opacity', String(s.glassOpacity / 100));
    const accent = ACCENTS[s.accent];
    root.setProperty('--accent', accent.accent);
    root.setProperty('--accent-strong', accent.strong);
    root.setProperty('--accent-tint', accent.tint);
    root.setProperty('--accent-tint-strong', accent.tintStrong);
    root.setProperty('--accent-soft', `rgba(${hexToRgb(accent.accent)}, 0.16)`);
    root.setProperty('--accent-rgb', hexToRgb(accent.accent));
    root.setProperty('--accent-strong-rgb', hexToRgb(accent.strong));
    document.documentElement.dataset.reduceMotion = s.reduceMotion ? 'true' : 'false';
  }, [s.glassOpacity, s.glassBlur, s.accent, s.reduceMotion]);

  // UI zoom: Chromium's `zoom` keeps layout crisp (no transform blur) and fixed elements in place.
  useEffect(() => {
    document.documentElement.style.setProperty('zoom', s.zoom === 100 ? '' : String(s.zoom / 100));
  }, [s.zoom]);

  // OS material behind the transparent window (desktop only).
  useEffect(() => {
    window.coco?.app?.setMaterial(s.systemMaterial);
    document.documentElement.dataset.material = s.systemMaterial ? (window.coco?.material ?? 'none') : 'none';
  }, [s.systemMaterial]);

  return (
    <MotionConfig reducedMotion={s.reduceMotion ? 'always' : 'user'} transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.8 }}>
      {children}
    </MotionConfig>
  );
}
