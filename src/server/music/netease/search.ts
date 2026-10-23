import type { BestMatch, HotSearch, SearchDiscovery, SearchResult, SearchSuggestion, SearchType } from '../types';
import { neteaseEapi, neteaseRequest } from './client';
import { mapAlbum, mapArtist, mapPlaylist, mapTrack, num, record, rows, text, type Raw } from './mappers';

const TYPE_CODES: Record<SearchType, number> = { song: 1, album: 10, artist: 100, playlist: 1000 };

/** Full search through the desktop cloudsearch endpoint, which returns song covers (al.picUrl). */
export async function search(keyword: string, type: SearchType, offset: number, limit: number): Promise<SearchResult> {
  const data = await neteaseEapi<Raw>('/api/cloudsearch/pc', { s: keyword, type: TYPE_CODES[type], limit, offset, total: true });
  const result = record(data.result);
  const page = <T>(items: T[], total: unknown) => {
    const count = num(total) ?? offset + items.length;
    return { items, total: count, hasMore: items.length > 0 && offset + items.length < count };
  };
  switch (type) {
    case 'album': return { type, ...page(rows(result.albums).map(mapAlbum), result.albumCount) };
    case 'artist': return { type, ...page(rows(result.artists).map(mapArtist), result.artistCount) };
    case 'playlist': return { type, ...page(rows(result.playlists).map(item => mapPlaylist(item)), result.playlistCount) };
    default: return { type: 'song', ...page(rows(result.songs).map(song => mapTrack(song)), result.songCount) };
  }
}

/** Upstream "multimatch": the artist/album/playlist the keyword most likely refers to. */
export async function bestMatch(keyword: string): Promise<BestMatch> {
  const data = await neteaseRequest<Raw>('/search/suggest/multimatch', { type: 1, s: keyword });
  const result = record(data.result);
  const artist = rows(result.artist)[0];
  const album = rows(result.album)[0];
  const playlist = rows(result.playlist)[0];
  return {
    artist: artist ? mapArtist(artist) : undefined,
    album: album ? mapAlbum(album) : undefined,
    playlist: playlist ? mapPlaylist(playlist) : undefined,
  };
}

/** Type-ahead: keyword completions plus grouped best matches. */
export async function suggest(keyword: string): Promise<SearchSuggestion> {
  const [web, keywords] = await Promise.all([
    neteaseRequest<Raw>('/search/suggest/web', { s: keyword }),
    neteaseRequest<Raw>('/search/suggest/keyword', { s: keyword }).catch(() => ({} as Raw)),
  ]);
  const result = record(web.result);
  const completions = rows(record(keywords.result).allMatch).map(item => text(item.keyword)).filter(Boolean);
  return {
    keywords: [...new Set(completions)].slice(0, 8),
    songs: rows(result.songs).slice(0, 4).map(song => mapTrack(song)),
    artists: rows(result.artists).slice(0, 3).map(mapArtist),
    albums: rows(result.albums).slice(0, 3).map(mapAlbum),
    playlists: rows(result.playlists).slice(0, 3).map(item => mapPlaylist(item)),
  };
}

/** Hot-search ranking and the placeholder keyword for the empty box. */
export async function searchDiscovery(): Promise<SearchDiscovery> {
  const [hot, placeholder] = await Promise.all([
    neteaseRequest<Raw>('/hotsearchlist/get'),
    neteaseEapi<Raw>('/api/search/defaultkeyword/get').catch(() => ({} as Raw)),
  ]);
  // hotsearchlist iconType: 1 = 热, 4 = 新, 5 = 升 (0 = none).
  const badges: Record<number, HotSearch['badge']> = { 1: 'hot', 4: 'new', 5: 'up' };
  return {
    placeholder: text(record(placeholder.data).realkeyword) || undefined,
    hot: rows(hot.data).slice(0, 20).map(item => ({
      keyword: text(item.searchWord),
      score: num(item.score),
      note: text(item.content) || undefined,
      badge: badges[Number(item.iconType)],
    })).filter(item => item.keyword),
  };
}
