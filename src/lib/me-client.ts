'use client';

import { persistentStorage } from './persistent-storage';
import type { LocalPlaylist, LocalPlaylistSummary, PlayerSnapshot, PlaylistOrigin, RecentPlay } from '@/server/user-data/types';
import type { Track } from '@/types/music';

export type { LocalPlaylist, LocalPlaylistSummary, PlayerSnapshot, PlaylistOrigin, RecentPlay } from '@/server/user-data/types';
export { PLAYLIST_NAME_MAX, PLAYLIST_TRACK_LIMIT, QUEUE_LIMIT, RECENT_PLAYS_LIMIT } from '@/server/user-data/types';

export class MeRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

/** Data kept by the app server in coco.db (/api/me/*): playlists, history, the queue. */
async function call<T>(path: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<T> {
  const query = init.query ? `?${new URLSearchParams(init.query)}` : '';
  const response = await fetch(`/api/me/${path}${query}`, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    signal: init.signal ?? AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({ error: '本地数据服务返回了无法解析的数据' }));
  if (!response.ok) throw new MeRequestError(data.error || '本地数据读写失败，请稍后重试', response.status);
  return data as T;
}

const send = <T>(method: 'POST' | 'PUT' | 'PATCH', path: string, body: unknown) => call<T>(path, { method, body: JSON.stringify(body) });

export const meApi = {
  playlists: () => call<{ playlists: LocalPlaylistSummary[] }>('playlists'),
  playlist: (id: string) => call<{ playlist: LocalPlaylist }>('playlists', { query: { id } }),
  createPlaylist: (input: { name: string; description?: string; cover?: string; origin?: PlaylistOrigin; tracks?: Track[] }) =>
    send<{ playlist: LocalPlaylistSummary }>('POST', 'playlists', input),
  renamePlaylist: (id: string, name: string) => send<{ playlist: LocalPlaylistSummary }>('PATCH', 'playlists', { id, name }),
  deletePlaylist: (id: string) => call<{ ok: true }>('playlists', { method: 'DELETE', query: { id } }),
  addTracks: (id: string, tracks: Track[]) => send<{ added: number; playlist: LocalPlaylistSummary }>('POST', 'playlists/tracks', { id, op: 'add', tracks }),
  removeTracks: (id: string, trackIds: string[]) => send<{ playlist: LocalPlaylistSummary }>('POST', 'playlists/tracks', { id, op: 'del', trackIds }),
  recentPlays: () => call<{ plays: RecentPlay[] }>('recent'),
  recordPlay: (track: Track) => send<{ ok: true }>('POST', 'recent', { track }),
  /** One entry, or every entry without `id`. */
  removeRecentPlays: (id?: string) => call<{ ok: true }>('recent', { method: 'DELETE', query: id ? { id } : undefined }),
  player: () => call<PlayerSnapshot>('player'),
  saveQueue: (queue: Track[], currentId?: string) => send<{ ok: true }>('PUT', 'player', { queue, currentId }),
  savePosition: (position: { id: string; t: number }) => send<{ ok: true }>('PUT', 'player', { position }),
};

/** Preference keys where earlier versions kept what now lives in coco.db. */
const LEGACY_KEYS = { recentPlays: 'coco:recent-plays', localPlaylists: 'coco:local-playlists', queue: 'coco:queue', position: 'coco:position' } as const;

let ready: Promise<void> | null = null;

/**
 * Resolves once data from earlier versions has been handed to the server (at
 * most once per install; the server records it). The keys themselves are left
 * alone so an older version still finds them. A failure is not fatal: stores
 * load anyway and the hand-over is tried again on the next launch.
 */
export function storageReady(): Promise<void> {
  ready ??= (async () => {
    try {
      const { pending } = await call<{ pending: boolean }>('legacy');
      if (!pending) return;
      const data = Object.fromEntries(Object.entries(LEGACY_KEYS).map(([name, key]) => [name, persistentStorage.getItem(key)]));
      await send('POST', 'legacy', data);
    } catch (error) {
      console.error('[storage] importing earlier data failed', error);
    }
  })();
  return ready;
}
