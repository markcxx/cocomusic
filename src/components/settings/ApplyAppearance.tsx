'use client';

import { MotionConfig } from 'framer-motion';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { accentPalette, surfacePalette } from '@/lib/color';
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

/**
 * 简约 style: flat neutral surfaces (no theme tint, no glass). Light: grey sidebar
 * and player bar around a white content card; dark: the same layering in charcoal.
 * Static tokens (hover fills, edges, dividers) live in globals.css under
 * html[data-ui-style='minimal']; these are the ones ApplyAppearance otherwise sets inline.
 */
const MINIMAL: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    '--shell': '#f5f5f5',
    '--surface-rgb': '255, 255, 255',
    '--surface-pinned-rgb': '255, 255, 255',
    '--raised-rgb': '255, 255, 255',
    '--player-rgb': '245, 245, 245',
    '--sheet': '#ffffff',
    '--sheet-pinned': 'rgba(255, 255, 255, 0.94)',
    '--card': '#fafafa',
    '--card-hover': '#f2f2f2',
    '--player': '#f5f5f5',
    '--nav-active': 'rgba(0, 0, 0, 0.06)',
    '--popover': 'rgba(255, 255, 255, 0.98)',
    '--popover-solid': '#ffffff',
    '--ink-rgb': '0, 0, 0',
    '--cover-scrim': 'rgba(0, 0, 0, 0.36)',
    '--knob': '#ffffff',
    '--text-strong': '#1f1f1f',
    '--text': '#2b2b2b',
    '--text-secondary': '#595959',
    '--text-muted': '#666666',
  },
  dark: {
    '--shell': '#141415',
    '--surface-rgb': '28, 28, 30',
    '--surface-pinned-rgb': '28, 28, 30',
    '--raised-rgb': '44, 44, 47',
    '--player-rgb': '20, 20, 21',
    '--sheet': '#1c1c1e',
    '--sheet-pinned': 'rgba(28, 28, 30, 0.94)',
    '--card': '#232326',
    '--card-hover': '#2a2a2e',
    '--player': '#141415',
    '--nav-active': 'rgba(255, 255, 255, 0.08)',
    '--popover': 'rgba(36, 36, 39, 0.98)',
    '--popover-solid': '#242427',
    '--ink-rgb': '0, 0, 0',
    '--cover-scrim': 'rgba(0, 0, 0, 0.5)',
    '--knob': '#f2f2f2',
    '--text-strong': '#f2f2f2',
    '--text': '#dcdcdc',
    '--text-secondary': '#a8a8a8',
    '--text-muted': '#999999',
  },
};

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
  if (effect === 'minimal') return 'minimal';
  if (effect === 'none' || !platform) return 'none';
  // The window's own construction decides (main reads the saved setting at launch).
  if (effect === 'transparent' || window.coco?.material === 'transparent') return window.coco?.material === 'transparent' ? 'transparent' : 'none';
  if (platform === 'darwin') return 'vibrancy';
  if (platform === 'win32') return effect === 'vibrancy' ? 'acrylic' : effect;
  return 'none';
}

/** Colour scheme + theme colour only (secondary windows such as the tray panel). */
/** The colour scheme in use: 外观模式, with 跟随系统 resolved. */
export function useResolvedScheme(): 'light' | 'dark' {
  const { themeMode } = useSettings();
  const systemDark = useSystemDark();
  return themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode;
}

export function useSchemeAndAccent(options: { notifyMain?: boolean; scheme?: 'light' | 'dark' } = {}) {
  const s = useSettings();
  const resolved = useResolvedScheme();
  const scheme = options.scheme ?? resolved;
  const notifyMain = options.notifyMain ?? false;

  // Scheme first: surface tokens read the per-scheme base RGB values.
  useEffect(() => {
    document.documentElement.dataset.colorScheme = scheme;
    if (notifyMain) window.coco?.app?.setColorScheme(s.themeMode);
  }, [scheme, s.themeMode, notifyMain]);

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
    for (const [name, value] of Object.entries(surfacePalette(s.accent, scheme))) {
      root.setProperty(name, value);
    }
  }, [s.accent, scheme]);
  return scheme;
}

export function ApplyAppearance({ children }: { children: ReactNode }) {
  const s = useSettings();
  const scheme = useSchemeAndAccent({ notifyMain: true });
  const minimal = s.windowEffect === 'minimal';


  // Whole window: OS material (desktop only) + how much the app paints over it.
  // Window opacity scales the drawn backdrop *and* every panel, so lowering it
  // really lets the (OS-blurred) desktop through the whole window, not just the gaps.
  // Runs after useSchemeAndAccent's effects (and again whenever they do: same deps),
  // so in 简约 mode its flat tokens win over the theme-tinted ones.
  useEffect(() => {
    // A window launched see-through stays so until restart, whatever the setting says now.
    const launchedTransparent = window.coco?.material === 'transparent';
    const effect = launchedTransparent ? 'transparent' : supportedEffect(s.windowEffect, window.coco?.platform);
    // 简约 paints an opaque window: no OS material behind it.
    if (!launchedTransparent) window.coco?.app?.setMaterial(effect === 'minimal' ? 'none' : effect);
    const html = document.documentElement;
    html.dataset.material = effect === 'minimal' ? 'none' : effect;
    html.dataset.uiStyle = minimal ? 'minimal' : 'glass';
    if (minimal) {
      html.style.setProperty('--window-opacity', '1');
      for (const [name, value] of Object.entries(MINIMAL[scheme])) html.style.setProperty(name, value);
      html.style.setProperty('--glass-blur', 'none');
      return;
    }
    // Back from 简约: restore the theme-tinted tones it overwrote.
    for (const [name, value] of Object.entries(surfacePalette(s.accent, scheme))) html.style.setProperty(name, value);
    // Without a material there is nothing behind the window to reveal; stay opaque.
    const opacity = effect === 'none' ? 1 : s.windowOpacity / 100;
    html.style.setProperty('--window-opacity', String(opacity));
    // Panels keep a little body even at 0 so their edges and text stay legible.
    const panelFactor = effect === 'none' ? 1 : 0.12 + 0.88 * opacity;
    for (const [name, rgbVar, alpha] of SURFACES) {
      html.style.setProperty(name, `rgba(var(${rgbVar}), ${(scale(alpha, s.glassOpacity) * panelFactor).toFixed(3)})`);
    }
    html.style.setProperty('--glass-blur', s.glassBlur ? `blur(${s.glassBlur}px) saturate(1.5)` : 'none');
  }, [minimal, scheme, s.accent, s.windowEffect, s.windowOpacity, s.glassOpacity, s.glassBlur]);

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
