import type { SongSource } from '@/lib/catalog-client';
import type { AudioQuality } from '@/server/music/types';
import { isPlayable, type Track } from '@/types/music';
import type { PlayMode } from './play-mode';

const CACHE_TTL_MS = 4 * 60 * 1000;
const cache = new Map<string, { source: SongSource; at: number }>();

const keyFor = (trackId: string, quality: AudioQuality) => `${trackId}:${quality}`;

/**
 * Return the deterministic next playable track in the queue, or null when the
 * next song cannot be known ahead of time (shuffle, single loop, or end of order).
 */
export function pickNextTrack(queue: readonly Track[], currentId: string, mode: PlayMode): Track | null {
  if (mode === 'shuffle' || mode === 'one' || queue.length < 2) return null;
  const currentIndex = queue.findIndex(item => item.id === currentId);
  if (currentIndex < 0) return null;
  for (let offset = 1; offset < queue.length; offset += 1) {
    const candidateIndex = currentIndex + offset;
    if (mode === 'order' && candidateIndex >= queue.length) return null;
    const candidate = queue[candidateIndex % queue.length];
    if (candidate && candidate.id !== currentId && isPlayable(candidate)) return candidate;
  }
  return null;
}

export function rememberPreloadedSource(trackId: string, quality: AudioQuality, source: SongSource, now = Date.now()) {
  if (cache.size > 16) cache.delete(cache.keys().next().value!);
  cache.set(keyFor(trackId, quality), { source, at: now });
}

export function takePreloadedSource(trackId: string, quality: AudioQuality, now = Date.now()): SongSource | null {
  const key = keyFor(trackId, quality);
  const entry = cache.get(key);
  if (!entry) return null;
  cache.delete(key);
  if (now - entry.at > CACHE_TTL_MS) return null;
  return entry.source;
}

export function clearPreloadedSources() {
  cache.clear();
}
