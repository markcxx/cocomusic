import { useCallback, useEffect, useState } from 'react';
import { settings, type Settings } from '@/lib/settings';
import type { AudioQuality } from '@/server/music/types';

export const QUALITIES: ReadonlyArray<{ value: AudioQuality; label: string; hint: string }> = [
  { value: 'standard', label: '标准', hint: '128kbps，省流量' },
  { value: 'higher', label: '较高', hint: '192kbps' },
  { value: 'exhigh', label: '极高', hint: '320kbps' },
  { value: 'lossless', label: '无损', hint: 'FLAC，需要会员' },
  { value: 'hires', label: 'Hi-Res', hint: '高解析度，需要会员' },
];

export const keysOf = (...keys: Array<keyof Settings>) => keys;
export const isMac = () => typeof window !== 'undefined' && window.coco?.platform === 'darwin';
export const isDesktop = () => typeof window !== 'undefined' && Boolean(window.coco);
/**
 * Pick a 窗口效果. A window created see-through (透明) stays so until restart, so the main
 * process is told whether the next launch should be transparent.
 */
export const chooseWindowEffect = (effect: Settings['windowEffect']) => {
  settings.set('windowEffect', effect);
  return window.coco?.app?.setSettings({ transparentWindow: effect === 'transparent' });
};
export const setter = <K extends keyof Settings>(key: K) => (value: Settings[K]) => settings.set(key, value);

/** Main-process settings (desktop only). */
export function useAppSettings() {
  const [result, setResult] = useState<CocoAppSettingsResult | null>(null);
  useEffect(() => { void window.coco?.app?.getSettings().then(setResult).catch(() => undefined); }, []);
  const update = useCallback(async (patch: Partial<CocoAppSettings>) => {
    const next = await window.coco?.app?.setSettings(patch).catch(() => null);
    if (next) setResult(next);
    return next;
  }, []);
  return { result, update };
}

export type AppSettings = ReturnType<typeof useAppSettings>;
