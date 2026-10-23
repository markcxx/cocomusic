'use client';

import { useAccount } from '@/components/account/account-store';
import { useLatest } from '@/lib/use-latest';
import { catalogApi, useCatalog } from '@/lib/catalog-client';

/**
 * Like (红心) and comment counts for a song. The like count follows the user's own
 * toggle optimistically: it shifts by how the liked state changed since the fetch.
 */
export function useSongStats(songId?: string) {
  const { isLiked } = useAccount();
  const likedNow = useLatest(isLiked);
  const stats = useCatalog(async signal => {
    if (!songId) return null;
    const data = await catalogApi.songStats(songId, signal);
    // Snapshot alongside the count it belongs to (read in the loader, not during render).
    return { ...data, songId, likedAtLoad: likedNow.current(songId) };
  }, `song-stats:${songId ?? ''}`);

  const data = stats.data;
  if (!songId || !data || data.songId !== songId) return { likeCount: undefined, commentCount: undefined };
  const delta = Number(isLiked(songId)) - Number(data.likedAtLoad);
  return {
    likeCount: data.likeCount === undefined ? undefined : Math.max(0, data.likeCount + delta),
    commentCount: data.commentCount,
  };
}
