'use client';

import { useCallback, useEffect, useState } from 'react';
import { settings as appSettings, useSettings } from './settings';
import type { ArtistDirectoryQuery } from './artist-directory';
import type { ArtistDirectoryPage } from '@/server/music/artist-directory';
import { useLatest } from './use-latest';
import type {
  ArtistBiography, ArtistInfo, AudioQuality, BestMatch, CatalogAlbum, CatalogSource, CatalogArtist, CatalogChart, CatalogTrack, CategoryGroup, CollectionDetail, CommentPage, CommentSort, HomeFeatured, Lyrics,
  PlaylistOrder, PlaylistPage, SearchDiscovery, SearchResult, SearchSuggestion, SearchType, SongSource, SongStats,
} from '@/server/music/types';

export type {
  ArtistInfo, AudioQuality, CatalogAlbum, CatalogArtist, CatalogChart, CatalogPlaylist, CatalogSource, CatalogTrack, CategoryGroup, CollectionDetail, CollectionInfo, CommentPage, CommentSort,
  LyricLine, Lyrics, PlaylistOrder, PlaylistPage, SearchDiscovery, SearchResult, SearchSuggestion, SearchType, SongComment, SongSource, SongStats,
} from '@/server/music/types';

/**
 * Browsing goes to the platform chosen in 设置 › 曲库; song-scoped calls
 * (url, lyrics, stats, comments) pass the song's own platform so a queued
 * NetEase song keeps playing after switching to QQ, and vice versa.
 */
let source: CatalogSource = 'netease';
let synced = false;
/** Explicit override (tests); normally the source follows the setting. */
export const setCatalogSource = (value: CatalogSource) => { source = value; synced = true; };
export const currentSource = (): CatalogSource => {
  // Read lazily from settings so the very first request already uses the saved platform.
  if (!synced && typeof window !== 'undefined') {
    synced = true;
    source = appSettings.get().catalogSource;
    appSettings.subscribe(() => { source = appSettings.get().catalogSource; });
  }
  return source;
};

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal, from: CatalogSource = currentSource()): Promise<T> {
  const query = new URLSearchParams({ source: from });
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value));
  const response = await fetch(`/api/music/${path}?${query}`, { signal: signal ?? AbortSignal.timeout(30000) });
  const data = await response.json().catch(() => ({ error: '曲库返回了无法解析的数据' }));
  if (!response.ok) throw new Error(data.error || '曲库请求失败，请稍后重试');
  return data as T;
}

export const catalogApi = {
  artistDirectory: (query: ArtistDirectoryQuery, signal?: AbortSignal) => get<ArtistDirectoryPage>('artists', { ...query }, signal),
  featured: (signal?: AbortSignal) => get<HomeFeatured>('home', { section: 'featured' }, signal),
  newReleases: (signal?: AbortSignal) => get<{ tracks: CatalogTrack[]; albums: CatalogAlbum[] }>('home', { section: 'new' }, signal),
  artists: (signal?: AbortSignal) => get<{ artists: CatalogArtist[] }>('home', { section: 'artists' }, signal),
  charts: (limit = 8, signal?: AbortSignal) => get<{ charts: CatalogChart[] }>('charts', { limit }, signal),
  categories: (signal?: AbortSignal) => get<{ groups: CategoryGroup[] }>('categories', {}, signal),
  playlists: (query: { category: string; order: PlaylistOrder; cursor?: string; limit?: number }, signal?: AbortSignal) =>
    get<PlaylistPage>('playlists', { ...query, limit: query.limit ?? 24 }, signal),
  playlist: (id: string, offset = 0, limit = 50, signal?: AbortSignal) => get<CollectionDetail>('playlist', { id, offset, limit }, signal),
  album: (id: string, signal?: AbortSignal) => get<CollectionDetail>('album', { id }, signal),
  search: (keyword: string, type: SearchType, offset = 0, limit = 30, signal?: AbortSignal) => get<SearchResult>('search', { keyword, type, offset, limit }, signal),
  suggest: (keyword: string, signal?: AbortSignal) => get<SearchSuggestion>('search/suggest', { keyword }, signal),
  bestMatch: (keyword: string, signal?: AbortSignal) => get<BestMatch>('search/best', { keyword }, signal),
  artist: (id: string, signal?: AbortSignal) => get<ArtistInfo>('artist', { id, section: 'info' }, signal),
  artistBiography: (id: string, signal?: AbortSignal) => get<ArtistBiography>('artist', { id, section: 'biography' }, signal),
  artistSongs: (id: string, offset = 0, limit = 50, signal?: AbortSignal) => get<{ items: CatalogTrack[]; total: number; hasMore: boolean }>('artist', { id, section: 'songs', offset, limit }, signal),
  artistAlbums: (id: string, offset = 0, limit = 30, signal?: AbortSignal) => get<{ items: CatalogAlbum[]; total: number; hasMore: boolean }>('artist', { id, section: 'albums', offset, limit }, signal),
  searchDiscovery: (signal?: AbortSignal) => get<SearchDiscovery>('search/hot', {}, signal),
  songSource: (id: string, signal?: AbortSignal, quality?: AudioQuality, from?: CatalogSource) => get<SongSource>('song', { id, section: 'url', quality }, signal, from),
  lyrics: (id: string, signal?: AbortSignal, from?: CatalogSource) => get<Lyrics>('song', { id, section: 'lyrics' }, signal, from),
  songStats: (id: string, signal?: AbortSignal, from?: CatalogSource) => get<SongStats>('song', { id, section: 'stats' }, signal, from),
  comments: (id: string, sort: CommentSort, cursor?: string, signal?: AbortSignal, from?: CatalogSource) => get<CommentPage>('song', { id, section: 'comments', sort, cursor, limit: 20 }, signal, from),
};

export type Resource<T> = { data: T | null; loading: boolean; error: string; retry: () => void };

/**
 * Load once per `key`; aborts stale requests when the key changes or the component unmounts.
 * Loading is derived (the settled result belongs to a different request), so the
 * effect never sets state synchronously.
 */
export function useCatalog<T>(load: (signal: AbortSignal) => Promise<T>, key: string): Resource<T> {
  const [revision, setRevision] = useState(0);
  // Browsing data belongs to the selected platform: switching it reloads every resource.
  const platform = useSettings().catalogSource;
  const request = `${platform}:${key}#${revision}`;
  const [settled, setSettled] = useState<{ request: string; data: T | null; error: string } | null>(null);
  const loader = useLatest(load);

  useEffect(() => {
    const controller = new AbortController();
    loader.current(controller.signal)
      .then(data => { if (!controller.signal.aborted) setSettled({ request, data, error: '' }); })
      .catch(error => {
        if (!controller.signal.aborted) setSettled({ request, data: null, error: error instanceof Error ? error.message : '加载失败' });
      });
    return () => controller.abort();
  }, [request, loader]);

  const retry = useCallback(() => setRevision(value => value + 1), []);
  const done = settled?.request === request;
  return { data: done ? settled.data : null, loading: !done, error: done ? settled.error : '', retry };
}

export function formatCount(value?: number) {
  if (value === undefined) return '';
  if (value >= 1e8) return `${(value / 1e8).toFixed(1)}亿`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  return String(value);
}
