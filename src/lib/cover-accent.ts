'use client';

import { useSyncExternalStore } from 'react';

/** The colour taken from the playing song's cover while 设置 › 主题色 › 跟随封面 is on (null = not following). */
let current: string | null = null;
const listeners = new Set<() => void>();

export const coverAccent = {
  get: () => current,
  set(hex: string | null) {
    if (hex === current) return;
    current = hex;
    listeners.forEach(listener => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};

export const useCoverAccent = () => useSyncExternalStore(coverAccent.subscribe, coverAccent.get, () => null);
