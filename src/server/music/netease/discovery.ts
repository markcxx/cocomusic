import type { CatalogChart, CatalogTrack, CategoryGroup, HomeFeatured, PlaylistOrder, PlaylistPage } from '../types';
import { neteaseRequest } from './client';
import { image, mapAlbum, mapArtist, mapPlaylist, mapTrack, num, record, rows, SOURCE, text, type Raw } from './mappers';

async function playlistTop(id: string, count: number) {
  const data = await neteaseRequest<Raw>('/v6/playlist/detail', { id, n: count, s: 0 }, { crypto: 'api' });
  return rows(record(data.playlist).tracks).slice(0, count).map(song => mapTrack(song));
}

export async function charts(limit: number): Promise<CatalogChart[]> {
  const data = await neteaseRequest<Raw>('/toplist/detail');
  // Only the official charts carry a `tracks` preview; the rest still have songs via playlist detail.
  const lists = rows(data.list).slice(0, limit);
  // Each chart's top-three need covers for the stacked artwork: one detail call per chart, in parallel.
  const result = await Promise.all(lists.map(async (list): Promise<CatalogChart> => {
    const id = text(list.id);
    const tracks = await playlistTop(id, 3).catch(() => [] as CatalogTrack[]);
    const fallback = rows(list.tracks).map((item, index): CatalogTrack => ({
      id: `${id}-${index}`, source: SOURCE, title: text(item.first), artist: text(item.second),
    }));
    // NetEase's public toplist carries no per-song movement, so no trend is reported.
    const entries = (tracks.length ? tracks : fallback).slice(0, 3).map((track, index) => ({ rank: index + 1, track }));
    return { id, source: SOURCE, name: text(list.name), updateLabel: text(list.updateFrequency) || undefined, cover: image(list.coverImgUrl), entries };
  }));
  return result.filter(chart => chart.entries.length);
}

export async function featured(): Promise<HomeFeatured> {
  const [playlistData, songs, chartList] = await Promise.all([
    neteaseRequest<Raw>('/personalized/playlist', { limit: 12, total: true, n: 1000 }),
    neteaseRequest<Raw>('/personalized/newsong', { type: 'recommend', limit: 9, areaId: 0 }),
    charts(2),
  ]);
  return {
    playlists: rows(playlistData.result).map(item => mapPlaylist(item)),
    tracks: rows(songs.result).map(item => {
      const track = mapTrack(record(item.song));
      // personalized/newsong puts the cover on the wrapper.
      return { ...track, cover: track.cover ?? image(item.picUrl, 200) };
    }),
    charts: chartList,
  };
}

export async function newReleases() {
  const [songs, albums] = await Promise.all([
    neteaseRequest<Raw>('/v1/discovery/new/songs', { areaId: 0, total: true }),
    neteaseRequest<Raw>('/album/new', { area: 'ALL', limit: 12, offset: 0, total: true }),
  ]);
  return {
    tracks: rows(songs.data).slice(0, 9).map(song => mapTrack(song)),
    albums: rows(albums.albums).map(mapAlbum),
  };
}

export async function topArtists(limit: number) {
  const data = await neteaseRequest<Raw>('/artist/top', { limit, offset: 0, total: true });
  return rows(data.artists).map(mapArtist);
}

export async function categories(): Promise<CategoryGroup[]> {
  const data = await neteaseRequest<Raw>('/playlist/catalogue');
  const labels = record(data.categories);
  const groups = new Map<string, CategoryGroup>();
  for (const [key, label] of Object.entries(labels)) groups.set(key, { id: key, label: text(label), options: [] });
  for (const sub of rows(data.sub)) {
    const group = groups.get(text(sub.category));
    if (group && text(sub.name)) group.options.push(text(sub.name));
  }
  return [...groups.values()].filter(group => group.options.length);
}

export async function playlists({ category, order, cursor, limit }: { category: string; order: PlaylistOrder; cursor?: string; limit: number }): Promise<PlaylistPage> {
  const cat = category || '全部';
  if (order === 'quality') {
    // Curated list pages by the last playlist's updateTime rather than an offset.
    const data = await neteaseRequest<Raw>('/playlist/highquality/list', { cat, limit, lasttime: Number(cursor) || 0, total: true });
    const items = rows(data.playlists).map(item => mapPlaylist(item, category || '精品'));
    return { items, total: num(data.total) ?? items.length, hasMore: data.more === true, cursor: text(data.lasttime) || undefined };
  }
  const offset = Number(cursor) || 0;
  const data = await neteaseRequest<Raw>('/playlist/list', { cat, order: 'hot', limit, offset, total: true });
  const items = rows(data.playlists).map(item => mapPlaylist(item, category || undefined));
  const total = num(data.total) ?? offset + items.length;
  const hasMore = data.more === true || offset + items.length < total;
  return { items, total, hasMore, cursor: hasMore ? String(offset + items.length) : undefined };
}
