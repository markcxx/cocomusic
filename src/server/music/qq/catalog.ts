import type {
  ArtistInfo, BestMatch, CatalogAlbum, CatalogChart, CatalogTrack, CategoryGroup, CollectionDetail, HomeFeatured, PlaylistOrder, PlaylistPage,
  SearchDiscovery, SearchResult, SearchSuggestion, SearchType,
} from '../types';
import { QQError, qqBatch, qqLegacy, qqRequest } from './client';
import { albumCover, https, mapAlbum, mapArtist, mapPlaylistBasic, mapTrack, num, record, rows, singerAvatar, SOURCE, text, type Raw } from './mappers';

// Module/method names follow multiPlatformMusicApi platforms/qqmusic/module/*.

/* ───────── Discovery ───────── */

async function chartDetail(topId: number, offset: number, num_: number) {
  return qqRequest<Raw>('musicToplist.ToplistInfoServer', 'GetDetail', { topid: topId, offset, num: num_, period: '' });
}

export async function charts(limit: number): Promise<CatalogChart[]> {
  const data = await qqRequest<Raw>('musicToplist.ToplistInfoServer', 'GetAll', {});
  const lists = rows(data.group).flatMap(group => rows(group.toplist)).slice(0, limit);
  return Promise.all(lists.map(async (list): Promise<CatalogChart> => {
    const id = text(list.topId);
    // GetAll previews songs without album mids; fetch the top three with artwork.
    const detail = await chartDetail(Number(id), 0, 3).catch(() => ({} as Raw));
    const tracks = rows(detail.songInfoList).map(mapTrack);
    const fallback = rows(list.song).map((song, index): CatalogTrack => ({ id: `${id}-${index}`, source: SOURCE, title: text(song.title), artist: text(song.singerName) }));
    return {
      id,
      source: SOURCE,
      name: text(list.title),
      updateLabel: text(list.updateTime) ? `${text(list.updateTime)} 更新` : undefined,
      cover: https(list.frontPicUrl ?? list.headPicUrl ?? list.mbFrontPicUrl),
      entries: (tracks.length ? tracks : fallback).slice(0, 3).map((track, index) => ({ rank: index + 1, track })),
    };
  }));
}

export async function featured(): Promise<HomeFeatured> {
  const [square, songs, chartList] = await Promise.all([
    qqRequest<Raw>('music.playlist.PlayListCategory', 'get_category_content', { caller: '0', category_id: 3317, size: 12, page: 0, use_page: 1 }),
    qqRequest<Raw>('newsong.NewSongServer', 'get_new_song_info', { type: 5 }),
    charts(2),
  ]);
  return {
    playlists: rows(record(square.content).v_item).map(item => mapPlaylistBasic(item, '官方歌单')),
    tracks: rows(songs.songlist).slice(0, 9).map(mapTrack),
    charts: chartList,
  };
}

export async function newReleases() {
  const [songs, albums] = await Promise.all([
    qqRequest<Raw>('newsong.NewSongServer', 'get_new_song_info', { type: 5 }),
    qqRequest<Raw>('newalbum.NewAlbumServer', 'get_new_album_info', { area: 1, start: 0, sin: 0, num: 12 }),
  ]);
  return { tracks: rows(songs.songlist).slice(0, 9).map(mapTrack), albums: rows(albums.albums).map(mapAlbum) };
}

export async function topArtists(limit: number) {
  const data = await qqRequest<Raw>('Music.SingerListServer', 'get_singer_list', { area: -100, sex: -100, genre: -100, index: -100, sin: 0, cur_page: 1 });
  return rows(data.singerlist).slice(0, limit).map(mapArtist);
}

/* ───────── Playlist square ───────── */

/** Category names → QQ category ids (names are what the UI sends). */
let categoryIds: Map<string, number> | null = null;

export async function categories(): Promise<CategoryGroup[]> {
  const data = await qqRequest<Raw>('music.playlist.PlaylistSquare', 'GetAllTag', { qq: '' });
  categoryIds = new Map();
  return rows(data.v_group).map(group => {
    const options = rows(group.v_item).filter(item => text(item.name) && text(item.name) !== 'AI歌单');
    for (const item of options) categoryIds!.set(text(item.name), Number(item.id));
    return { id: text(group.group_id), label: text(group.group_name), options: options.map(item => text(item.name)) };
  }).filter(group => group.options.length);
}

export async function playlists({ category, order, cursor, limit }: { category: string; order: PlaylistOrder; cursor?: string; limit: number }): Promise<PlaylistPage> {
  if (category && !categoryIds) await categories().catch(() => undefined);
  // 官方歌单 (3317) doubles as "all": QQ has no single all-category listing.
  const id = (category && categoryIds?.get(category)) || 3317;
  const offset = Number(cursor) || 0;
  const page = Math.floor(offset / limit);
  // QQ's category feed has a single editorial order (the `order` field is ignored upstream),
  // so "hot" and "quality" share it; 官方歌单 (3317) is the curated set.
  const data = await qqRequest<Raw>('music.playlist.PlayListCategory', 'get_category_content', {
    caller: '0', category_id: order === 'quality' && !category ? 3317 : id, size: limit, page, use_page: 1,
  });
  const content = record(data.content);
  const items = rows(content.v_item).map(item => mapPlaylistBasic(item, category || undefined));
  const total = num(content.total_cnt) ?? offset + items.length;
  const hasMore = items.length > 0 && offset + items.length < total;
  return { items, total, hasMore, cursor: hasMore ? String(offset + items.length) : undefined };
}

/* ───────── Collections ───────── */

/** Charts have small numeric ids (< 1000); user playlists have large ones. */
const isChartId = (id: string) => Number(id) > 0 && Number(id) < 1000;

export async function playlistDetail(id: string, offset: number, limit: number): Promise<CollectionDetail> {
  if (isChartId(id)) {
    const data = await chartDetail(Number(id), offset, limit);
    const info = record(data.data);
    const tracks = rows(data.songInfoList).map(mapTrack);
    const total = num(info.totalNum) ?? tracks.length;
    return {
      info: {
        kind: 'playlist', id, source: SOURCE, name: text(info.title),
        cover: https(info.frontPicUrl ?? info.headPicUrl),
        description: text(info.intro).replace(/<br\s*\/?>/g, '\n') || undefined,
        owner: { name: 'QQ 音乐' },
        trackCount: total,
        playCount: num(info.listenNum),
        updatedAt: Date.parse(text(info.updateTime)) || undefined,
      },
      tracks, offset, hasMore: offset + tracks.length < total,
    };
  }
  const data = await qqRequest<Raw>('music.srfDissInfo.aiDissInfo', 'uniform_get_Dissinfo', {
    disstid: Number(id), userinfo: 1, tag: 1, orderlist: 1, song_begin: offset, song_num: limit, onlysonglist: 0, enc_host_uin: '',
  });
  const dir = record(data.dirinfo);
  if (!text(dir.id) && !text(dir.title)) throw new QQError('歌单不存在或未公开', 404);
  const tracks = rows(data.songlist).map(mapTrack);
  const total = num(data.total_song_num ?? dir.songnum) ?? tracks.length;
  const creator = record(dir.creator);
  return {
    info: {
      kind: 'playlist', id, source: SOURCE, name: text(dir.title),
      cover: https(dir.picurl),
      description: text(dir.desc).replace(/<br\s*\/?>/g, '\n') || undefined,
      owner: text(dir.host_nick ?? creator.nick) ? { name: text(dir.host_nick ?? creator.nick), avatar: https(dir.headurl ?? creator.headurl) } : undefined,
      tags: rows(dir.tag).map(tag => text(tag.name)).filter(Boolean),
      trackCount: total,
      playCount: num(dir.listennum),
      subscribedCount: num(dir.ordernum),
      createdAt: num(dir.ctime) ? Number(dir.ctime) * 1000 : undefined,
      updatedAt: num(dir.mtime) ? Number(dir.mtime) * 1000 : undefined,
    },
    tracks, offset, hasMore: offset + tracks.length < total,
  };
}

export async function albumDetail(mid: string): Promise<CollectionDetail> {
  const parsed = await qqBatch({
    info: { module: 'music.musichallAlbum.AlbumInfoServer', method: 'GetAlbumDetail', param: { albumMid: mid } },
    songs: { module: 'music.musichallAlbum.AlbumSongList', method: 'GetAlbumSongList', param: { albumMid: mid, begin: 0, num: 200, order: 2 } },
  });
  const info = record(record(parsed.info).data);
  const basic = record(info.basicInfo);
  if (!text(basic.albumName)) throw new QQError('专辑不存在或已下架', 404);
  const songsData = record(record(parsed.songs).data);
  const tracks = rows(songsData.songList).map(mapTrack);
  const singers = rows(record(info.singer).singerList);
  return {
    info: {
      kind: 'album', id: mid, source: SOURCE, name: text(basic.albumName),
      cover: albumCover(mid, 800),
      description: text(basic.desc).trim() || undefined,
      owner: singers.length ? { name: singers.map(item => text(item.name)).join(' / '), avatar: singerAvatar(singers[0].mid, 150) } : undefined,
      tags: [text(basic.albumType), text(basic.genre)].filter(Boolean),
      trackCount: num(songsData.totalNum) ?? tracks.length,
      createdAt: Date.parse(text(basic.publishDate)) || undefined,
      company: text(record(info.company).name) || undefined,
    },
    tracks, offset: 0, hasMore: false,
  };
}

/* ───────── Artist ───────── */

export async function artistInfo(mid: string): Promise<ArtistInfo> {
  const parsed = await qqBatch({
    detail: { module: 'music.musichallSinger.SingerInfoInter', method: 'GetSingerDetail', param: { singer_mids: [mid], pic: 1, group_singer: 1, wiki_singer: 1, ex_singer: 1 } },
    songs: { module: 'music.musichallSong.SongListInter', method: 'GetSingerSongList', param: { singerMid: mid, begin: 0, num: 1, order: 1 } },
    albums: { module: 'music.musichallAlbum.AlbumListServer', method: 'GetAlbumList', param: { singerMid: mid, begin: 0, num: 1, order: 0 } },
  });
  const singer = rows(record(record(parsed.detail).data).singer_list)[0];
  if (!singer) throw new QQError('歌手不存在', 404);
  const basic = record(singer.basic_info);
  const pic = record(singer.pic);
  const ex = record(singer.ex_info);
  return {
    id: mid, source: SOURCE, name: text(basic.name),
    avatar: https(pic.pic)?.replace(/\.webp$/, '.jpg') ?? singerAvatar(mid, 500),
    cover: https(pic.big_black ?? pic.big_white),
    alias: [text(ex.foreign_name), text(ex.english_name)].filter(Boolean),
    identity: text(ex.identity) || undefined,
    description: text(ex.desc).trim() || undefined,
    songCount: num(record(record(parsed.songs).data).totalNum),
    albumCount: num(record(record(parsed.albums).data).total),
  };
}

export async function artistSongs(mid: string, offset: number, limit: number) {
  const data = await qqRequest<Raw>('music.musichallSong.SongListInter', 'GetSingerSongList', { singerMid: mid, begin: offset, num: limit, order: 1 });
  const items = rows(data.songList).map(mapTrack);
  const total = num(data.totalNum) ?? offset + items.length;
  return { items, total, hasMore: items.length > 0 && offset + items.length < total };
}

export async function artistAlbums(mid: string, offset: number, limit: number): Promise<{ items: CatalogAlbum[]; total: number; hasMore: boolean }> {
  const data = await qqRequest<Raw>('music.musichallAlbum.AlbumListServer', 'GetAlbumList', { singerMid: mid, begin: offset, num: limit, order: 0 });
  const items = rows(data.albumList).map(mapAlbum);
  const total = num(data.total) ?? offset + items.length;
  return { items, total, hasMore: items.length > 0 && offset + items.length < total };
}

/* ───────── Search ───────── */

const SEARCH_TYPES: Record<SearchType, number> = { song: 0, artist: 1, album: 2, playlist: 3 };

async function smartbox(keyword: string) {
  const url = `https://c6.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?_=${Date.now()}&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=1&uin=0&g_tk=5381&is_xml=0&key=${encodeURIComponent(keyword)}`;
  return record((await qqLegacy<Raw>(url)).data);
}

/**
 * Full search through the desktop search service. When QQ withholds results
 * (it does for some networks without a login), fall back to the type-ahead
 * index for songs/albums/artists and the legacy playlist search, so search
 * still works, with fewer results and no paging beyond the first page.
 */
export async function search(keyword: string, type: SearchType, offset: number, limit: number): Promise<SearchResult> {
  const size = Math.min(limit, 30);
  const page = Math.floor(offset / size) + 1;
  const data = await qqRequest<Raw>('music.search.SearchCgiService', 'DoSearchForQQMusicDesktop', {
    grp: 1, num_per_page: size, page_num: page, query: keyword, search_type: SEARCH_TYPES[type], searchid: String(Date.now()),
  }).catch(() => ({} as Raw));
  const body = record(data.body);
  const meta = record(data.meta);
  const more = Number(meta.nextpage) > 0;
  const result = <T>(items: T[], fallbackTotal = 0) => {
    const total = Math.max(num(meta.sum) ?? 0, fallbackTotal, offset + items.length);
    return { items, total, hasMore: items.length > 0 && (more || offset + items.length < (num(meta.sum) ?? 0)) };
  };

  if (type === 'playlist') {
    const list = rows(record(body.songlist).list).map(item => mapPlaylistBasic(item));
    if (list.length || offset > 0) return { type, ...result(list) };
    const legacy = record((await qqLegacy<Raw>(`https://c.y.qq.com/soso/fcgi-bin/client_music_search_songlist?remoteplace=txt.yqq.playlist&searchid=${Date.now()}&page_no=${page - 1}&num_per_page=${size}&query=${encodeURIComponent(keyword)}&g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`)).data);
    const items = rows(legacy.list).map(item => ({ ...mapPlaylistBasic(item), cover: https(item.imgurl), creator: text(record(item.creator).name) || undefined }));
    const total = num(legacy.display_num ?? legacy.sum) ?? items.length;
    return { type, items, total, hasMore: offset + items.length < total };
  }
  if (type === 'artist') {
    const list = rows(record(body.singer).list).map(mapArtist);
    if (list.length || offset > 0) return { type, ...result(list) };
    const box = await smartbox(keyword);
    return { type, items: rows(record(box.singer).itemlist).map(item => ({ ...mapArtist({ ...item, singer_mid: item.mid, singer_name: item.name, singer_pic: item.pic }) })), total: num(record(box.singer).count) ?? 0, hasMore: false };
  }
  if (type === 'album') {
    const list = rows(record(body.album).list).map(item => mapAlbum({ ...item, albumMid: item.albumMID, albumName: item.albumName, singerName: item.singerName, publishDate: item.publicTime, totalNum: item.song_count }));
    if (list.length || offset > 0) return { type, ...result(list) };
    const box = await smartbox(keyword);
    return { type, items: rows(record(box.album).itemlist).map(item => mapAlbum({ albumMid: item.mid, albumName: item.name, singerName: item.singer })), total: num(record(box.album).count) ?? 0, hasMore: false };
  }
  const list = rows(record(body.song).list).map(mapTrack);
  if (list.length || offset > 0) return { type: 'song', ...result(list) };
  // Type-ahead songs carry mid + id but no album: resolve full track info in one call.
  const box = await smartbox(keyword);
  const ids = rows(record(box.song).itemlist).map(item => Number(item.id)).filter(Boolean);
  const tracks = ids.length ? await songsById(ids) : [];
  return { type: 'song', items: tracks, total: tracks.length, hasMore: false };
}

/** Track info for numeric song ids (keeps the given order). */
export async function songsById(ids: number[]): Promise<CatalogTrack[]> {
  const data = await qqRequest<Raw>('music.trackInfo.UniformRuleCtrl', 'CgiGetTrackInfo', { ids, types: ids.map(() => 0) });
  return rows(data.tracks).map(mapTrack);
}

export async function bestMatch(keyword: string): Promise<BestMatch> {
  const box = await smartbox(keyword).catch(() => ({} as Raw));
  const singer = rows(record(box.singer).itemlist)[0];
  const album = rows(record(box.album).itemlist)[0];
  // Only claim an artist when the keyword is (close to) their name.
  const close = (name: string) => name && (name === keyword || keyword.includes(name) || name.includes(keyword));
  return {
    artist: singer && close(text(singer.name)) ? mapArtist({ singer_mid: singer.mid, singer_name: singer.name, singer_pic: singer.pic }) : undefined,
    album: album && close(text(album.name)) ? mapAlbum({ albumMid: album.mid, albumName: album.name, singerName: album.singer }) : undefined,
  };
}

export async function suggest(keyword: string): Promise<SearchSuggestion> {
  const box = await smartbox(keyword);
  const songIds = rows(record(box.song).itemlist).slice(0, 4).map(item => Number(item.id)).filter(Boolean);
  const songs = songIds.length ? await songsById(songIds).catch(() => [] as CatalogTrack[]) : [];
  return {
    keywords: [...new Set(rows(record(box.song).itemlist).map(item => `${text(item.name)} ${text(item.singer)}`.trim()))].slice(0, 6),
    songs,
    artists: rows(record(box.singer).itemlist).slice(0, 3).map(item => mapArtist({ singer_mid: item.mid, singer_name: item.name, singer_pic: item.pic })),
    albums: rows(record(box.album).itemlist).slice(0, 3).map(item => mapAlbum({ albumMid: item.mid, albumName: item.name, singerName: item.singer })),
    playlists: [],
  };
}

export async function searchDiscovery(): Promise<SearchDiscovery> {
  const data = await qqRequest<Raw>('tencent_musicsoso_hotkey.HotkeyService', 'GetHotkeyForQQMusicPC', { search_id: '', uin: 0 });
  return {
    hot: rows(data.vec_hotkey).slice(0, 20).map(item => ({
      keyword: text(item.query ?? item.title),
      score: num(item.score),
      note: text(item.description) || undefined,
    })).filter(item => item.keyword),
  };
}
