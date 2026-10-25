'use client';

import { useSyncExternalStore } from 'react';

/**
 * Renderer view of the main-process updater (electron/main/updater.ts).
 * One subscription for the whole app; null in the web preview.
 */
let state: CocoUpdateState | null = null;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

function start() {
  if (started || typeof window === 'undefined' || !window.coco?.updates) return;
  started = true;
  const bridge = window.coco.updates;
  bridge.onState(next => { state = next; emit(); });
  void bridge.getState().then(next => { state ??= next; emit(); }).catch(() => undefined);
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useUpdateState = () => useSyncExternalStore(subscribe, () => state, () => null);

const bridge = () => (typeof window === 'undefined' ? undefined : window.coco?.updates);

export const updates = {
  available: () => Boolean(bridge()),
  check: () => bridge()?.check(),
  download: () => bridge()?.download(),
  cancel: () => bridge()?.cancel(),
  install: () => bridge()?.install(),
  skip: (version: string) => bridge()?.skip(version),
  dismiss: (what: 'notify' | 'whatsNew') => bridge()?.dismiss(what),
  setSettings: (patch: Partial<CocoUpdateSettings>) => bridge()?.setSettings(patch),
  changelog: () => bridge()?.changelog() ?? Promise.resolve({ releases: [], error: '需要在桌面客户端中使用' }),
};

/** Dialog the shell shows: the offered update, or what's new after updating. */
type Open = null | 'update' | 'changelog';
let open: Open = null;
const openListeners = new Set<() => void>();
export const updateDialog = {
  show: (which: Exclude<Open, null>) => { open = which; openListeners.forEach(listener => listener()); },
  close: () => { open = null; openListeners.forEach(listener => listener()); },
};
export const useUpdateDialog = () => useSyncExternalStore(
  listener => { openListeners.add(listener); return () => { openListeners.delete(listener); }; },
  () => open,
  () => null,
);

export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}
