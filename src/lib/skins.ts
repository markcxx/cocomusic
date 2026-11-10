/**
 * 换肤 presets: a theme colour plus the light/dark scheme that suits it. The window's
 * backdrop tones are derived from the colour (see surfacePalette), so a preset needs
 * nothing else. Applies to the 毛玻璃 style.
 */
export type Skin = { id: string; label: string; accent: string; scheme: 'light' | 'dark' };

export const SKINS: readonly Skin[] = [
  { id: 'lavender', label: '薰衣草', accent: '#9b87bf', scheme: 'light' },
  { id: 'sakura', label: '樱花粉', accent: '#e07aa8', scheme: 'light' },
  { id: 'sea-salt', label: '海盐蓝', accent: '#4a7fd4', scheme: 'light' },
  { id: 'mint', label: '薄荷绿', accent: '#3faa86', scheme: 'light' },
  { id: 'sunset', label: '落日橘', accent: '#ec8a3c', scheme: 'light' },
  { id: 'cinnabar', label: '朱砂红', accent: '#e5473e', scheme: 'light' },
  { id: 'midnight', label: '墨夜紫', accent: '#9b87bf', scheme: 'dark' },
  { id: 'deep-sea', label: '深海蓝', accent: '#4a7fd4', scheme: 'dark' },
  { id: 'forest', label: '森林绿', accent: '#3faa86', scheme: 'dark' },
];

/** The preset matching the current colour and scheme, if any. */
export const activeSkin = (accent: string, scheme: 'light' | 'dark') =>
  SKINS.find(skin => skin.accent.toLowerCase() === accent.toLowerCase() && skin.scheme === scheme)?.id ?? null;
