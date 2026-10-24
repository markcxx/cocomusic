import type { CatalogSource } from './types';

/**
 * Catalog ids differ per platform, so route validation is shared here:
 * - netease: numeric ids everywhere.
 * - qq: songs/albums/artists by `mid` (alphanumeric); playlists and charts numeric.
 *   Songs are addressed as "<mid>" or "<mid>.<numericId>" (comments/lyrics need the number).
 * - kugou: songs by "<hash>.<albumId>.<albumAudioId>"; playlists by global collection id
 *   (e.g. collection_3_123_4_0) or numeric rank id; albums/artists numeric.
 * Ids only ever go into upstream query parameters or JSON bodies, never paths or shells,
 * but they are still bounded and charset-limited.
 */
export type IdKind = 'song' | 'playlist' | 'album' | 'artist';

const PATTERNS: Record<CatalogSource, Record<IdKind, RegExp>> = {
  netease: { song: /^\d{1,20}$/, playlist: /^\d{1,20}$/, album: /^\d{1,20}$/, artist: /^\d{1,20}$/ },
  qq: {
    song: /^[0-9A-Za-z]{6,24}(\.\d{1,20})?$/,
    playlist: /^\d{1,20}$/,
    album: /^[0-9A-Za-z]{6,24}$/,
    artist: /^[0-9A-Za-z]{6,24}$/,
  },
  kugou: {
    song: /^[0-9A-Fa-f]{32}(\.\d{0,20}){0,2}$/,
    playlist: /^(\d{1,20}|collection_[0-9_]{3,60}|gcid_[0-9a-z]{4,40})$/,
    album: /^\d{1,20}$/,
    artist: /^\d{1,20}$/,
  },
};

export function validId(source: CatalogSource, kind: IdKind, id: string) {
  return PATTERNS[source]?.[kind].test(id) ?? false;
}

export const isSource = (value: unknown): value is CatalogSource => value === 'netease' || value === 'qq' || value === 'kugou';

/** Display names, used in errors and the settings page. */
export const SOURCE_NAMES: Record<CatalogSource, string> = { netease: '网易云音乐', qq: 'QQ 音乐', kugou: '酷狗音乐' };
