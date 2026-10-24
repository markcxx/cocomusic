'use client';

import { MotionConfig } from 'framer-motion';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { accentPalette } from '@/lib/color';
import { useSettings, type WindowEffect } from '@/lib/settings';

/**
 * Applies appearance settings as CSS variables / data attributes on <html>:
 * - colour scheme (light / dark / follow system) → html[data-color-scheme]
 * - theme colour (any hex) → accent tokens, tuned per scheme for contrast
 * - window: effect (OS material) + window opacity → how much of the app (backdrop
 *   and panels) is drawn over the OS-blurred desktop
 * - panel glass: opacity scales each surface's alpha relative to the window; blur sets --glass-blur
 */
const SURFACES: Array<[name: string, rgbVar: string, alpha: number]> = [
  ['--sheet', '--surface-rgb', 0.5],
  ['--sheet-pinned', '--surface-pinned-rgb', 0.9],
  ['--card', '--raised-rgb', 0.46],
  ['--card-hover', '--raised-rgb', 0.72],
  ['--player', '--player-rgb', 0.58],
  ['--nav-active', '--raised-rgb', 0.7],
];

/** opacity 0 → ×0.15, 50 → ×1, 100 → fully opaque. Never fully invisible (text must stay readable). */
function scale(alpha: number, opacity: number) {
  if (opacity <= 50) return alpha * (0.15 + (opacity / 50) * 0.85);
  return alpha + (1 - alpha) * ((opacity - 50) / 50);
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');
function useSystemDark() {
  return useSyncExternalStore(
    listener => { const query = darkQuery(); query.addEventListener('change', listener); return () => query.removeEventListener('change', listener); },
    () => darkQuery().matches,
    () => false,
  );
}

/** Effects this platform can render (main falls back the same way). */
export function supportedEffect(effect: WindowEffect, platform: string | undefined): WindowEffect {
  if (effect === 'none' || !platform) return 'none';
  if (platform === 'darwin') return 'vibrancy';
  if (platform === 'win32') return effect === 'vibrancy' ? 'acrylic' : effect;
  return 'none';
}

export function ApplyAppearance({ children }: { children: ReactNode }) {
  const s = useSettings();
  const systemDark = useSystemDark();
  const scheme = s.themeMode === 'system' ? (systemDark ? 'dark' : 'light') : s.themeMode;

  // Scheme first: surface tokens below read the per-scheme base RGB values.
  useEffect(() => {
    document.documentElement.dataset.colorScheme = scheme;
    window.coco?.app?.setColorScheme(s.themeMode);
  }, [scheme, s.themeMode]);

  useEffect(() => {
    const palette = accentPalette(s.accent, scheme);
    const root = document.documentElement.style;
    root.setProperty('--accent', palette.accent);
    root.setProperty('--accent-strong', palette.strong);
    root.setProperty('--accent-tint', palette.tint);
    root.setProperty('--accent-tint-strong', palette.tintStrong);
    root.setProperty('--accent-rgb', palette.accentRgb);
    root.setProperty('--accent-strong-rgb', palette.strongRgb);
    root.setProperty('--accent-soft', `rgba(${palette.accentRgb}, ${scheme === 'dark' ? 0.2 : 0.16})`);
  }, [s.accent, scheme]);

  // Whole window: OS material (desktop only) + how much the app paints over it.
  // Window opacity scales the drawn backdrop *and* every panel, so lowering it
  // really lets the (OS-blurred) desktop through the whole window, not just the gaps.
  useEffect(() => {
    const effect = supportedEffect(s.windowEffect, window.coco?.platform);
    window.coco?.app?.setMaterial(effect);
    const html = document.documentElement;
    html.dataset.material = effect;
    // Without a material there is nothing behind the window to reveal; stay opaque.
    const opacity = effect === 'none' ? 1 : s.windowOpacity / 100;
    html.style.setProperty('--window-opacity', String(opacity));
    // Panels keep a little body even at 0 so their edges and text stay legible.
    const panelFactor = effect === 'none' ? 1 : 0.12 + 0.88 * opacity;
    for (const [name, rgbVar, alpha] of SURFACES) {
      html.style.setProperty(name, `rgba(var(${rgbVar}), ${(scale(alpha, s.glassOpacity) * panelFactor).toFixed(3)})`);
    }
    html.style.setProperty('--glass-blur', s.glassBlur ? `blur(${s.glassBlur}px) saturate(1.5)` : 'none');
  }, [s.windowEffect, s.windowOpacity, s.glassOpacity, s.glassBlur]);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = s.reduceMotion ? 'true' : 'false';
  }, [s.reduceMotion]);

  // UI zoom: Chromium's `zoom` keeps layout crisp (no transform blur) and fixed elements in place.
  useEffect(() => {
    document.documentElement.style.setProperty('zoom', s.zoom === 100 ? '' : String(s.zoom / 100));
  }, [s.zoom]);

  return (
    <MotionConfig reducedMotion={s.reduceMotion ? 'always' : 'user'} transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.8 }}>
      {children}
    </MotionConfig>
  );
}
