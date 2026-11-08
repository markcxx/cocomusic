'use client';

import { useSyncExternalStore } from 'react';
import { meApi, MeRequestError, type LocalPlaylist, type LocalPlaylistSummary, type PlaylistOrigin } from './me-client';
import { remoteStore } from './remote-store';
import type { Track } from '@/types/music';

/**
 * 本地歌单 on the client: summaries for the sidebar and menus, plus the songs
 * of playlists that are open. The server (coco.db) is the source of truth;
 * mutations resolve with its answer and throw with a user-facing message.
 */

const summaries = remoteStore(async () => (await meApi.playlists()).playlists);

/** An open playlist: its songs, or why they could not be loaded. */
export type PlaylistEntry = { playlist?: LocalPlaylist; error?: string; missing?: boolean };
const details = new Map<string, PlaylistEntry>();
const detailListeners = new Set<() => void>();
const emitDetails = () => detailListeners.forEach(listener => listener());

function setDetail(id: string, entry: PlaylistEntry) {
  details.set(id, entry);
  emitDetails();
}

async function loadDetail(id: string): Promise<LocalPlaylist> {
  try {
    const { playlist } = await meApi.playlist(id);
    setDetail(id, { playlist });
    return playlist;
  } catch (error) {
    const missing = error instanceof MeRequestError && error.status === 404;
    setDetail(id, { missing, error: error instanceof Error ? error.message : '歌单加载失败' });
    throw error;
  }
}

/** Keep the sidebar entry and an open detail in step with the server's summary. */
function applySummary(summary: LocalPlaylistSummary, placement: 'prepend' | 'replace' = 'replace') {
  summaries.update(list => (placement === 'prepend'
    ? [summary, ...list.filter(item => item.id !== summary.id)]
    : list.map(item => (item.id === summary.id ? summary : item))));
  const open = details.get(summary.id)?.playlist;
  if (open) setDetail(summary.id, { playlist: { ...open, ...summary } });
}

export const localPlaylists = {
  /** The playlist with its songs (fresh from the server). */
  load: loadDetail,
  async create(input: { name: string; tracks?: Track[]; description?: string; cover?: string; origin?: PlaylistOrigin }) {
    const { playlist } = await meApi.createPlaylist(input);
    applySummary(playlist, 'prepend');
    return playlist;
  },
  async rename(id: string, name: string) {
    const { playlist } = await meApi.renamePlaylist(id, name);
    applySummary(playlist);
  },
  async remove(id: string) {
    await meApi.deletePlaylist(id);
    summaries.update(list => list.filter(item => item.id !== id));
    setDetail(id, { missing: true, error: '歌单已被删除' });
  },
  /** Resolves how many songs were new to the playlist. */
  async addTracks(id: string, tracks: Track[]) {
    const { added, playlist } = await meApi.addTracks(id, tracks);
    applySummary(playlist);
    if (added && details.get(id)?.playlist) void loadDetail(id).catch(() => undefined);
    return added;
  },
  async removeTracks(id: string, trackIds: string[]) {
    // Rows disappear at once; a failure reloads the playlist and reports.
    const open = details.get(id)?.playlist;
    const drop = new Set(trackIds);
    if (open) setDetail(id, { playlist: { ...open, tracks: open.tracks.filter(track => !drop.has(track.id)) } });
    try {
      const { playlist } = await meApi.removeTracks(id, trackIds);
      applySummary(playlist);
    } catch (error) {
      if (open) void loadDetail(id).catch(() => undefined);
      throw error;
    }
  },
};

/** Summaries, newest first; undefined until loaded. */
export const useLocalPlaylists = () => summaries.use();

/** One playlist with its songs, loaded on first use; undefined while loading. */
export function useLocalPlaylist(id: string): PlaylistEntry | undefined {
  return useSyncExternalStore(
    listener => {
      detailListeners.add(listener);
      if (!details.has(id)) void loadDetail(id).catch(() => undefined);
      return () => { detailListeners.delete(listener); };
    },
    () => details.get(id),
    () => undefined,
  );
}
