'use client';

import { useSyncExternalStore } from 'react';
import { persistentStorage } from '@/lib/persistent-storage';
import type { CatalogSource } from '@/server/music/types';
import type { Track } from '@/types/music';

/**
 * 本地歌单: playlists kept on this machine, no login needed. Entries are player
 * tracks, so one playlist can mix NetEase, QQ and Kugou songs with local files.
 */
export type LocalPlaylist = {
  id: string;
  name: string;
  description?: string;
  /** Artwork of the platform playlist it was imported from; otherwise the first song's cover is shown. */
  cover?: string;
  /** Platform playlist or album this one was copied from (导入歌单 / 存为本地歌单). */
  origin?: { kind: 'playlist' | 'album'; source: CatalogSource; id: string };
  tracks: Track[];
  /** Epoch ms. */
  createdAt: number;
  updatedAt: number;
};

/** Name length limit, shared with the platforms' playlist dialogs. */
export const PLAYLIST_NAME_MAX = 40;
/** Same bound as the play queue: keeps the stored list (and the queue it becomes) manageable. */
export const LOCAL_PLAYLIST_TRACK_LIMIT = 2000;

const KEY = 'coco:local-playlists';
const listeners = new Set<() => void>();
let cache: LocalPlaylist[] | null = null;

const isTrack = (value: unknown): value is Track => {
  const track = value as Track | null;
  return Boolean(track && typeof track.id === 'string' && typeof track.title === 'string' && typeof track.coverSeed === 'string');
};

/** Stored data is user-editable on disk: keep only well-formed playlists and songs. */
export function parseLocalPlaylists(raw: string | null): LocalPlaylist[] {
  try {
    const parsed = JSON.parse(raw ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is LocalPlaylist => Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.tracks)))
      .map(item => ({ ...item, tracks: item.tracks.filter(isTrack).slice(0, LOCAL_PLAYLIST_TRACK_LIMIT) }));
  } catch {
    return [];
  }
}

/**
 * Append songs not already in the list, in order, up to the track limit.
 * `added` counts the songs that made it in.
 */
export function mergeTracks(existing: Track[], incoming: Track[]): { tracks: Track[]; added: number } {
  const seen = new Set(existing.map(track => track.id));
  const tracks = existing.slice();
  for (const track of incoming) {
    if (tracks.length >= LOCAL_PLAYLIST_TRACK_LIMIT) break;
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
  }
  return { tracks, added: tracks.length - existing.length };
}

/** Artwork shown for the playlist: the imported cover, else the first song that has one. */
export const localPlaylistCover = (playlist: LocalPlaylist) => playlist.cover ?? playlist.tracks.find(track => track.cover)?.cover;

function read(): LocalPlaylist[] {
  cache ??= parseLocalPlaylists(persistentStorage.getItem(KEY));
  return cache;
}

function write(next: LocalPlaylist[]) {
  try {
    persistentStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    throw new Error('本地歌单保存失败，磁盘空间可能不足');
  }
  cache = next;
  listeners.forEach(listener => listener());
}

function update(id: string, change: (playlist: LocalPlaylist) => LocalPlaylist) {
  const list = read();
  const current = list.find(item => item.id === id);
  if (!current) throw new Error('歌单不存在或已被删除');
  const next = { ...change(current), updatedAt: Date.now() };
  write(list.map(item => (item.id === id ? next : item)));
  return next;
}

const cleanName = (name: string) => {
  const value = name.trim().slice(0, PLAYLIST_NAME_MAX);
  if (!value) throw new Error('请输入歌单名称');
  return value;
};

/** Mutations throw with a user-facing message when the input or the save fails. */
export const localPlaylists = {
  get: (id: string) => read().find(item => item.id === id),
  create(input: { name: string; tracks?: Track[]; description?: string; cover?: string; origin?: LocalPlaylist['origin'] }): LocalPlaylist {
    const now = Date.now();
    const playlist: LocalPlaylist = {
      id: crypto.randomUUID(),
      name: cleanName(input.name),
      description: input.description?.trim() || undefined,
      cover: input.cover,
      origin: input.origin,
      tracks: mergeTracks([], input.tracks ?? []).tracks,
      createdAt: now,
      updatedAt: now,
    };
    // Newest first, like the platforms' own lists.
    write([playlist, ...read()]);
    return playlist;
  },
  rename(id: string, name: string) { update(id, playlist => ({ ...playlist, name: cleanName(name) })); },
  remove(id: string) { write(read().filter(item => item.id !== id)); },
  /** Resolves how many songs were new to the playlist. */
  addTracks(id: string, tracks: Track[]): number {
    let added = 0;
    update(id, playlist => {
      const merged = mergeTracks(playlist.tracks, tracks);
      added = merged.added;
      return { ...playlist, tracks: merged.tracks };
    });
    return added;
  },
  removeTracks(id: string, trackIds: string[]) {
    const drop = new Set(trackIds);
    update(id, playlist => ({ ...playlist, tracks: playlist.tracks.filter(track => !drop.has(track.id)) }));
  },
};

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const EMPTY: LocalPlaylist[] = [];

export function useLocalPlaylists() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function useLocalPlaylist(id: string) {
  return useSyncExternalStore(subscribe, () => localPlaylists.get(id), () => undefined);
}
