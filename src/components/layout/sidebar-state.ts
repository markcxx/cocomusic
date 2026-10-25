'use client';

import { persistentStorage } from '@/lib/persistent-storage';

import { useSyncExternalStore } from 'react';

// Collapsed/expanded sidebar, persisted across launches.
const KEY = 'coco:sidebar-collapsed';
const listeners = new Set<() => void>();
let collapsed: boolean | null = null;

function read() {
  if (collapsed === null) {
    try { collapsed = persistentStorage.getItem(KEY) === '1'; } catch { collapsed = false; }
  }
  return collapsed;
}

export function setSidebarCollapsed(next: boolean) {
  collapsed = next;
  try { persistentStorage.setItem(KEY, next ? '1' : '0'); } catch { /* storage unavailable */ }
  listeners.forEach(listener => listener());
}

export function useSidebarCollapsed() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    read,
    () => false,
  );
}
