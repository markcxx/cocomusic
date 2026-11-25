import type { CatalogChart, CatalogTrack, CategoryGroup, HomeFeatured, HomeRecommendationCard, PlaylistOrder, PlaylistPage } from '../types';
import { sampleUnique } from '../sample-unique';
import { validId } from '../ids';
import { session } from '../session';
import { NeteaseError, neteaseRequest } from './client';
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

/** The signed-in listener's daily songs, in NetEase's recommendation order. */
export async function dailySongs() {
  if (!session.get('netease')?.cookie.MUSIC_U) throw new NeteaseError('请先登录网易云音乐账号', 401);
  const response = await neteaseRequest<Raw>('/v3/discovery/recommend/songs', {}, { os: 'ios' });
  const songs = record(response.data).dailySongs;
  if (!Array.isArray(songs)) throw new NeteaseError('网易云未返回每日推荐歌曲列表');
  return { tracks: rows(songs).filter(song => text(song.id)).map(song => mapTrack(song)) };
}

async function recommendedPlaylists(loggedIn: boolean) {
  if (loggedIn) {
    const data = await neteaseRequest<Raw>('/v1/discovery/recommend/resource');
    if (!Array.isArray(data.recommend)) throw new NeteaseError('网易云未返回每日推荐歌单');
    return rows(data.recommend).filter(item => text(item.id)).map(item =>
      mapPlaylist({ ...item, playCount: item.playcount ?? item.playCount }, '每日推荐'));
  }
  const data = await neteaseRequest<Raw>('/personalized/playlist', { limit: 36, total: true, n: 1000 }, { auth: false });
  return sampleUnique([], rows(data.result).map(item => mapPlaylist(item)), 12);
}

async function publicSongs() {
  const data = await neteaseRequest<Raw>('/personalized/newsong', { type: 'recommend', limit: 9, areaId: 0 }, { auth: false });
  return rows(data.result).map(item => {
    const track = mapTrack(record(item.song));
    return { ...track, cover: track.cover ?? image(item.picUrl, 200) };
  });
}

export async function personalFm() {
  if (!session.get('netease')?.cookie.MUSIC_U) throw new NeteaseError('请先登录网易云音乐账号', 401);
  const response = await neteaseRequest('/v1/radio/get', {});
  return rows(response.data).map(song => mapTrack(song)).filter(track => validId(SOURCE, 'song', track.id));
}

async function discoveryCards(): Promise<HomeRecommendationCard[]> {
  const response = await neteaseRequest('/homepage/block/page', { refresh: false }, { os: 'ios' });
  const blocks = rows(record(response.data).blocks);
  const cards: HomeRecommendationCard[] = [];
  const seen = new Set<string>();
  for (const [code, label, limit] of [
    ['HOMEPAGE_BLOCK_MGC_PLAYLIST', '雷达歌单', 2],
    ['HOMEPAGE_BLOCK_OFFICIAL_PLAYLIST', '专属场景歌单', 1],
  ] as const) {
    const block = blocks.find(item => item.blockCode === code);
    const resources = rows(block?.creatives).flatMap(creative => rows(creative.resources));
    let added = 0;
    for (const resource of resources) {
      const id = text(resource.resourceId);
      const ui = record(resource.uiElement);
      const name = text(record(ui.mainTitle).title);
      if (resource.resourceType !== 'list' || !name || !validId(SOURCE, 'playlist', id) || seen.has(id)) continue;
      cards.push({ kind: 'playlist', id, title: name, subtitle: label, cover: image(record(ui.image).imageUrl) });
      seen.add(id);
      if (++added === limit) break;
    }
  }
  return cards;
}

export async function featured(): Promise<HomeFeatured> {
  const loggedIn = Boolean(session.get('netease')?.cookie.MUSIC_U);
  const [playlists, tracks, chartList, fm, discovery] = await Promise.all([
    recommendedPlaylists(loggedIn),
    loggedIn ? dailySongs().then(result => result.tracks) : publicSongs(),
    charts(2),
    loggedIn ? personalFm().catch(() => []) : [],
    loggedIn ? discoveryCards().catch(() => []) : [],
  ]);
  const recommendationCards: HomeRecommendationCard[] = [];
  if (loggedIn) {
    if (fm.length) recommendationCards.push({ kind: 'radio', title: '私人 FM', tracks: fm });
    recommendationCards.push({ kind: 'daily', title: '每日推荐歌曲', cover: tracks[0]?.cover, subtitle: `今日推荐 · ${tracks.length} 首` }, ...discovery);
  }
  return { playlists, tracks, charts: chartList, dailySongs: loggedIn, dailyPlaylists: loggedIn, recommendationCards };
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
