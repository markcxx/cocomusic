'use client';
import { useSyncExternalStore } from 'react';

let current: string | null = null;
const listeners = new Set<() => void>();
export const CONCEPT_VERIFIED_EVENT = 'coco:concept-verified';
export function requestKugouVerification(value?: string) {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.origin !== 'https://h5.kugou.com' || url.pathname !== '/apps/verify/dist/' || !url.hash.startsWith('#/index/')) return;
    current = url.href;
    listeners.forEach(listener => listener());
  } catch { /* Ignore malformed upstream links. */ }
}
export function dismissKugouVerification() { current = null; listeners.forEach(listener => listener()); }
export function useKugouVerification() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current, () => null);
}
