'use client';

import { currentSource } from './catalog-client';
import type { QrLoginState, UserDetail, UserPlaylist, UserProfile } from '@/server/music/types';

export type { QrLoginState, UserDetail, UserPlaylist, UserProfile } from '@/server/music/types';


/** Window event that asks the account store to verify the login now (e.g. a VIP song came back as a preview). */
export const ACCOUNT_RECHECK_EVENT = 'coco:account-recheck';

export class AccountError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<T> {
  // The account belongs to whichever platform is selected in 设置 › 曲库.
  const query = new URLSearchParams({ source: currentSource(), ...(init.query ?? {}) });
  const response = await fetch(`/api/account/${path}?${query}`, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    signal: init.signal ?? AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({ error: '账号服务返回了无法解析的数据' }));
  if (!response.ok) throw new AccountError(data.error || '账号请求失败，请稍后重试', response.status);
  return data as T;
}

const post = <T>(path: string, body: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const accountApi = {
  me: () => call<{ profile: UserProfile | null; expired?: boolean }>('me'),
  detail: (signal?: AbortSignal) => call<{ detail: UserDetail | null }>('me/detail', { signal }),
  logout: () => call<{ ok: true }>('me', { method: 'DELETE' }),
  qrCreate: () => call<{ key: string; url: string; svg: string }>('login/qr', { method: 'POST' }),
  qrCheck: (key: string, signal?: AbortSignal) => call<QrLoginState>('login/qr', { query: { key }, signal }),
  likes: () => call<{ ids: string[] }>('likes'),
  like: (id: string, like: boolean) => post<{ ok: true }>('likes', { id, like }),
  playlists: () => call<{ playlists: UserPlaylist[] }>('playlists'),
  createPlaylist: (name: string, privacy: 'public' | 'private') => post<{ playlist: UserPlaylist }>('playlists', { name, privacy }),
  deletePlaylist: (id: string) => call<{ ok: true }>('playlists', { method: 'DELETE', query: { id } }),
  renamePlaylist: (id: string, name: string) => call<{ ok: true }>('playlists', { method: 'PATCH', body: JSON.stringify({ id, name }) }),
  subscribe: (id: string, subscribe: boolean) => post<{ ok: true }>('playlists/subscription', { id, subscribe }),
  editTracks: (playlistId: string, trackIds: string[], op: 'add' | 'del') => post<{ ok: true }>('playlists/tracks', { playlistId, trackIds, op }),
};
