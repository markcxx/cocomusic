'use client';

import { useSyncExternalStore } from 'react';

// Recent searches persist across launches (renderer origin is stable per install).
const KEY = 'coco:search-history';
const LIMIT = 12;
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, LIMIT) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: string[]) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  listeners.forEach(listener => listener());
}

export const searchHistory = {
  add(keyword: string) {
    const value = keyword.trim();
    if (value) write([value, ...read().filter(item => item !== value)].slice(0, LIMIT));
  },
  remove(keyword: string) { write(read().filter(item => item !== keyword)); },
  clear() { write([]); },
};

const EMPTY: string[] = [];
export function useSearchHistory() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    read,
    () => EMPTY,
  );
}
