'use client';

import { persistentStorage } from '@/lib/persistent-storage';

import { useSyncExternalStore } from 'react';
import type { Track } from '@/types/music';

/**
 * 最近播放: the last songs that actually started playing, newest first,
 * one entry per song (replaying moves it to the top). Stored on this machine.
 */
export type RecentPlay = { track: Track; playedAt: number; count: number };

const KEY = 'coco:recent-plays';
const LIMIT = 300;
const listeners = new Set<() => void>();
let cache: RecentPlay[] | null = null;

function read(): RecentPlay[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(persistentStorage.getItem(KEY) ?? '[]') as unknown;
    cache = Array.isArray(parsed)
      ? parsed.filter((item): item is RecentPlay => Boolean(item && typeof item === 'object' && (item as RecentPlay).track?.id && typeof (item as RecentPlay).playedAt === 'number')).slice(0, LIMIT)
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: RecentPlay[]) {
  cache = next;
  try { persistentStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full */ }
  listeners.forEach(listener => listener());
}

export const recentPlays = {
  add(track: Track) {
    const list = read();
    const previous = list.find(item => item.track.id === track.id);
    write([{ track, playedAt: Date.now(), count: (previous?.count ?? 0) + 1 }, ...list.filter(item => item.track.id !== track.id)].slice(0, LIMIT));
  },
  remove(id: string) { write(read().filter(item => item.track.id !== id)); },
  clear() { write([]); },
};

const EMPTY: RecentPlay[] = [];
export function useRecentPlays() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    read,
    () => EMPTY,
  );
}
