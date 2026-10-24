'use client';

import type { DownloadJob, DownloadSettings } from '@/server/local/downloads';
import type { LocalTrack } from '@/server/local/library';
import type { CatalogTrack, Lyrics } from '@/server/music/types';
import type { Track } from '@/types/music';

export type { DownloadJob, DownloadSettings, DownloadStatus, FileNaming } from '@/server/local/downloads';
export type { LocalTrack } from '@/server/local/library';

async function call<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined
    ? { signal: AbortSignal.timeout(30_000) }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10 * 60_000) });
  const data = await response.json().catch(() => ({ error: '本地服务返回了无法解析的数据' }));
  if (!response.ok) throw new Error(data.error || '操作失败，请稍后重试');
  return data as T;
}

export const localApi = {
  library: () => call<{ folders: string[]; tracks: LocalTrack[] }>('/api/local'),
  scan: (folder: string) => call<{ folder: string; added: number; updated: number; removed: number; total: number }>('/api/local', { action: 'scan', folder }),
  open: (files: string[]) => call<{ tracks: LocalTrack[] }>('/api/local', { action: 'open', files }),
  removeFolder: (folder: string) => call<{ ok: true }>('/api/local', { action: 'remove-folder', folder }),
  remove: (id: string) => call<{ ok: true }>('/api/local', { action: 'remove', id }),
  lyrics: (id: string, signal?: AbortSignal) => fetch(`/api/local/${id}?part=lyrics`, { signal }).then(response => response.json() as Promise<Lyrics>),
};

export const downloadsApi = {
  list: () => call<{ settings: DownloadSettings; jobs: DownloadJob[] }>('/api/downloads'),
  updateSettings: (settings: Partial<Omit<DownloadSettings, 'folder'>>) => call<{ settings: DownloadSettings }>('/api/downloads', { action: 'settings', settings }),
  add: (tracks: CatalogTrack[]) => call<{ added: number; skipped: number }>('/api/downloads', { action: 'add', tracks }),
  cancel: (id: string) => call<{ ok: true }>('/api/downloads', { action: 'cancel', id }),
  retry: (id: string) => call<{ ok: true }>('/api/downloads', { action: 'retry', id }),
  remove: (id: string, deleteFile = false) => call<{ ok: true }>('/api/downloads', { action: 'remove', id, deleteFile }),
  clearFinished: () => call<{ ok: true }>('/api/downloads', { action: 'clear-finished' }),
  setFolder: (folder: string) => call<{ ok: true }>('/api/downloads', { action: 'set-folder', folder }),
};

export const localAudioUrl = (id: string) => `/api/local/${id}?part=audio`;

/** Indexed file → player track. Downloaded files keep their NetEase id for likes and comments. */
export function localToTrack(item: LocalTrack): Track {
  return {
    id: `local:${item.id}`,
    localId: item.id,
    // Clips keep likes/comments, but must not fetch the full song's online lyrics.
    songId: item.remoteId,
    trialClip: item.trial || undefined,
    title: item.title,
    artist: item.artist,
    album: item.album,
    duration: item.duration,
    cover: item.hasCover ? `/api/local/${item.id}?part=cover` : undefined,
    coverSeed: `local:${item.id}`,
  };
}

/** The desktop shell, when present (absent in a plain browser). */
export const desktop = () => (typeof window === 'undefined' ? undefined : window.coco);
