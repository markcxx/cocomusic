'use client';

import { catalogApi, useCatalog, type Lyrics } from '@/lib/catalog-client';
import { localApi } from '@/lib/local-client';
import type { Track } from '@/types/music';

/**
 * Lyrics for any track. Local files use their sidecar .lrc / embedded tags;
 * when those are empty and the file came from a download, fall back online.
 */
export function useTrackLyrics(track: Pick<Track, 'songId' | 'localId' | 'trialClip'>) {
  const { songId, localId, trialClip } = track;
  return useCatalog<Lyrics | null>(async signal => {
    if (localId) {
      const local = await localApi.lyrics(localId, signal).catch(() => null);
      if (local?.lines.length || !songId || trialClip) return local;
    }
    return songId ? catalogApi.lyrics(songId, signal) : null;
  }, `lyrics:${localId ?? ''}:${songId ?? ''}`);
}
