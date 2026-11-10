'use client';

import { useSyncExternalStore } from 'react';
import { persistentStorage } from '@/lib/persistent-storage';

/**
 * The custom window background (换肤 › 背景图), kept as a downscaled JPEG data URL under its
 * own key: the settings object is rewritten on every change and must stay small.
 */
const KEY = 'coco:backdrop-image';
const MAX_EDGE = 1600;
const listeners = new Set<() => void>();
let cache: string | null | undefined;

const read = () => {
  if (cache === undefined) {
    try { cache = persistentStorage.getItem(KEY) || null; } catch { cache = null; }
  }
  return cache;
};
const emit = () => listeners.forEach(listener => listener());

/** Shrink to ≤1600px and re-encode, so a 12MP photo does not end up in storage as is. */
async function toDataUrl(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

export const backdropImage = {
  get: read,
  /** Throws when the file is not a readable image or does not fit in storage. */
  async setFromFile(file: File) {
    const url = await toDataUrl(file);
    persistentStorage.setItem(KEY, url);
    cache = url;
    emit();
  },
  clear() {
    persistentStorage.setItem(KEY, '');
    cache = null;
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};

export const useBackdropImage = () => useSyncExternalStore(backdropImage.subscribe, read, () => null);
