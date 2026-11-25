import { useEffect } from 'react';
import { catalogApi } from '@/lib/catalog-client';
import { desktop, localAudioUrl } from '@/lib/local-client';
import { needsSamples, settings as appSettings } from '@/lib/settings';
import type { Track } from '@/types/music';
import type { PlayMode } from './play-mode';
import type { PlaybackStatus } from './player-types';
import { pickNextTrack, rememberPreloadedSource } from './preload-next';

/**
 * The visualizer reads samples only from CORS-mode streams; only the desktop
 * app adds the CORS header (a plain browser would fail to load them).
 */
export const visualizerWantsSamples = () => {
  const { lyricsVisualizer, lyricsVinylEffect } = appSettings.get();
  return desktop() && needsSamples(lyricsVisualizer, lyricsVinylEffect);
};

/** Pre-resolve and warm the next track once the current song has settled. */
export function useWarmNext(queue: Track[], trackId: string, mode: PlayMode, status: PlaybackStatus, playing: boolean) {
  useEffect(() => {
    if (status !== 'ready' || !playing) return;
    const next = pickNextTrack(queue, trackId, mode);
    if (!next) return;
    const controller = new AbortController();
    let warm: HTMLAudioElement | null = null;
    const timer = setTimeout(() => {
      const quality = appSettings.get().quality;
      const wantsSamples = visualizerWantsSamples();
      const warmStream = (url: string, isLocal: boolean) => {
        warm = new Audio();
        warm.preload = 'auto';
        warm.volume = 0;
        if (wantsSamples && !isLocal) warm.crossOrigin = 'anonymous';
        warm.src = url;
      };
      if (next.localId) {
        warmStream(localAudioUrl(next.localId), true);
        return;
      }
      if (!next.songId) return;
      catalogApi.songSource(next.songId, controller.signal, quality, next.source)
        .then(source => {
          if (controller.signal.aborted) return;
          rememberPreloadedSource(next.id, quality, source);
          warmStream(source.url, false);
        })
        .catch(() => undefined);
    }, 4000);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (warm) { warm.removeAttribute('src'); warm.load(); warm = null; }
    };
  }, [trackId, queue, mode, status, playing]);
}
