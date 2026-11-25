import { catalogApi, type CatalogSource } from '@/lib/catalog-client';
import { toTrack } from '@/lib/to-track';
import type { Track } from '@/types/music';

export function freshTracks(batch: Track[], queue: readonly Track[]) {
  const seen = new Set(queue.map(track => track.id));
  return batch.filter(track => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

export async function nextRadioBatch(source: CatalogSource, queue: Track[], signal: AbortSignal) {
  // The station can repeat a batch. Give it another chance without spinning forever.
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    const { tracks } = await catalogApi.personalFm(source, signal);
    const fresh = freshTracks(tracks.map(toTrack), queue);
    if (fresh.length) return fresh;
  }
  throw new Error('电台暂时没有推荐新歌，可点下一首重试');
}
