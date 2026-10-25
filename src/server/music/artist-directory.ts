import { ARTIST_FILTERS, type ArtistDirectoryQuery } from '../../lib/artist-directory';
import type { CatalogArtist, CatalogSource } from './types';
import { CatalogError } from './errors';
import { neteaseRequest } from './netease/client';
import { qqRequest } from './qq/client';
import { kugouRequest } from './kugou/client';
import { mapArtist as neteaseArtist } from './netease/mappers';
import { mapArtist as qqArtist } from './qq/mappers';
import { mapArtist as kugouArtist } from './kugou/mappers';
import { record, rows, num, text } from './netease/mappers';
import { cached } from './index';

export interface ArtistDirectoryPage { items: CatalogArtist[]; total: number; hasMore: boolean }

export function validateArtistQuery(source: CatalogSource, query: ArtistDirectoryQuery) {
  for (const key of ['area', 'type', 'genre', 'initial'] as const) {
    const value = query[key];
    if (value && !ARTIST_FILTERS[source].find(group => group.key === key)?.options.some(option => option.id === value)) throw new CatalogError('歌手筛选参数无效', 400);
  }
  if (!Number.isInteger(query.offset) || query.offset < 0 || query.offset > 100000 || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 80) throw new CatalogError('歌手分页参数无效', 400);
}

/** Native paging for NetEase and QQ; Kugou supplies a grouped directory to slice. */
export async function artistDirectory(source: CatalogSource, query: ArtistDirectoryQuery): Promise<ArtistDirectoryPage> {
  validateArtistQuery(source, query);
  const { area, type, genre, initial, offset, limit } = query;
  if (source === 'netease') {
    const data = await neteaseRequest('/v1/artist/list', { area: area || -1, type: type || -1, initial: initial === '#' ? -2 : initial ? initial.charCodeAt(0) : -1, offset, limit, total: true });
    const items = rows(data.artists).map(neteaseArtist);
    return { items, total: num(data.total) ?? offset + items.length, hasMore: data.more === true && items.length > 0 };
  }
  if (source === 'qq') {
    // QQ always returns up to 80 rows regardless of the requested UI page size.
    const start = Math.floor(offset / 80) * 80;
    const params = { area: area ? Number(area) : -100, sex: type ? Number(type) : -100, genre: genre ? Number(genre) : -100, index: initial === '#' ? 27 : initial ? initial.charCodeAt(0) - 64 : -100, sin: start, cur_page: start / 80 + 1 };
    const page = await cached(`artist-directory:qq-native:${JSON.stringify(params)}`, () => qqRequest('Music.SingerListServer', 'get_singer_list', params), 30 * 60_000);
    const all = rows(page.singerlist).map(qqArtist);
    const items = all.slice(offset - start, offset - start + limit);
    const total = num(page.total) ?? offset + items.length;
    return { items, total, hasMore: items.length > 0 && offset + items.length < total };
  }
  const response = await cached(`artist-directory:kugou-native:${area}:${type}`, () => kugouRequest({ path: '/ocean/v6/singer/list', params: { musician: 0, sextype: type || 0, showtype: 2, type: area || 0, hotsize: 200 } }), 30 * 60_000);
  const groups = rows(record(response.data).info);
  const raw = (initial ? groups.filter(group => text(group.title) === initial) : groups).flatMap(group => rows(group.singer));
  const unique = new Map<string, CatalogArtist>();
  for (const value of raw) { const artist = kugouArtist(value); if (artist.id && !unique.has(artist.id)) unique.set(artist.id, artist); }
  const all = [...unique.values()];
  return { items: all.slice(offset, offset + limit), total: all.length, hasMore: offset + limit < all.length };
}
