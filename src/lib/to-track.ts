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
    artists: item.artists,
    album: item.album,
    albumId: item.albumId,
    duration: item.duration,
    cover: item.cover,
    vip: item.vip,
    coverSeed: `${item.source}:${item.id}`,
  };
}

/**
 * Player track → catalog track, for platform actions (download, add to a
 * platform playlist). Undefined for local files that have no platform song.
 */
export function toCatalogTrack(track: Track): CatalogTrack | undefined {
  if (!track.songId || track.localId) return undefined;
  return {
    id: track.songId,
    source: track.source ?? 'netease',
    title: track.title,
    artist: track.artist,
    artists: track.artists,
    album: track.album,
    albumId: track.albumId,
    cover: track.cover,
    duration: track.duration,
    vip: track.vip,
  };
}

/** The platform songs among player tracks (local files dropped), e.g. for downloading. */
export const catalogTracks = (tracks: Track[]) => tracks.map(toCatalogTrack).filter((item): item is CatalogTrack => Boolean(item));
