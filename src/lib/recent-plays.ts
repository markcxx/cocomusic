'use client';

import { meApi, RECENT_PLAYS_LIMIT, type RecentPlay } from './me-client';
import { remoteStore } from './remote-store';
import type { Track } from '@/types/music';

export type { RecentPlay } from './me-client';

/**
 * 最近播放: the last songs that actually started playing, newest first, one
 * entry per song (replaying moves it to the top). Kept in coco.db on this machine.
 */
const store = remoteStore(async () => (await meApi.recentPlays()).plays);

/** The change shows at once; a failed write reloads the server's list and rejects. */
const send = (request: Promise<unknown>): Promise<void> => request.then(() => undefined, error => {
  console.error('[recent-plays]', error);
  void store.refresh();
  throw error;
});

export const recentPlays = {
  add(track: Track) {
    store.update(list => {
      const previous = list.find(item => item.track.id === track.id);
      const entry: RecentPlay = { track, playedAt: Date.now(), count: (previous?.count ?? 0) + 1 };
      return [entry, ...list.filter(item => item.track.id !== track.id)].slice(0, RECENT_PLAYS_LIMIT);
    });
    void send(meApi.recordPlay(track)).catch(() => undefined);
  },
  remove(id: string) {
    store.update(list => list.filter(item => item.track.id !== id));
    return send(meApi.removeRecentPlays(id));
  },
  clear() {
    store.update(() => []);
    return send(meApi.removeRecentPlays());
  },
};

/** Newest first; undefined until loaded. */
export const useRecentPlays = () => store.use();
