import type { CatalogTrack } from '@/server/music/types';
import type { Track } from '@/types/music';

/** Catalog track → player track. The seed keeps a stable placeholder behind real artwork. */
export function toTrack(item: CatalogTrack): Track {
  return {
    id: `${item.source}:${item.id}`,
    songId: item.id,
    source: item.source,
    title: item.title,
    artist: item.artist,
    album: item.album,
    albumId: item.albumId,
    duration: item.duration,
    cover: item.cover,
    coverSeed: `${item.source}:${item.id}`,
  };
}
