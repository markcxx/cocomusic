import type {
  ArtistInfo, BestMatch, CatalogAlbum, CatalogArtist, CatalogChart, CatalogPlaylist, CatalogTrack, CategoryGroup, CollectionDetail, HomeFeatured,
  PlaylistOrder, PlaylistPage, SearchDiscovery, SearchResult, SearchSuggestion, SearchType,
} from '../types';
import { APPID, CLIENTVER, device, KugouError, kugouRequest, paramsKey } from './client';
import { image, mapAlbum, mapArtist, mapListSong, mapPlaylist, mapRichSong, mapSearchSong, num, record, rows, SOURCE, text, type Raw } from './mappers';

// Endpoints follow KugouMusicAPI module/* (rank_*, top_*, playlist_*, album_*, artist_*, search_*).

/* ───────── Charts ───────── */

async function rankSongs(rankId: string, page: number, pagesize: number) {
  const json = await kugouRequest<Raw>({
    method: 'POST', path: '/openapi/kmr/v2/rank/audio', headers: { 'kg-tid': '369' },
    data: { show_portrait_mv: 1, show_type_total: 1, filter_original_remarks: 1, area_code: 1, pagesize, rank_cid: 0, type: 1, page, rank_id: Number(rankId) },
  });
  const data = record(json.data);
  return { tracks: rows(data.songlist).map(mapRichSong), total: num(data.total) ?? 0 };
}

async function rankList() {
  const json = await kugouRequest<Raw>({ path: '/ocean/v6/rank/list', params: { plat: 2, withsong: 1, parentid: 0 } });
  return rows(record(json.data).info);
}

export async function charts(limit: number): Promise<CatalogChart[]> {
  const lists = (await rankList()).slice(0, limit);
  return Promise.all(lists.map(async (list): Promise<CatalogChart> => {
    const id = text(list.rankid);
    const { tracks } = await rankSongs(id, 1, 3).catch(() => ({ tracks: [] as CatalogTrack[] }));
    return {
      id, source: SOURCE, name: text(list.rankname),
      updateLabel: text(list.update_frequency) ? `${text(list.update_frequency).replace(/更新$/, '')}更新` : undefined,
      cover: image(list.imgurl ?? list.banner_9, 400),
      entries: tracks.slice(0, 3).map((track, index) => ({ rank: index + 1, track })),
    };
  }));
}

/* ───────── Discovery ───────── */

/** Recommended playlists by category (0 = 推荐). */
async function specialRecommend(categoryId: number, page: number, pagesize: number) {
  const { mid } = device();
  const clienttime = Math.floor(Date.now() / 1000);
  const json = await kugouRequest<Raw>({
    method: 'POST', path: '/v2/special_recommend', router: 'specialrec.service.kugou.com',
    data: {
      appid: APPID, mid, clientver: CLIENTVER, platform: 'android', clienttime, userid: Number(device().userid) || 0, module_id: 1, page, pagesize,
      key: paramsKey(clienttime),
      special_recommend: { withtag: 1, withsong: 1, sort: 1, ugc: 1, is_selected: 0, withrecommend: 1, area_code: 1, categoryid: categoryId },
      req_multi: 1, retrun_min: 5, return_special_falg: 1,
    },
  });
  const data = record(json.data);
  return { items: rows(data.special_list), total: num(data.total), hasNext: Number(data.has_next) === 1 };
}

async function newSongs(pagesize: number) {
  const json = await kugouRequest<Raw>({ method: 'POST', path: '/musicadservice/container/v1/newsong_publish', data: { rank_id: 21608, userid: 0, page: 1, pagesize, tags: [] } });
  return rows(json.data).map(mapRichSong);
}

export async function featured(): Promise<HomeFeatured> {
  const [special, tracks, chartList] = await Promise.all([specialRecommend(0, 1, 12), newSongs(9), charts(2)]);
  return { playlists: special.items.slice(0, 12).map(item => mapPlaylist(item, text(item.show) || '推荐歌单')), tracks, charts: chartList };
}

export async function newReleases() {
  const [tracks, albums] = await Promise.all([
    newSongs(9),
    kugouRequest<Raw>({ method: 'POST', path: '/musicadservice/v1/mobile_newalbum_sp', data: { apiver: 20, token: '', page: 1, pagesize: 12, withpriv: 1 } }),
  ]);
  const data = record(albums.data);
  // Grouped by region (chn/eur/jpn/kor); show 华语 first, then the rest.
  const list = ['chn', 'eur', 'jpn', 'kor'].flatMap(key => rows(data[key]));
  return { tracks, albums: list.slice(0, 12).map(mapAlbum) };
}

export async function topArtists(limit: number): Promise<CatalogArtist[]> {
  const json = await kugouRequest<Raw>({ path: '/ocean/v6/singer/list', params: { musician: 0, sextype: 0, showtype: 2, type: 0, hotsize: Math.max(limit, 10), filter: 0 } });
  return rows(record(json.data).info).flatMap(group => rows(group.singer)).slice(0, limit).map(mapArtist);
}

/* ───────── Playlist square ───────── */

let categoryIds: Map<string, number> | null = null;

export async function categories(): Promise<CategoryGroup[]> {
  const json = await kugouRequest<Raw>({ method: 'POST', path: '/pubsongs/v1/get_tags_by_type', data: { tag_type: 'collection', tag_id: 0, source: 3 } });
  categoryIds = new Map();
  return rows(json.data).map(group => {
    const options = rows(group.son).filter(item => text(item.tag_name));
    for (const item of options) categoryIds!.set(text(item.tag_name), Number(item.tag_id));
    return { id: text(group.tag_id), label: text(group.tag_name), options: options.map(item => text(item.tag_name)) };
  }).filter(group => group.options.length);
}

export async function playlists({ category, cursor, limit }: { category: string; order: PlaylistOrder; cursor?: string; limit: number }): Promise<PlaylistPage> {
  if (category && !categoryIds) await categories().catch(() => undefined);
  // Kugou's recommendation feed has a single order, so 'hot' and 'quality' share it.
  const id = (category && categoryIds?.get(category)) || 0;
  const page = Math.max(1, Number(cursor) || 1);
  const result = await specialRecommend(id, page, limit);
  // The feed may return a few more than asked (req_multi); keep pages the requested size.
  const items = result.items.slice(0, limit).map(item => mapPlaylist(item, category || undefined));
  const hasMore = result.hasNext && items.length > 0;
  return { items, total: result.total ?? (page - 1) * limit + items.length, hasMore, cursor: hasMore ? String(page + 1) : undefined };
}

/* ───────── Collections ───────── */

/** Chart ids are plain numbers; playlists use global_collection_id ("collection_…"). */
const isRankId = (id: string) => /^\d+$/.test(id);

async function chartDetail(id: string, offset: number, limit: number): Promise<CollectionDetail> {
  const page = Math.floor(offset / limit) + 1;
  const [info, songs] = await Promise.all([
    kugouRequest<Raw>({ path: '/ocean/v6/rank/info', params: { rank_cid: 0, rankid: id, with_album_img: 1, zone: '' } }),
    rankSongs(id, page, limit),
  ]);
  const data = record(info.data);
  if (!text(data.rankname)) throw new KugouError('榜单不存在', 404);
  const start = (page - 1) * limit;
  return {
    info: {
      kind: 'playlist', id, source: SOURCE, name: text(data.rankname),
      cover: image(data.img_9 ?? data.banner_9 ?? data.imgurl, 480),
      description: text(data.intro).replace(/\r/g, '') || undefined,
      owner: { name: '酷狗音乐' },
      trackCount: songs.total || songs.tracks.length,
      playCount: num(data.play_times),
      updatedAt: num(data.timestamp) ? Number(data.timestamp) * 1000 : undefined,
    },
    tracks: songs.tracks, offset: start, hasMore: start + songs.tracks.length < songs.total,
  };
}

export async function playlistDetail(id: string, offset: number, limit: number): Promise<CollectionDetail> {
  if (isRankId(id)) return chartDetail(id, offset, limit);
  const { userid, token } = device();
  const [info, songs] = await Promise.all([
    kugouRequest<Raw>({ method: 'POST', path: '/v3/get_list_info', router: 'pubsongs.kugou.com', data: { data: [{ global_collection_id: id }], userid: Number(userid) || 0, token } }),
    kugouRequest<Raw>({
      path: '/pubsongs/v2/get_other_list_file_nofilt',
      params: { area_code: 1, begin_idx: offset, plat: 1, type: 1, mode: 1, personal_switch: 1, extend_fields: 'abtags,hot_cmt,popularization', pagesize: limit, global_collection_id: id },
    }),
  ]);
  const meta = rows(info.data)[0];
  if (!meta || !text(meta.name)) throw new KugouError('歌单不存在或未公开', 404);
  const data = record(songs.data);
  const tracks = rows(data.songs).map(mapListSong);
  const total = num(data.count ?? meta.count) ?? tracks.length;
  return {
    info: {
      kind: 'playlist', id, source: SOURCE, name: text(meta.name),
      cover: image(meta.pic, 480),
      description: text(meta.intro).trim() || undefined,
      owner: text(meta.list_create_username) ? { name: text(meta.list_create_username), avatar: image(meta.create_user_pic, 150) } : undefined,
      tags: text(meta.tags).split(',').map(tag => tag.trim()).filter(Boolean),
      trackCount: total,
      playCount: num(meta.heat) || undefined,
      subscribedCount: num(meta.collect_total) || undefined,
      createdAt: num(meta.create_time) ? Number(meta.create_time) * 1000 : undefined,
      updatedAt: num(meta.update_time) ? Number(meta.update_time) * 1000 : undefined,
    },
    tracks, offset, hasMore: offset + tracks.length < total,
  };
}

/** Pages through album songs (the service caps page size). */
async function albumSongs(id: string) {
  const pagesize = 50;
  const tracks: CatalogTrack[] = [];
  let total = 0;
  for (let page = 1; page <= 10; page += 1) {
    const json = await kugouRequest<Raw>({ method: 'POST', path: '/v1/album_audio/lite', router: 'openapi.kugou.com', headers: { 'kg-tid': '255' }, data: { album_id: id, is_buy: '', page, pagesize } });
    const data = record(json.data);
    const list = rows(data.songs).map(mapRichSong);
    total = num(data.total) ?? total;
    tracks.push(...list);
    if (!list.length || tracks.length >= total) break;
  }
  return { tracks, total: total || tracks.length };
}

export async function albumDetail(id: string): Promise<CollectionDetail> {
  const [info, songs] = await Promise.all([
    kugouRequest<Raw>({ method: 'POST', path: '/kmr/v2/albums', router: 'openapi.kugou.com', headers: { 'kg-tid': '255' }, data: { data: [{ album_id: id }], is_buy: 0 } }),
    albumSongs(id),
  ]);
  const album = rows(info.data)[0];
  if (!album || !text(album.album_name)) throw new KugouError('专辑不存在或已下架', 404);
  const authors = rows(album.authors);
  return {
    info: {
      kind: 'album', id, source: SOURCE, name: text(album.album_name),
      cover: image(album.sizable_cover, 800),
      description: text(album.intro).trim() || undefined,
      owner: { name: text(album.author_name) || '未知歌手', avatar: image(authors[0]?.sizable_avatar, 150) },
      tags: [text(album.type_name ?? album.category_name), text(album.language)].filter(Boolean),
      trackCount: songs.total,
      createdAt: Date.parse(text(album.publish_date)) || undefined,
      company: text(album.publish_company) || undefined,
    },
    tracks: songs.tracks, offset: 0, hasMore: false,
  };
}

/* ───────── Artist ───────── */

async function authorSongs(id: string, page: number, pagesize: number) {
  const { mid } = device();
  const clienttime = Math.floor(Date.now() / 1000);
  return kugouRequest<Raw>({
    method: 'POST', base: 'https://openapi.kugou.com', path: '/kmr/v1/audio_group/author', router: 'openapi.kugou.com', headers: { 'kg-tid': '220' },
    data: { appid: APPID, clientver: CLIENTVER, mid, clienttime, key: paramsKey(clienttime), author_id: id, pagesize, page, sort: 1, area_code: 'all' },
  });
}

async function authorAlbums(id: string, page: number, pagesize: number) {
  return kugouRequest<Raw>({
    method: 'POST', path: '/kmr/v1/author/albums', router: 'openapi.kugou.com', headers: { 'kg-tid': '36' },
    data: { author_id: id, pagesize, page, sort: 3, category: 1, area_code: 'all' },
  });
}

export async function artistInfo(id: string): Promise<ArtistInfo> {
  const json = await kugouRequest<Raw>({ method: 'POST', path: '/kmr/v3/author', router: 'openapi.kugou.com', headers: { 'kg-tid': '36' }, data: { author_id: id } });
  const data = record(json.data);
  if (!text(data.author_name)) throw new KugouError('歌手不存在', 404);
  const [songs, albums] = await Promise.allSettled([authorSongs(id, 1, 1), authorAlbums(id, 1, 1)]);
  const longIntro = rows(data.long_intro).map(item => `${text(item.title) ? `${text(item.title)}\n` : ''}${text(item.content)}`).join('\n\n');
  return {
    id, source: SOURCE, name: text(data.author_name),
    avatar: image(data.sizable_avatar, 480),
    alias: [text(data.alias), text(data.english_name)].filter(Boolean),
    identity: text(data.identity_name ?? data.identity) && !/^\d+$/.test(text(data.identity_name ?? data.identity)) ? text(data.identity_name ?? data.identity) : undefined,
    description: (longIntro || text(data.intro)).trim() || undefined,
    songCount: songs.status === 'fulfilled' ? num(songs.value.total) : num(data.song_count),
    albumCount: albums.status === 'fulfilled' ? num(albums.value.total) : num(data.album_count),
  };
}

/** Page number for offset paging (the services page by 1-based index). */
const pageOf = (offset: number, limit: number) => Math.floor(offset / limit) + 1;

export async function artistSongs(id: string, offset: number, limit: number) {
  const json = await authorSongs(id, pageOf(offset, limit), limit);
  const items = rows(json.data).map(mapRichSong);
  const total = num(json.total) ?? offset + items.length;
  return { items, total, hasMore: items.length > 0 && offset + items.length < total };
}

export async function artistAlbums(id: string, offset: number, limit: number): Promise<{ items: CatalogAlbum[]; total: number; hasMore: boolean }> {
  const json = await authorAlbums(id, pageOf(offset, limit), limit);
  const items = rows(json.data).map(mapAlbum);
  const total = num(json.total) ?? offset + items.length;
  return { items, total, hasMore: items.length > 0 && offset + items.length < total };
}

/* ───────── Search ───────── */

const SEARCH_PATHS: Record<SearchType, string> = { song: '/v3/search/song', playlist: '/v1/search/special', album: '/v1/search/album', artist: '/v1/search/author' };

async function searchRaw(keyword: string, type: SearchType, page: number, pagesize: number) {
  const json = await kugouRequest<Raw>({
    path: SEARCH_PATHS[type], router: 'complexsearch.kugou.com',
    params: { albumhide: 0, iscorrection: 1, keyword, nocollect: 0, page, pagesize, platform: 'AndroidFilter' },
  });
  const data = record(json.data);
  return { list: rows(data.lists), total: num(data.total) ?? 0 };
}

export async function search(keyword: string, type: SearchType, offset: number, limit: number): Promise<SearchResult> {
  const { list, total } = await searchRaw(keyword, type, pageOf(offset, limit), limit);
  const page = <T>(items: T[]) => ({ items, total: Math.max(total, offset + items.length), hasMore: items.length > 0 && offset + items.length < total });
  if (type === 'playlist') return { type, ...page(list.map(item => mapPlaylist(item))) };
  if (type === 'album') return { type, ...page(list.map(mapAlbum)) };
  if (type === 'artist') return { type, ...page(list.map(mapArtist)) };
  return { type: 'song', ...page(list.map(mapSearchSong)) };
}

const close = (keyword: string, name: string) => Boolean(name) && (name === keyword || keyword.includes(name) || name.includes(keyword));

export async function bestMatch(keyword: string): Promise<BestMatch> {
  const [artists, albums] = await Promise.allSettled([searchRaw(keyword, 'artist', 1, 1), searchRaw(keyword, 'album', 1, 1)]);
  const artist = artists.status === 'fulfilled' ? artists.value.list[0] : undefined;
  const album = albums.status === 'fulfilled' ? albums.value.list[0] : undefined;
  return {
    artist: artist && close(keyword, text(artist.AuthorName)) ? mapArtist(artist) : undefined,
    album: album && close(keyword, text(album.albumname)) ? mapAlbum(album) : undefined,
  };
}

export async function suggest(keyword: string): Promise<SearchSuggestion> {
  const [tips, songs, artists, lists] = await Promise.allSettled([
    kugouRequest<Raw>({ path: '/v2/getSearchTip', router: 'searchtip.kugou.com', params: { AlbumTipCount: 0, CorrectTipCount: 0, MVTipCount: 0, MusicTipCount: 8, radiotip: 0, keyword } }),
    searchRaw(keyword, 'song', 1, 4),
    searchRaw(keyword, 'artist', 1, 2),
    searchRaw(keyword, 'playlist', 1, 2),
  ]);
  const keywords = tips.status === 'fulfilled'
    ? rows(tips.value.data).flatMap(group => rows(group.RecordDatas)).map(item => text(item.HintInfo)).filter(Boolean)
    : [];
  const value = <T>(result: PromiseSettledResult<{ list: Raw[] }>, map: (raw: Raw) => T) => (result.status === 'fulfilled' ? result.value.list.map(map) : []);
  return {
    keywords: [...new Set(keywords)].slice(0, 6),
    songs: value(songs, mapSearchSong),
    artists: value(artists, mapArtist).filter(item => close(keyword, item.name)),
    albums: [],
    playlists: value<CatalogPlaylist>(lists, raw => mapPlaylist(raw)),
  };
}

export async function searchDiscovery(): Promise<SearchDiscovery> {
  const json = await kugouRequest<Raw>({ path: '/api/v3/search/hot_tab', router: 'msearch.kugou.com', params: { navid: 1, plat: 2 } });
  const tab = rows(record(json.data).list)[0];
  const hot = rows(tab?.keywords).map(item => ({
    keyword: text(item.keyword),
    note: text(item.reason) && text(item.reason) !== text(item.keyword) ? text(item.reason) : undefined,
  })).filter(item => item.keyword);
  return { hot: hot.slice(0, 20) };
}
