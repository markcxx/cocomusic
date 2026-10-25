import type { ArtistInfo, CatalogAlbum, CatalogTrack } from '../types';
import { NeteaseError, neteaseEapi, neteaseRequest } from './client';
import { image, mapAlbum, mapTrack, num, record, rows, SOURCE, text, type Raw } from './mappers';
import { mapBiography } from '../artist-biography';

export async function artistBiography(id: string) {
  const data = await neteaseRequest<Raw>('/artist/introduction', { id });
  return mapBiography(data.briefDesc, data.introduction);
}

/** Artist header: profile, counts, biography (eapi artist/head/info). */
export async function artistInfo(id: string): Promise<ArtistInfo> {
  const data = await neteaseEapi<Raw>('/api/artist/head/info/get', { id });
  const artist = record(record(data.data).artist);
  if (!text(artist.id)) throw new NeteaseError('歌手不存在', 404);
  const alias = [...(Array.isArray(artist.alias) ? artist.alias : []), ...(Array.isArray(artist.transNames) ? artist.transNames : [])].map(text).filter(Boolean);
  return {
    id: text(artist.id),
    source: SOURCE,
    name: text(artist.name),
    avatar: image(artist.avatar ?? artist.cover, 400),
    cover: image(artist.cover ?? artist.avatar, 1200),
    alias: [...new Set(alias)],
    identity: text(record(record(data.data).identify).imageDesc) || (Array.isArray(artist.identities) ? artist.identities.map(text).join('、') : '') || undefined,
    description: text(artist.briefDesc) || undefined,
    songCount: num(artist.musicSize),
    albumCount: num(artist.albumSize),
  };
}

/** Artist songs by popularity, offset-paged (eapi v1/artist/songs; bodies include covers). */
export async function artistSongs(id: string, offset: number, limit: number): Promise<{ items: CatalogTrack[]; total: number; hasMore: boolean }> {
  const data = await neteaseEapi<Raw>('/api/v1/artist/songs', { id, private_cloud: 'true', work_type: 1, order: 'hot', offset, limit });
  const items = rows(data.songs).map(song => mapTrack(song));
  const total = num(data.total) ?? offset + items.length;
  return { items, total, hasMore: data.more === true && items.length > 0 };
}

export async function artistAlbums(id: string, offset: number, limit: number): Promise<{ items: CatalogAlbum[]; total: number; hasMore: boolean }> {
  const data = await neteaseRequest<Raw>(`/artist/albums/${encodeURIComponent(id)}`, { limit, offset, total: true });
  const items = rows(data.hotAlbums).map(mapAlbum);
  const total = num(record(data.artist).albumSize) ?? offset + items.length;
  return { items, total, hasMore: data.more === true };
}
