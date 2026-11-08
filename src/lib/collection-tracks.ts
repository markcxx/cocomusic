'use client';

import { catalogApi, type CatalogSource } from './catalog-client';
import { localPlaylists } from './local-playlists';
import { PLAYLIST_TRACK_LIMIT, type LocalPlaylistSummary } from './me-client';
import { toTrack } from './to-track';
import type { Track } from '@/types/music';

/** A platform playlist or album, on its own platform (undefined = the selected one). */
export type CollectionRef = { kind: 'playlist' | 'album'; id: string; source?: CatalogSource };

const BATCH = 200;

/**
 * Every song of a collection, continuing after `have` (rows already loaded),
 * up to `cap`. Albums arrive whole. A page that fails after some songs were
 * gathered ends the walk with what is there; failing before that throws.
 */
export async function fetchCollectionTracks(ref: CollectionRef, have: Track[] = [], cap = PLAYLIST_TRACK_LIMIT): Promise<Track[]> {
  if (ref.kind === 'album') return have.length ? have : (await catalogApi.album(ref.id, undefined, ref.source)).tracks.map(toTrack);
  const all = [...have];
  while (all.length < cap) {
    let page;
    try {
      page = await catalogApi.playlist(ref.id, all.length, BATCH, undefined, ref.source);
    } catch (error) {
      if (!all.length) throw error;
      break;
    }
    all.push(...page.tracks.map(toTrack));
    if (!page.hasMore || !page.tracks.length) break;
  }
  return all.slice(0, cap);
}

/** Copy a platform playlist or album into a new 本地歌单 (name, description and cover come along). */
export async function saveCollectionLocally(ref: CollectionRef, info: { name: string; description?: string; cover?: string; source: CatalogSource }, have: Track[] = []): Promise<LocalPlaylistSummary> {
  const tracks = await fetchCollectionTracks(ref, have);
  return localPlaylists.create({
    name: info.name,
    description: info.description,
    cover: info.cover,
    origin: { kind: ref.kind, source: info.source, id: ref.id },
    tracks,
  });
}
