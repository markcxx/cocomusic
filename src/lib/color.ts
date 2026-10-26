// Colour helpers for the theme colour picker. Pure functions (no DOM), tested in color.test.ts.

export type Rgb = { r: number; g: number; b: number };
export type Hsv = { h: number; s: number; v: number };
export type Hsl = { h: number; s: number; l: number };

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/** "#abc" / "#aabbcc" (case-insensitive) → rgb, or null. */
export function parseHex(input: string): Rgb | null {
  const hex = input.trim().replace(/^#/, '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  const full = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex;
  const value = Number.parseInt(full, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function toHex({ r, g, b }: Rgb) {
  return `#${[r, g, b].map(c => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

export const rgbTriplet = ({ r, g, b }: Rgb) => `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`;

/** Low-saturation surfaces follow the picked hue without turning panels into accent fills. */
export function surfacePalette(hex: string, scheme: 'light' | 'dark'): Record<string, string> {
  const { h, s } = rgbToHsl(parseHex(hex) ?? parseHex('#9b87bf')!);
  const dark = scheme === 'dark';
  const tone = (lightness: number, saturation = 0.18, hueOffset = 0) =>
    hslToRgb({ h: (h + hueOffset + 360) % 360, s: Math.min(s, saturation), l: lightness });
  const rgb = (l: number, saturation?: number) => rgbTriplet(tone(l, saturation));
  const color = (l: number, saturation?: number) => toHex(tone(l, saturation));
  return {
    '--surface-rgb': rgb(dark ? 0.15 : 0.98),
    '--surface-pinned-rgb': rgb(dark ? 0.13 : 0.96),
    '--raised-rgb': rgb(dark ? 0.24 : 1),
    '--player-rgb': rgb(dark ? 0.12 : 0.98),
    '--popover': `rgba(${rgb(dark ? 0.17 : 0.985)}, ${dark ? 0.96 : 0.95})`,
    '--popover-solid': color(dark ? 0.17 : 0.985),
    '--shell': color(dark ? 0.09 : 0.91, 0.3),
    '--ink-rgb': dark ? '0, 0, 0' : rgb(0.2, 0.12),
    '--cover-scrim': `rgba(${rgb(dark ? 0.05 : 0.15, 0.12)}, ${dark ? 0.5 : 0.38})`,
    '--knob': color(dark ? 0.97 : 1, 0.12),
    '--text-strong': color(dark ? 0.96 : 0.18, 0.12),
    '--text': color(dark ? 0.87 : 0.23, 0.08),
    '--text-secondary': color(dark ? 0.73 : 0.35, 0.08),
    '--text-muted': color(dark ? 0.65 : 0.39, 0.08),
    '--backdrop-base': color(dark ? 0.095 : 0.91, 0.3),
    '--backdrop-primary-rgb': rgb(dark ? 0.3 : 0.83, dark ? 0.4 : 0.55),
    '--backdrop-secondary-rgb': rgbTriplet(tone(dark ? 0.26 : 0.85, 0.4, -25)),
    '--backdrop-tertiary-rgb': rgbTriplet(tone(dark ? 0.28 : 0.86, 0.4, 20)),
    '--backdrop-quaternary-rgb': rgbTriplet(tone(dark ? 0.24 : 0.87, 0.35, -35)),
    '--backdrop-center-rgb': rgb(0.93, 0.35),
  };
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return { h: rgbToHsv({ r, g, b }).h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** WCAG relative luminance. */
export function luminance({ r, g, b }: Rgb) {
  const channel = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Adjust lightness until `color` reaches `ratio` against `background` (or the limit). */
function reachContrast(color: Hsl, background: Rgb, ratio: number, direction: 1 | -1): Hsl {
  let next = { ...color };
  for (let i = 0; i < 40 && contrast(hslToRgb(next), background) < ratio; i += 1) {
    next = { ...next, l: clamp(next.l + direction * 0.02, 0.05, 0.95) };
  }
  return next;
}

export type AccentPalette = {
  accent: string;
  strong: string;
  tint: string;
  tintStrong: string;
  accentRgb: string;
  strongRgb: string;
};

// Contrast targets: the darkest light surface (window shell) and the dark sheet tone.
const LIGHT_SURFACE: Rgb = { r: 220, g: 222, b: 243 };
const DARK_SURFACE: Rgb = { r: 34, g: 31, b: 50 };

/**
 * One picked colour → the four accent tokens, tuned per theme:
 * - `strong` is the readable variant (text, icons, slider fill): at least
 *   4.5:1 against the surface, darker on light / lighter on dark.
 * - `tint` / `tintStrong` are quiet fills (primary buttons, chips).
 * Hue and most of the saturation are kept, so the user's colour stays recognisable.
 */
export function accentPalette(hex: string, scheme: 'light' | 'dark'): AccentPalette {
  const base = parseHex(hex) ?? parseHex('#9b87bf')!;
  const hsl = rgbToHsl(base);
  // Very grey picks still need some colour to read as an accent.
  const s = Math.max(hsl.s, 0.12);
  if (scheme === 'light') {
    const accent = { h: hsl.h, s, l: clamp(hsl.l, 0.42, 0.72) };
    const strong = reachContrast({ h: hsl.h, s: Math.min(1, s * 1.05), l: Math.min(accent.l, 0.5) }, LIGHT_SURFACE, 4.5, -1);
    const tint = { h: hsl.h, s: clamp(s * 0.55, 0.12, 0.6), l: 0.92 };
    const tintStrong = { ...tint, l: 0.87 };
    return pack(accent, strong, tint, tintStrong);
  }
  const accent = { h: hsl.h, s: clamp(s * 0.9, 0.12, 0.85), l: clamp(hsl.l, 0.55, 0.72) };
  const strong = reachContrast({ h: hsl.h, s: clamp(s, 0.2, 0.9), l: Math.max(accent.l, 0.7) }, DARK_SURFACE, 4.5, 1);
  const tint = { h: hsl.h, s: clamp(s * 0.45, 0.12, 0.5), l: 0.26 };
  const tintStrong = { ...tint, l: 0.31 };
  return pack(accent, strong, tint, tintStrong);
}

function pack(accent: Hsl, strong: Hsl, tint: Hsl, tintStrong: Hsl): AccentPalette {
  const [a, st, t, ts] = [accent, strong, tint, tintStrong].map(hslToRgb);
  return { accent: toHex(a), strong: toHex(st), tint: toHex(t), tintStrong: toHex(ts), accentRgb: rgbTriplet(a), strongRgb: rgbTriplet(st) };
}
