'use client';

import { MotionConfig } from 'framer-motion';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useBackdropImage } from '@/lib/backdrop-image';
import { accentPalette, surfacePalette } from '@/lib/color';
import { useCoverAccent } from '@/lib/cover-accent';
import { isFlatStyle, settings, useSettings, type WindowEffect } from '@/lib/settings';

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

/**
 * Fluent style: Windows 11 layering. Light: Mica-grey shell, near-white content
 * layer; dark: #202020 shell with a slightly lighter layer. Static tokens (hover
 * fills, edges, radii) live in globals.css under html[data-ui-style='fluent'].
 */
const FLUENT: Record<'light' | 'dark', Record<string, string>> = {
  // Values are WinUI's own (microsoft-ui-xaml Common_themeresources_any.xaml), with the
  // translucent Layer / Card fills flattened onto the base so nothing shows through.
  light: {
    '--shell': '#f3f3f3', // SolidBackgroundFillColorBase
    '--surface-rgb': '249, 249, 249',
    '--surface-pinned-rgb': '249, 249, 249',
    '--raised-rgb': '255, 255, 255',
    '--player-rgb': '243, 243, 243',
    '--sheet': '#f9f9f9', // LayerFillColorDefault on the base
    '--sheet-pinned': 'rgba(249, 249, 249, 0.94)',
    '--card': '#fdfdfd', // CardBackgroundFillColorDefault
    '--card-hover': '#f6f6f6',
    '--player': '#f3f3f3',
    '--nav-active': 'rgba(0, 0, 0, 0.0373)', // SubtleFillColorSecondary
    '--popover': 'rgba(249, 249, 249, 0.98)', // SolidBackgroundFillColorTertiary
    '--popover-solid': '#f9f9f9',
    '--ink-rgb': '0, 0, 0',
    '--cover-scrim': 'rgba(0, 0, 0, 0.36)',
    '--knob': '#ffffff',
    '--text-strong': 'rgba(0, 0, 0, 0.894)', // TextFillColorPrimary
    '--text': 'rgba(0, 0, 0, 0.894)',
    '--text-secondary': 'rgba(0, 0, 0, 0.606)', // TextFillColorSecondary
    '--text-muted': 'rgba(0, 0, 0, 0.553)', // between Secondary and Tertiary: Tertiary alone fails 4.5:1
  },
  dark: {
    '--shell': '#202020',
    '--surface-rgb': '40, 40, 40',
    '--surface-pinned-rgb': '40, 40, 40',
    '--raised-rgb': '50, 50, 50',
    '--player-rgb': '32, 32, 32',
    '--sheet': '#282828',
    '--sheet-pinned': 'rgba(40, 40, 40, 0.94)',
    '--card': '#333333',
    '--card-hover': '#383838',
    '--player': '#202020',
    '--nav-active': 'rgba(255, 255, 255, 0.0605)',
    '--popover': 'rgba(44, 44, 44, 0.98)',
    '--popover-solid': '#2c2c2c',
    '--ink-rgb': '0, 0, 0',
    '--cover-scrim': 'rgba(0, 0, 0, 0.5)',
    '--knob': '#f2f2f2',
    '--text-strong': '#ffffff',
    '--text': '#ffffff',
    '--text-secondary': 'rgba(255, 255, 255, 0.772)',
    '--text-muted': 'rgba(255, 255, 255, 0.63)',
  },
};

const FLAT_PALETTES = { minimal: MINIMAL, fluent: FLUENT };

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
  if (isFlatStyle(effect)) return effect;
  if (effect === 'none' || !platform) return 'none';
  // The window's own construction decides (main reads the saved setting at launch).
  if (effect === 'transparent' || window.coco?.material === 'transparent') return window.coco?.material === 'transparent' ? 'transparent' : 'none';
  if (platform === 'darwin') return 'vibrancy';
  if (platform === 'win32') return effect === 'vibrancy' ? 'acrylic' : effect;
  return 'none';
}

/** A window launched transparent keeps its material until restart. */
export function useFluentStyle() {
  const effect = useSettings().windowEffect;
  return effect === 'fluent' && (typeof window === 'undefined' || window.coco?.material !== 'transparent');
}

/** The colour actually driving Fluent controls, before per-surface contrast adjustment. */
export function useFluentAccent() {
  const fluent = useFluentStyle();
  const s = useSettings();
  const cover = useCoverAccent();
  return fluent ? (s.accentFollowsCover && cover ? cover : s.accent) : undefined;
}

export function useThemeColorPicker() {
  const s = useSettings();
  const fluentAccent = useFluentAccent();
  return {
    value: fluentAccent ?? s.accent,
    onChange(hex: string) {
      settings.set('accent', hex);
      if (fluentAccent) settings.set('accentFollowsCover', false);
    },
  };
}

/** The colour scheme in use: 外观模式, with 跟随系统 resolved. */
export function useResolvedScheme(): 'light' | 'dark' {
  const { themeMode } = useSettings();
  const systemDark = useSystemDark();
  return themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode;
}

export function useSchemeAndAccent(options: { notifyMain?: boolean; scheme?: 'light' | 'dark'; accent?: string } = {}) {
  const s = useSettings();
  const accent = options.accent ?? s.accent;
  const fluent = useFluentStyle();
  const resolved = useResolvedScheme();
  const scheme = options.scheme ?? resolved;
  const notifyMain = options.notifyMain ?? false;

  // Scheme first: surface tokens read the per-scheme base RGB values.
  useEffect(() => {
    document.documentElement.dataset.colorScheme = scheme;
    if (notifyMain) window.coco?.app?.setColorScheme(s.themeMode);
  }, [scheme, s.themeMode, notifyMain]);

  useEffect(() => {
    const palette = accentPalette(accent, scheme);
    const root = document.documentElement.style;
    root.setProperty('--accent', fluent ? palette.strong : palette.accent);
    root.setProperty('--accent-strong', palette.strong);
    root.setProperty('--accent-tint', palette.tint);
    root.setProperty('--accent-tint-strong', palette.tintStrong);
    root.setProperty('--accent-rgb', fluent ? palette.strongRgb : palette.accentRgb);
    if (fluent) root.setProperty('--fluent-accent-on-dark', accentPalette(accent, 'dark').strong);
    else root.removeProperty('--fluent-accent-on-dark');
    root.setProperty('--accent-strong-rgb', palette.strongRgb);
    root.setProperty('--accent-soft', `rgba(${palette.accentRgb}, ${scheme === 'dark' ? 0.2 : 0.16})`);
    for (const [name, value] of Object.entries(surfacePalette(accent, scheme))) {
      root.setProperty(name, value);
    }
  }, [accent, scheme, fluent]);
  return scheme;
}

export function ApplyAppearance({ children }: { children: ReactNode }) {
  const s = useSettings();
  // 跟随封面: the colour of the playing song's cover stands in for the chosen theme colour.
  const coverAccent = useCoverAccent();
  const accent = s.accentFollowsCover && coverAccent ? coverAccent : s.accent;
  const scheme = useSchemeAndAccent({ notifyMain: true, accent });
  const image = useBackdropImage();


  // Whole window: OS material (desktop only) + how much the app paints over it.
  // Window opacity scales the drawn backdrop *and* every panel, so lowering it
  // really lets the (OS-blurred) desktop through the whole window, not just the gaps.
  // Runs after useSchemeAndAccent's effects (and again whenever they do: same deps),
  // so in the flat styles (简约, Fluent) their tokens win over the theme-tinted ones.
  useEffect(() => {
    // A window launched see-through stays so until restart, whatever the setting says now.
    const launchedTransparent = window.coco?.material === 'transparent';
    const effect = launchedTransparent ? 'transparent' : supportedEffect(s.windowEffect, window.coco?.platform);
    // The flat styles paint an opaque window: no OS material behind it.
    if (!launchedTransparent) window.coco?.app?.setMaterial(isFlatStyle(effect) ? 'none' : effect);
    const html = document.documentElement;
    html.dataset.material = isFlatStyle(effect) ? 'none' : effect;
    html.dataset.uiStyle = isFlatStyle(effect) ? effect : 'glass';
    if (isFlatStyle(effect)) {
      html.style.setProperty('--window-opacity', '1');
      for (const [name, value] of Object.entries(FLAT_PALETTES[effect][scheme])) html.style.setProperty(name, value);
      html.style.setProperty('--glass-blur', 'none');
      return;
    }
    // Back from a flat style: restore the theme-tinted tones it overwrote.
    for (const [name, value] of Object.entries(surfacePalette(accent, scheme))) html.style.setProperty(name, value);
    // Without a material there is nothing behind the window to reveal; stay opaque.
    const opacity = effect === 'none' ? 1 : s.windowOpacity / 100;
    html.style.setProperty('--window-opacity', String(opacity));
    // Panels keep a little body even at 0 so their edges and text stay legible.
    const panelFactor = effect === 'none' ? 1 : 0.12 + 0.88 * opacity;
    for (const [name, rgbVar, alpha] of SURFACES) {
      html.style.setProperty(name, `rgba(var(${rgbVar}), ${(scale(alpha, s.glassOpacity) * panelFactor).toFixed(3)})`);
    }
    html.style.setProperty('--glass-blur', s.glassBlur ? `blur(${s.glassBlur}px) saturate(1.5)` : 'none');
  }, [scheme, accent, s.windowEffect, s.windowOpacity, s.glassOpacity, s.glassBlur]);

  // 换肤 › 背景图: drawn by the 毛玻璃 style's backdrop; the flat styles paint plain surfaces and ignore it.
  const showImage = Boolean(image) && !isFlatStyle(s.windowEffect);
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.backdropImage = showImage ? 'true' : 'false';
    if (showImage) html.style.setProperty('--backdrop-image', `url("${image}")`);
    else html.style.removeProperty('--backdrop-image');
    html.style.setProperty('--backdrop-image-blur', `${s.backdropBlur}px`);
    html.style.setProperty('--backdrop-image-dim', String(s.backdropDim / 100));
  }, [showImage, image, s.backdropBlur, s.backdropDim]);

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
