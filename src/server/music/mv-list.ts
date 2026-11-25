import { CatalogError } from './errors';
import { createKugouClient } from './kugou/client';
import type { KugouSource } from './kugou/config';
import { mediaUrl } from './mv';
import type { MvArea, MvListKind } from './mv-features';
import { neteaseEapi, neteaseRequest } from './netease/client';
import { num, record, rows, text, type Raw } from './netease/mappers';
import { qqRequest } from './qq/client';
import type { CatalogSource } from './types';

/** One video card in an MV list; `id` is what musicVideoById takes. */
export interface MvSummary {
  id: string;
  source: CatalogSource;
  title: string;
  artist: string;
  artistId?: string;
  cover?: string;
  /** Milliseconds. */
  duration?: number;
  playCount?: number;
  /** Epoch milliseconds. */
  publishTime?: number;
  /** Position in a ranked list. */
  rank?: number;
}
export interface MvPage { items: MvSummary[]; total: number; hasMore: boolean }
export interface MvQuery { kind: MvListKind; area?: MvArea; keyword?: string; artistId?: string; offset: number; limit: number }

/** Date string, epoch seconds or epoch milliseconds. */
function time(value: unknown) {
  const number = num(value);
  if (number !== undefined) return number > 1e11 ? number : number > 0 ? number * 1000 : undefined;
  const parsed = Date.parse(text(value).replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : undefined;
}
const positive = (value: unknown) => { const number = num(value); return number && number > 0 ? number : undefined; };
const page = (items: MvSummary[], offset: number, total: number | undefined, more?: boolean): MvPage => {
  const count = Math.max(total ?? 0, offset + items.length);
  return { items, total: count, hasMore: items.length > 0 && (more ?? offset + items.length < count) };
};
const unique = (items: MvSummary[]) => items.filter((item, index) => item.id && items.findIndex(other => other.id === item.id) === index);

/* ───────── NetEase ───────── */

const NETEASE_AREAS: Record<MvArea, string> = { '': '全部', mainland: '内地', hktw: '港台', western: '欧美', korea: '韩国', japan: '日本' };

function neteaseMv(item: Raw, rank?: number): MvSummary {
  const detail = record(item.mv);
  const artists = rows(item.artists).length ? rows(item.artists) : rows(detail.artists);
  return {
    id: text(item.id),
    source: 'netease',
    title: text(item.name),
    artist: text(item.artistName) || artists.map(artist => text(artist.name)).join(' / ') || text(record(item.artist).name),
    // Only the lead artist's id: it must match the name shown. Unlinked artists have id 0.
    artistId: [item.artistId, record(item.artist).id, artists[0]?.id].map(text).find(id => id && id !== '0'),
    cover: mediaUrl(item.cover || item.imgurl16v9 || item.imgurl),
    duration: positive(item.duration) ?? positive(rows(detail.videos)[0]?.duration),
    playCount: positive(item.playCount),
    publishTime: time(item.publishTime ?? detail.publishTime),
    rank,
  };
}

async function neteaseList({ kind, area = '', keyword = '', artistId = '', offset, limit }: MvQuery): Promise<MvPage> {
  if (kind === 'top') {
    const json = await neteaseRequest('/mv/toplist', { area: area ? NETEASE_AREAS[area] : '', limit, offset, total: true });
    const items = rows(json.data).map((item, index) => neteaseMv(item, offset + index + 1));
    return page(items, offset, num(json.count), typeof json.hasMore === 'boolean' ? json.hasMore : undefined);
  }
  if (kind === 'hot' || kind === 'latest') {
    const tags = JSON.stringify({ 地区: NETEASE_AREAS[area], 类型: '全部', 排序: kind === 'hot' ? '最热' : '最新' });
    const json = await neteaseRequest('/mv/all', { tags, offset, limit, total: 'true' });
    return page(rows(json.data).map(item => neteaseMv(item)), offset, num(json.count), typeof json.hasMore === 'boolean' ? json.hasMore : undefined);
  }
  if (kind === 'artist') {
    const json = await neteaseRequest('/artist/mvs', { artistId, limit, offset, total: true });
    return page(rows(json.mvs).map(item => neteaseMv(item)), offset, undefined, Boolean(json.hasMore));
  }
  const result = record((await neteaseEapi('/api/cloudsearch/pc', { s: keyword, type: 1004, limit, offset, total: true })).result);
  return page(rows(result.mvs).map(item => neteaseMv(item)), offset, num(result.mvCount));
}

/* ───────── QQ ───────── */

const QQ_RANK_AREAS: Record<MvArea, number> = { '': 0, mainland: 1, hktw: 2, western: 3, korea: 4, japan: 5 };
const QQ_LIST_AREAS: Record<MvArea, number> = { '': 15, mainland: 16, hktw: 17, western: 18, korea: 19, japan: 20 };

function qqMv(item: Raw, extra: Partial<MvSummary> = {}): MvSummary {
  const singers = rows(item.singers ?? item.singer_list);
  return {
    id: text(item.vid ?? item.v_id),
    source: 'qq',
    title: text(item.title ?? item.name ?? item.mv_name),
    artist: singers.map(singer => text(singer.name)).join(' / ') || text(item.singer_name),
    artistId: text(singers[0]?.mid ?? item.singerMID) || undefined,
    cover: mediaUrl(item.picurl ?? item.cover_pic ?? item.mv_pic_url),
    duration: positive(item.duration) && Number(item.duration) * 1000,
    playCount: positive(item.playcnt ?? item.play_count),
    publishTime: time(item.pubdate ?? item.publish_date),
    ...extra,
  };
}

async function qqList({ kind, area = '', keyword = '', artistId = '', offset, limit }: MvQuery): Promise<MvPage> {
  if (kind === 'top') {
    // The ranking is a fixed short list without paging.
    if (offset > 0) return { items: [], total: offset, hasMore: false };
    const data = await qqRequest('video.VideoRankServer', 'get_video_rank_list', {
      rank_type: 0, area_type: QQ_RANK_AREAS[area], required: ['vid', 'name', 'pubdate', 'cover_pic', 'singers', 'playcnt', 'duration'],
    });
    const items = rows(data.rank_list).map(entry => {
      const rank = record(entry.rank_data);
      return qqMv(record(entry.video_info), { rank: num(rank.rank), playCount: positive(rank.week_play) ?? positive(record(entry.video_info).playcnt) });
    });
    return { items: unique(items), total: items.length, hasMore: false };
  }
  if (kind === 'hot' || kind === 'latest') {
    const data = await qqRequest('MvService.MvInfoProServer', 'GetAllocMvInfo', { order: kind === 'hot' ? 0 : 1, start: offset, size: limit, version_id: 7, area_id: QQ_LIST_AREAS[area] });
    return page(rows(data.list).map(item => qqMv(item)), offset, num(data.total));
  }
  if (kind === 'artist') {
    const data = await qqRequest('MvService.MvInfoProServer', 'GetSingerMvList', { singerid: 0, singermid: artistId, tagid: 0, start: offset, count: limit, order: 1 });
    return page(rows(data.list).map(item => qqMv(item, { artistId })), offset, num(data.total));
  }
  // The desktop-feed comm is required: the web one returns an empty MV tab.
  const data = await qqRequest('music.search.SearchCgiService', 'DoSearchForQQMusicDesktop', {
    grp: 1, num_per_page: limit, page_num: Math.floor(offset / limit) + 1, query: keyword, search_type: 4, searchid: String(Date.now()),
  }, { desktopFeed: true });
  const meta = record(data.meta);
  return page(rows(record(record(data.body).mv).list).map(item => qqMv(item)), offset, num(meta.sum), Number(meta.nextpage) > 0);
}

/* ───────── Kugou ───────── */

/** Search hits carry the bare picture file name; the date prefix is its directory. */
const kugouPicture = (value: unknown) => {
  const name = text(value);
  return /^\d{8}\w*\.\w+$/.test(name) ? `https://imge.kugou.com/mvhdpic/400/${name.slice(0, 8)}/${name}` : undefined;
};

async function kugouList(source: KugouSource, { kind, keyword = '', artistId = '', offset, limit }: MvQuery): Promise<MvPage> {
  const { kugouRequest } = createKugouClient(source);
  const pageNo = Math.floor(offset / limit) + 1;
  if (kind === 'artist') {
    if (!/^\d+$/.test(artistId)) throw new CatalogError('歌手标识无效', 400);
    // tag 18 = 官方版本; without it the list is mostly fan uploads.
    const json = await kugouRequest({ base: 'https://openapicdn.kugou.com', path: '/kmr/v1/author/videos', params: { author_id: artistId, is_fanmade: '', tag_idx: 18, pagesize: limit, page: pageNo } });
    const items = rows(json.data).map((item): MvSummary => ({
      id: text(item.video_id),
      source,
      title: text(item.video_name),
      artist: text(item.author_name),
      artistId,
      cover: mediaUrl(text(item.hdpic).replace('{size}', '400')) || mediaUrl(item.cover),
      duration: positive(item.timelength),
      playCount: positive(item.history_heat),
      publishTime: time(item.publish_date),
    }));
    return page(unique(items), offset, num(json.total));
  }
  if (kind !== 'search') return { items: [], total: 0, hasMore: false };
  const json = await kugouRequest({
    path: '/v1/search/mv', router: 'complexsearch.kugou.com',
    params: { albumhide: 0, iscorrection: 1, keyword, nocollect: 0, page: pageNo, pagesize: limit, platform: 'AndroidFilter' },
  });
  const data = record(json.data);
  const items = rows(data.lists).map((item): MvSummary => ({
    id: text(item.MvID),
    source,
    title: text(item.MvName),
    artist: text(item.SingerName),
    artistId: text(rows(item.Singers)[0]?.id) || undefined,
    cover: kugouPicture(item.Pic),
    duration: positive(item.Duration) && Number(item.Duration) * 1000,
    playCount: positive(item.HistoryHeat),
    publishTime: time(item.PublishDate),
  }));
  return page(unique(items), offset, num(data.total));
}

export async function musicVideoList(source: CatalogSource, query: MvQuery): Promise<MvPage> {
  if (query.kind === 'search' && !query.keyword?.trim()) throw new CatalogError('请输入搜索关键词', 400);
  if (query.kind === 'artist' && (!query.artistId || !/^[\w-]{1,64}$/.test(query.artistId))) throw new CatalogError('歌手标识无效', 400);
  if (source === 'netease') return neteaseList(query);
  if (source === 'qq') return qqList(query);
  if (source === 'kugou' || source === 'kugou-lite') return kugouList(source, query);
  throw new CatalogError('未知的曲库来源', 400);
}
