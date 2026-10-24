'use client';

import { useAccount } from '@/components/account/account-store';
import { useLatest } from '@/lib/use-latest';
import { catalogApi, currentSource, useCatalog, type CatalogSource } from '@/lib/catalog-client';

/**
 * Like (红心) and comment counts for a song on its own platform. The like
 * count follows the user's own toggle optimistically (only for songs of the
 * platform the account belongs to).
 */
export function useSongStats(songId?: string, source?: CatalogSource) {
  const { isLiked } = useAccount();
  const from = source ?? 'netease';
  const likedNow = useLatest(isLiked);
  const ownPlatform = from === currentSource();
  const stats = useCatalog(async signal => {
    if (!songId) return null;
    const data = await catalogApi.songStats(songId, signal, from);
    // Snapshot alongside the count it belongs to (read in the loader, not during render).
    return { ...data, songId, likedAtLoad: ownPlatform && likedNow.current(songId) };
  }, `song-stats:${from}:${songId ?? ''}`);

  const data = stats.data;
  if (!songId || !data || data.songId !== songId) return { likeCount: undefined, commentCount: undefined };
  const delta = ownPlatform ? Number(isLiked(songId)) - Number(data.likedAtLoad) : 0;
  return {
    likeCount: data.likeCount === undefined ? undefined : Math.max(0, data.likeCount + delta),
    commentCount: data.commentCount,
  };
}
