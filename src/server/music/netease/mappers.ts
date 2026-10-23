import type { CatalogAlbum, CatalogArtist, CatalogPlaylist, CatalogTrack } from '../types';

export type Raw = Record<string, unknown>;
export const record = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
export const rows = (value: unknown): Raw[] => (Array.isArray(value) ? value.map(record) : []);
export const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
export const num = (value: unknown) => (value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined);

export const SOURCE = 'netease' as const;

/** HTTPS and a server-side thumbnail size keep covers light. */
export function image(value: unknown, size = 400) {
  const url = text(value).replace(/^http:/, 'https:');
  if (!url.startsWith('https://')) return undefined;
  return `${url.split('?')[0]}?param=${size}y${size}`;
}

/** Song objects use `ar/al/dt` (v3 detail, cloudsearch) or `artists/album/duration` (legacy). */
export function mapTrack(song: Raw, coverSize = 200): CatalogTrack {
  const album = record(song.al ?? song.album);
  const artists = rows(song.ar ?? song.artists).map(artist => ({ id: text(artist.id), name: text(artist.name) })).filter(artist => artist.name);
  const ms = num(song.dt ?? song.duration);
  return {
    id: text(song.id),
    source: SOURCE,
    title: text(song.name) || '未知歌曲',
    artist: artists.map(artist => artist.name).join(' / ') || '未知歌手',
    artists,
    album: text(album.name) || undefined,
    albumId: text(album.id) || undefined,
    cover: image(album.picUrl, coverSize),
    duration: ms ? Math.round(ms / 1000) : undefined,
    // fee 1 = VIP-only, 4 = paid album (NetEase convention).
    vip: song.fee === 1 || song.fee === 4,
  };
}

export function mapPlaylist(item: Raw, tag?: string): CatalogPlaylist {
  const tags = Array.isArray(item.tags) ? item.tags.map(text).filter(Boolean) : [];
  return {
    id: text(item.id),
    source: SOURCE,
    name: text(item.name),
    cover: image(item.picUrl ?? item.coverImgUrl),
    trackCount: num(item.trackCount),
    playCount: num(item.playCount),
    creator: text(record(item.creator).nickname) || undefined,
    tag: tag || text(item.copywriter) || tags[0] || undefined,
  };
}

export function mapAlbum(album: Raw): CatalogAlbum {
  const artists = rows(album.artists).map(artist => text(artist.name)).filter(Boolean);
  return {
    id: text(album.id),
    source: SOURCE,
    name: text(album.name),
    artist: artists.join(' / ') || text(record(album.artist).name) || '未知歌手',
    cover: image(album.picUrl),
    trackCount: num(album.size),
    publishTime: num(album.publishTime),
  };
}

export function mapArtist(artist: Raw): CatalogArtist {
  const alias = Array.isArray(artist.alias) ? artist.alias.map(text).filter(Boolean) : [];
  return {
    id: text(artist.id),
    source: SOURCE,
    name: text(artist.name),
    avatar: image(artist.img1v1Url ?? artist.picUrl, 300),
    alias: alias[0],
    songCount: num(artist.musicSize),
    albumCount: num(artist.albumSize),
  };
}
