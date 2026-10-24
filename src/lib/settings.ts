'use client';

import { useSyncExternalStore } from 'react';
import type { AudioQuality } from '@/server/music/types';

/**
 * App settings (renderer side). One flat, versioned object in localStorage,
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
export type WindowEffect = 'acrylic' | 'mica' | 'vibrancy' | 'none';
export type LyricColorId = 'lavender' | 'sunset' | 'mint' | 'sky' | 'white' | 'gold';
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

  /* 桌面歌词 */
  desktopFontSize: number;
  desktopColor: LyricColorId;
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

  /* 通知 */
  toastOnTrackChange: boolean;
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

  lyricsFontSize: 18,
  lyricsShowTranslation: true,
  lyricsBlurInactive: false,
  lyricsAlign: 'left',
  lyricsBackground: 'cover',
  lyricsOffset: 0,
  lyricsSpinCover: false,

  desktopFontSize: 34,
  desktopColor: 'lavender',
  desktopShowTranslation: true,
  desktopSecondLine: 'translation',
  desktopKaraoke: true,
  desktopStroke: true,
  desktopAlign: 'center',
  desktopFontWeight: 700,

  miniShowLyrics: true,
  miniSpinRecord: true,

  appShortcuts: true,

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

/* ───────── Validation: stored data is untrusted (older versions, hand edits). ───────── */

type Rule = { type: 'number'; min: number; max: number } | { type: 'boolean' } | { type: 'enum'; values: readonly unknown[] } | { type: 'string'; max: number } | { type: 'hex' };
const num = (min: number, max: number): Rule => ({ type: 'number', min, max });
const bool: Rule = { type: 'boolean' };
const oneOf = (...values: readonly unknown[]): Rule => ({ type: 'enum', values });

const RULES: Record<keyof Settings, Rule> = {
  catalogSource: oneOf('netease', 'qq', 'kugou'),
  themeMode: oneOf('system', 'light', 'dark'), windowEffect: oneOf('acrylic', 'mica', 'vibrancy', 'none'), windowOpacity: num(0, 100),
  glassOpacity: num(0, 100), glassBlur: num(0, 60), accent: { type: 'hex' }, reduceMotion: bool, zoom: num(80, 130),
  quality: oneOf('standard', 'higher', 'exhigh', 'lossless', 'hires'), fadeMs: num(0, 2000), playbackRate: num(0.5, 2), outputDevice: { type: 'string', max: 512 },
  resumeOnLaunch: bool, resumePosition: bool, skipOnError: bool, doubleClick: oneOf('replace', 'insert'),
  lyricsFontSize: num(14, 32), lyricsShowTranslation: bool, lyricsBlurInactive: bool, lyricsAlign: oneOf('left', 'center'), lyricsBackground: oneOf('cover', 'plain'), lyricsOffset: num(-5, 5), lyricsSpinCover: bool,
  desktopFontSize: num(20, 64), desktopColor: oneOf(...Object.keys(LYRIC_COLORS)), desktopShowTranslation: bool, desktopSecondLine: oneOf('translation', 'next', 'none'),
  desktopKaraoke: bool, desktopStroke: bool, desktopAlign: oneOf('left', 'center', 'right'), desktopFontWeight: oneOf(500, 700, 900),
  miniShowLyrics: bool, miniSpinRecord: bool,
  appShortcuts: bool,
  toastOnTrackChange: bool,
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
  try { cache = sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { cache = { ...DEFAULT_SETTINGS }; }
  connect();
  return cache;
}

/** Other windows write the same localStorage; they announce changes on the channel. */
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
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
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
