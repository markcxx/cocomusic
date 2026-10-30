'use client';

import { persistentStorage } from '@/lib/persistent-storage';

import { useSyncExternalStore } from 'react';
import { parseHex, toHex } from './color';
import type { AudioQuality } from '@/server/music/types';

/**
 * App settings (renderer side). Stored in Electron userData (localStorage in web preview),
 * shared live with every window of the app (desktop lyrics) over a
 * BroadcastChannel. Main-process settings (startup, global shortcuts, close
 * behaviour) and download settings (server) live elsewhere; see settings page.
 *
 * Only settings that are actually wired up belong here.
 */

/** Theme colour: any "#rrggbb" (presets are just suggestions in the picker). */
export type AccentColor = string;
export type ThemeMode = 'system' | 'light' | 'dark';
/** OS material behind a see-through window. mica: Windows 11 only. */
/** 'transparent': see-through window like the desktop lyrics (applies after a restart). */
export type WindowEffect = 'acrylic' | 'mica' | 'vibrancy' | 'transparent' | 'none';
export type LyricColorId = 'lavender' | 'sunset' | 'mint' | 'sky' | 'white' | 'gold';
/** A preset id, or 'custom' for 设置 › 桌面歌词 › 自定义颜色 (desktopCustomColor). */
export type DesktopColor = LyricColorId | 'custom';
/** Lyrics page layout: cover left + lyrics right, cover centred over two lines, or lyrics only. */
export type LyricsLayout = 'standard' | 'centered' | 'lyrics';
/**
 * Lyrics-page visualizer. Along the progress line: lines / glow; under the
 * cover: mirror; 'vinyl' = the classic record with no effect; around a round
 * spinning cover: melody / ripple / scale.
 */
export type VisualizerTemplate = 'off' | 'lines' | 'glow' | 'mirror' | 'vinyl' | 'melody' | 'ripple' | 'scale' | 'roaming';
export const VISUALIZER_TEMPLATES: readonly VisualizerTemplate[] = ['off', 'lines', 'glow', 'mirror', 'vinyl', 'melody', 'ripple', 'scale', 'roaming'];
/** Effects drawn around the artwork: it turns into a round, spinning cover for them. */
export const isRingTemplate = (template: VisualizerTemplate) => template === 'melody' || template === 'ripple' || template === 'scale';
/** Bottom strip that 经典唱片 can carry (the record itself has no effect). */
export type VinylEffect = 'none' | 'lines' | 'glow';
/** Bottom strip actually shown: lines / glow on their own, or the one paired with 经典唱片. */
export function stripTemplate(template: VisualizerTemplate, vinylEffect: VinylEffect): 'lines' | 'glow' | null {
  if (template === 'lines' || template === 'glow') return template;
  if (template === 'vinyl' && vinylEffect !== 'none') return vinylEffect;
  return null;
}
/** Whether the current pick reads the audio (the stream must load in CORS mode for it). */
export const needsSamples = (template: VisualizerTemplate, vinylEffect: VinylEffect) => template !== 'off' && (template !== 'vinyl' || vinylEffect !== 'none');
/** 'cover' = tinted from the artwork, 'aurora' = hue sweep across the spectrum. */
export type VisualizerColor = 'blue' | 'cover' | 'white' | 'accent' | 'aurora' | 'custom';
export type DoubleClickAction = 'replace' | 'insert';

export interface Settings {
  /* 曲库 */
  /** Platform for browsing, search and the account (songs already queued keep their own). */
  catalogSource: 'netease' | 'qq' | 'kugou';

  /* 外观 */
  themeMode: ThemeMode;
  /** System material behind the window; 'none' = opaque window. */
  windowEffect: WindowEffect;
  /** 0–100: how much of the app's own background is drawn over the material (lower = more desktop shows through). */
  windowOpacity: number;
  /** 0–100: how opaque the frosted panels are (lower = more see-through). */
  glassOpacity: number;
  /** 0–60 px backdrop blur behind panels. */
  glassBlur: number;
  accent: AccentColor;
  /** Turn off non-essential animation regardless of the OS setting. */
  reduceMotion: boolean;
  /** UI zoom, percent. */
  zoom: number;

  /* 播放 */
  quality: AudioQuality;
  /** Fade in on play/resume and out on pause/skip, ms (0 = off). */
  fadeMs: number;
  playbackRate: number;
  /** Audio output device id ('' = system default). */
  outputDevice: string;
  /** On launch, restore the last song and position. */
  resumeOnLaunch: boolean;
  /** Restore the position within the song too (otherwise start of the song). */
  resumePosition: boolean;
  /** Skip to the next song when one fails to play. */
  skipOnError: boolean;
  /** Double-click on a song in a list: replace the queue with the list, or insert after the current song. */
  doubleClick: DoubleClickAction;
  /** Toast when only a preview clip is available. */
  trialNotice: boolean;
  /** Show the VIP tag next to paid songs in lists. */
  showVipBadge: boolean;
  /** Window / taskbar title follows the playing song. */
  titleShowsTrack: boolean;

  /* 歌词页 */
  lyricsFontSize: number;
  lyricsShowTranslation: boolean;
  lyricsBlurInactive: boolean;
  lyricsAlign: 'left' | 'center';
  /** Background: blurred artwork, or a flat dark backdrop. */
  lyricsBackground: 'cover' | 'plain';
  /** Seconds added to playback time when matching lines (+ = earlier lyrics). */
  lyricsOffset: number;
  lyricsSpinCover: boolean;
  /** Keep the display awake while the lyrics page is open and playing. */
  lyricsKeepAwake: boolean;
  /** Lyrics page layout (see LyricsLayout). */
  lyricsLayout: LyricsLayout;
  /** Audio visualizer template (see VisualizerTemplate). */
  lyricsVisualizer: VisualizerTemplate;
  /** 经典唱片 only: a bottom strip to show along with the record. */
  lyricsVinylEffect: VinylEffect;
  lyricsVisualizerColor: VisualizerColor;
  /** Hex used when lyricsVisualizerColor is 'custom'. */
  lyricsVisualizerCustomColor: string;
  /** Bar / point count multiplier: 'fine' doubles the density. */
  lyricsVisualizerDensity: 'normal' | 'fine';

  /* 桌面歌词 */
  desktopFontSize: number;
  desktopColor: DesktopColor;
  /** Hex used when desktopColor is 'custom'. */
  desktopCustomColor: string;
  desktopShowTranslation: boolean;
  /** Second line: translation (if any) or the next lyric line. */
  desktopSecondLine: 'translation' | 'next' | 'none';
  desktopKaraoke: boolean;
  desktopStroke: boolean;
  desktopAlign: 'left' | 'center' | 'right';
  desktopFontWeight: 500 | 700 | 900;

  /* 迷你模式 */
  miniShowLyrics: boolean;
  miniSpinRecord: boolean;

  /* 快捷键 */
  /** In-app: Space play/pause, ⌘/Ctrl+←/→ previous/next, ⌘/Ctrl+↑/↓ volume. */
  appShortcuts: boolean;
  /** Seconds that ← / → skip within the song (0 = off). */
  seekStep: number;

  /* 隐私 */
  /** Remember search keywords on this machine. */
  rememberSearches: boolean;

  /* 通知 */
  toastOnTrackChange: boolean;

  /* 系统托盘 / 菜单栏 */
  /** Icon in the macOS menu bar / Windows notification area / Linux tray. */
  showTray: boolean;
  /** macOS: current lyric line next to the menu-bar icon. */
  trayLyrics: boolean;
  /** macOS: menu-bar lyric text colour ('auto' = follow the system's dark mode). */
  menuBarText: 'white' | 'black' | 'auto';
}

export const DEFAULT_SETTINGS: Settings = {
  catalogSource: 'netease',
  themeMode: 'system',
  windowEffect: 'acrylic',
  windowOpacity: 100,
  glassOpacity: 50,
  glassBlur: 36,
  accent: '#9b87bf',
  reduceMotion: false,
  zoom: 100,

  quality: 'exhigh',
  fadeMs: 300,
  playbackRate: 1,
  outputDevice: '',
  resumeOnLaunch: true,
  resumePosition: true,
  skipOnError: true,
  doubleClick: 'replace',
  trialNotice: true,
  showVipBadge: true,
  titleShowsTrack: true,

  lyricsFontSize: 18,
  lyricsShowTranslation: true,
  lyricsBlurInactive: false,
  lyricsAlign: 'left',
  lyricsBackground: 'cover',
  lyricsOffset: 0,
  lyricsSpinCover: false,
  lyricsKeepAwake: true,
  lyricsLayout: 'standard',
  lyricsVisualizer: 'off',
  lyricsVinylEffect: 'none',
  lyricsVisualizerColor: 'blue',
  lyricsVisualizerCustomColor: '#56a8ff',
  lyricsVisualizerDensity: 'normal',

  desktopFontSize: 34,
  desktopColor: 'lavender',
  desktopCustomColor: '#c9b4ff',
  desktopShowTranslation: true,
  desktopSecondLine: 'translation',
  desktopKaraoke: true,
  desktopStroke: true,
  desktopAlign: 'center',
  desktopFontWeight: 700,

  miniShowLyrics: true,
  miniSpinRecord: true,

  appShortcuts: true,
  seekStep: 5,
  rememberSearches: true,
  showTray: true,
  trayLyrics: true,
  menuBarText: 'white',

  toastOnTrackChange: false,
};

/** Quick picks shown next to the colour picker. */
export const ACCENT_PRESETS: Array<{ label: string; color: string }> = [
  { label: '薰衣草', color: '#9b87bf' },
  { label: '网易红', color: '#e5473e' },
  { label: '海盐蓝', color: '#4a7fd4' },
  { label: '薄荷绿', color: '#3faa86' },
  { label: '樱花粉', color: '#e07aa8' },
  { label: '落日橘', color: '#ec8a3c' },
  { label: '石墨灰', color: '#6b6f86' },
];

/** Desktop lyric fill gradients for the sung part. */
export const LYRIC_COLORS: Record<LyricColorId, { label: string; from: string; to: string }> = {
  lavender: { label: '薰衣草', from: '#f3ecff', to: '#c9b4ff' },
  sunset: { label: '晚霞', from: '#fff1d6', to: '#ff9a7a' },
  mint: { label: '薄荷', from: '#e9fff6', to: '#7ee2c0' },
  sky: { label: '晴空', from: '#eef6ff', to: '#8cc4ff' },
  gold: { label: '流金', from: '#fff8dc', to: '#f4c45a' },
  white: { label: '纯白', from: '#ffffff', to: '#e6e6f0' },
};

/** Gradient for the desktop lyric fill: a preset, or the custom colour fading up from a near-white tint of itself. */
export function desktopLyricColor(prefs: Pick<Settings, 'desktopColor' | 'desktopCustomColor'>): { from: string; to: string } {
  if (prefs.desktopColor !== 'custom') return LYRIC_COLORS[prefs.desktopColor];
  const to = prefs.desktopCustomColor;
  const rgb = parseHex(to);
  if (!rgb) return LYRIC_COLORS.lavender;
  const tint = (c: number) => c + (255 - c) * 0.82;
  return { from: toHex({ r: tint(rgb.r), g: tint(rgb.g), b: tint(rgb.b) }), to };
}

/* ───────── Validation: stored data is untrusted (older versions, hand edits). ───────── */

type Rule = { type: 'number'; min: number; max: number } | { type: 'boolean' } | { type: 'enum'; values: readonly unknown[] } | { type: 'string'; max: number } | { type: 'hex' };
const num = (min: number, max: number): Rule => ({ type: 'number', min, max });
const bool: Rule = { type: 'boolean' };
const oneOf = (...values: readonly unknown[]): Rule => ({ type: 'enum', values });

const RULES: Record<keyof Settings, Rule> = {
  catalogSource: oneOf('netease', 'qq', 'kugou'),
  themeMode: oneOf('system', 'light', 'dark'), windowEffect: oneOf('acrylic', 'mica', 'vibrancy', 'transparent', 'none'), windowOpacity: num(0, 100),
  glassOpacity: num(0, 100), glassBlur: num(0, 60), accent: { type: 'hex' }, reduceMotion: bool, zoom: num(80, 130),
  quality: oneOf('standard', 'higher', 'exhigh', 'lossless', 'hires'), fadeMs: num(0, 2000), playbackRate: num(0.5, 2), outputDevice: { type: 'string', max: 512 },
  resumeOnLaunch: bool, resumePosition: bool, skipOnError: bool, doubleClick: oneOf('replace', 'insert'),
  lyricsFontSize: num(14, 32), lyricsShowTranslation: bool, lyricsBlurInactive: bool, lyricsAlign: oneOf('left', 'center'), lyricsBackground: oneOf('cover', 'plain'), lyricsOffset: num(-5, 5), lyricsSpinCover: bool,
  desktopFontSize: num(20, 64), desktopColor: oneOf(...Object.keys(LYRIC_COLORS), 'custom'), desktopCustomColor: { type: 'hex' }, desktopShowTranslation: bool, desktopSecondLine: oneOf('translation', 'next', 'none'),
  desktopKaraoke: bool, desktopStroke: bool, desktopAlign: oneOf('left', 'center', 'right'), desktopFontWeight: oneOf(500, 700, 900),
  miniShowLyrics: bool, miniSpinRecord: bool,
  appShortcuts: bool, seekStep: oneOf(0, 5, 10, 15, 30), rememberSearches: bool,
  trialNotice: bool, showVipBadge: bool, titleShowsTrack: bool, lyricsKeepAwake: bool,
  lyricsLayout: oneOf('standard', 'centered', 'lyrics'), lyricsVisualizer: oneOf(...VISUALIZER_TEMPLATES), lyricsVinylEffect: oneOf('none', 'lines', 'glow'), lyricsVisualizerColor: oneOf('blue', 'cover', 'white', 'accent', 'aurora', 'custom'), lyricsVisualizerCustomColor: { type: 'hex' }, lyricsVisualizerDensity: oneOf('normal', 'fine'),
  toastOnTrackChange: bool,
  showTray: bool, trayLyrics: bool, menuBarText: oneOf('white', 'black', 'auto'),
};

function valid<K extends keyof Settings>(key: K, value: unknown): value is Settings[K] {
  const rule = RULES[key];
  switch (rule.type) {
    case 'number': return typeof value === 'number' && Number.isFinite(value) && value >= rule.min && value <= rule.max;
    case 'boolean': return typeof value === 'boolean';
    case 'enum': return rule.values.includes(value);
    case 'string': return typeof value === 'string' && value.length <= rule.max;
    case 'hex': return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  }
}

/** Values from earlier versions of the settings object. */
const LEGACY_ACCENTS: Record<string, string> = { lavender: '#9b87bf', ocean: '#4a6fb3', mint: '#3d8a72', sakura: '#b05a85', sunset: '#bf6f37', graphite: '#555a72' };
function migrate(raw: Record<string, unknown>) {
  const next = { ...raw };
  if (typeof next.accent === 'string' && LEGACY_ACCENTS[next.accent]) next.accent = LEGACY_ACCENTS[next.accent];
  if (typeof next.systemMaterial === 'boolean' && next.windowEffect === undefined) next.windowEffect = next.systemMaterial ? 'acrylic' : 'none';
  // Visualizer templates renamed / retired during development.
  const templates: Record<string, string> = { bars: 'lines', particles: 'ripple', ring: 'scale', wave: 'melody', diorama: 'roaming' };
  if (typeof next.lyricsVisualizer === 'string' && templates[next.lyricsVisualizer]) next.lyricsVisualizer = templates[next.lyricsVisualizer];
  return next;
}

function sanitize(input: unknown): Settings {
  const next = { ...DEFAULT_SETTINGS };
  if (!input || typeof input !== 'object') return next;
  const raw = migrate(input as Record<string, unknown>);
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    const value = (raw as Record<string, unknown>)[key];
    if (valid(key, value)) (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

/* ───────── Store ───────── */

const KEY = 'coco:settings';
const CHANNEL = 'coco:settings';
const listeners = new Set<() => void>();
let cache: Settings | null = null;
let channel: BroadcastChannel | null = null;

function read(): Settings {
  if (cache) return cache;
  try { cache = sanitize(JSON.parse(persistentStorage.getItem(KEY) ?? 'null')); } catch { cache = { ...DEFAULT_SETTINGS }; }
  connect();
  return cache;
}

/** Other windows share the same preference store; they announce changes on the channel. */
function connect() {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = event => {
    if (event.data?.type !== 'settings') return;
    cache = sanitize(event.data.settings);
    listeners.forEach(listener => listener());
  };
}

function write(next: Settings) {
  cache = next;
  try { persistentStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  connect();
  channel?.postMessage({ type: 'settings', settings: next });
  listeners.forEach(listener => listener());
}

export const settings = {
  get: read,
  set<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!valid(key, value)) return;
    const current = read();
    if (current[key] === value) return;
    write({ ...current, [key]: value });
  },
  /** Restore defaults for the given keys (a whole section), or everything. */
  reset(keys?: Array<keyof Settings>) {
    const current = read();
    if (!keys) { write({ ...DEFAULT_SETTINGS }); return; }
    const next = { ...current };
    for (const key of keys) (next as Record<string, unknown>)[key] = DEFAULT_SETTINGS[key];
    write(next);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};

export function useSettings(): Settings {
  return useSyncExternalStore(settings.subscribe, read, () => DEFAULT_SETTINGS);
}

/** Single setting with a setter, for controls. */
export function useSetting<K extends keyof Settings>(key: K): [Settings[K], (value: Settings[K]) => void] {
  const value = useSettings()[key];
  return [value, next => settings.set(key, next)];
}
