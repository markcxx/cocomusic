import { buildLyrics } from '../lrc';
import type { AudioQuality, CommentPage, CommentSort, Lyrics, SongComment, SongSource, SongStats } from '../types';
import { APPID, CLIENTVER, device, KugouError, kugouRequest, songKey as streamKey } from './client';
import { image, num, record, rows, splitSongKey, text, type Raw } from './mappers';

// Endpoints follow KugouMusicAPI module/song_url, search_lyric + lyric, comment_music(_classify), favorite_count.

/** Requested quality → Kugou quality names, best first. 128 is the only one free accounts get. */
const QUALITIES: Array<{ level: AudioQuality; quality: string }> = [
  { level: 'lossless', quality: 'flac' },
  { level: 'exhigh', quality: '320' },
  { level: 'standard', quality: '128' },
];
const ORDER: AudioQuality[] = ['hires', 'lossless', 'exhigh', 'higher', 'standard'];

const COMMENT_CODE = 'fc4be23b4e972707f36b8a828a93ba8a';

async function streamUrl(hash: string, albumId: string, albumAudioId: string, quality: string, freePart: boolean) {
  const { mid, userid } = device();
  const json = await kugouRequest<Raw>({
    path: '/v5/url', router: 'trackercdn.kugou.com', raw: true,
    params: {
      album_id: Number(albumId) || 0, area_code: 1, hash, ssa_flag: 'is_fromtrack', version: 11040, page_id: 151369488, quality,
      album_audio_id: Number(albumAudioId) || 0, behavior: 'play', pid: 2, cmd: 26, pidversion: 3001, IsFreePart: freePart ? 1 : 0,
      ppage_id: '463467626,350369493,788954147', cdnBackup: 1, kcard: 0, module: '', key: streamKey(hash, mid, userid),
    },
  });
  const urls = Array.isArray(json.url) ? json.url.map(text).filter(Boolean) : [];
  return { json, url: urls[0]?.replace(/^http:\/\//, 'https://') ?? '' };
}

export async function songSource(key: string, quality: AudioQuality = 'exhigh'): Promise<SongSource> {
  const { hash, albumId, albumAudioId } = splitSongKey(key);
  const start = Math.max(0, ORDER.indexOf(quality === 'hires' ? 'lossless' : quality === 'higher' ? 'standard' : quality));
  const candidates = QUALITIES.filter(item => ORDER.indexOf(item.level) >= start);
  let paid = false;
  for (const candidate of candidates) {
    const { json, url } = await streamUrl(hash, albumId, albumAudioId, candidate.quality, false).catch(() => ({ json: {} as Raw, url: '' }));
    if (Array.isArray(json.fail_process) && json.fail_process.length) paid = true;
    if (url) return { id: key, url, level: candidate.level, bitrate: num(json.bitRate) };
  }
  // No full stream for this account: Kugou serves a 60 s clip ("IsFreePart") for most paid songs.
  const { json, url } = await streamUrl(hash, albumId, albumAudioId, '128', true);
  if (url) {
    const offset = record(json.hash_offset);
    const end = num(offset.end_ms);
    const clipped = Number(offset.file_type) === 0 && end && end > 0;
    return {
      id: key, url, level: 'standard', bitrate: num(json.bitRate),
      trial: clipped ? { start: Math.round((num(offset.start_ms) ?? 0) / 1000), end: Math.round(end / 1000) } : undefined,
    };
  }
  throw new KugouError(paid ? '该歌曲需要酷狗音乐会员或购买后播放' : '该歌曲暂无版权，无法播放', 404);
}

export async function lyrics(key: string): Promise<Lyrics> {
  const { hash, albumAudioId } = splitSongKey(key);
  const found = await kugouRequest<Raw>({
    base: 'https://lyrics.kugou.com', path: '/v1/search', clear: true, raw: true,
    params: { album_audio_id: albumAudioId, appid: APPID, clientver: CLIENTVER, duration: 0, hash, keyword: '', lrctxt: 1, man: 'no' },
  });
  const candidate = rows(found.candidates)[0];
  if (!candidate) return { lines: [], synced: false };
  const json = await kugouRequest<Raw>({
    base: 'https://lyrics.kugou.com', path: '/download', raw: true,
    params: { ver: 1, client: 'android', id: text(candidate.id), accesskey: text(candidate.accesskey), fmt: 'lrc', charset: 'utf8' },
  });
  const lrc = text(json.content) ? Buffer.from(text(json.content), 'base64').toString('utf8') : '';
  if (!lrc.trim()) return { lines: [], synced: false };
  const result = buildLyrics(lrc);
  // Kugou marks instrumentals with a single "纯音乐，请欣赏" line.
  if (result.lines.length <= 2 && result.lines.some(line => /纯音乐/.test(line.text))) return { lines: [], synced: false, instrumental: true };
  return result;
}

function mapComment(item: Raw): SongComment {
  const ext = (() => { try { return record(JSON.parse(text(item.extdata) || '{}')); } catch { return {}; } })();
  return {
    id: text(item.id),
    content: text(item.content),
    time: Date.parse(text(item.addtime).replace(' ', 'T') + '+08:00') || 0,
    likedCount: num(record(item.like).count) ?? 0,
    replyCount: num(item.reply_num) || undefined,
    location: text(ext.city) || undefined,
    user: { id: text(item.user_id), nickname: text(item.user_name) || '酷狗用户', avatar: image(item.user_pic, 150), vip: Number(item.vip_type) > 0 },
    replyTo: text(item.pcontent) ? { nickname: text(item.puser) || '酷狗用户', content: text(item.pcontent) } : undefined,
  };
}

/**
 * Song comments by mixsongid (= album_audio_id). 推荐 uses the default weighted
 * thread; 最热 uses the like-ordered "歌曲相关" (type 13) listing. Kugou has no
 * time-ordered feed, so 最新 reorders each page of the default thread by time.
 * Cursor: next page number.
 */
export async function comments(key: string, sort: CommentSort, cursor: string | undefined, limit: number): Promise<CommentPage> {
  const { albumAudioId } = splitSongKey(key);
  if (!albumAudioId) return { items: [], total: 0, hasMore: false };
  const page = Math.max(1, Number(cursor) || 1);
  const thread = () => kugouRequest<Raw>({
    method: 'POST', path: '/mcomment/v1/cmtlist', raw: true,
    params: { mixsongid: albumAudioId, need_show_image: 1, p: page, pagesize: limit, show_classify: 1, show_hotword_list: 1, extdata: '0', code: COMMENT_CODE },
  });
  let json = sort === 'hot'
    ? await kugouRequest<Raw>({
      method: 'POST', path: '/mcomment/v1/cmt_classify_list', raw: true,
      params: { mixsongid: albumAudioId, need_show_image: 1, page, pagesize: limit, type_id: 13, extdata: '0', code: COMMENT_CODE, sort_method: 1 },
    }).catch(() => ({} as Raw))
    : await thread();
  // Smaller threads have no "歌曲相关" category: rank the default thread by likes instead.
  const hotFallback = sort === 'hot' && !rows(json.list).length;
  if (hotFallback) json = await thread();
  let list = rows(json.list);
  if (sort === 'latest') list = [...list].sort((a, b) => text(b.addtime).localeCompare(text(a.addtime)));
  if (hotFallback) list = [...list].sort((a, b) => (num(record(b.like).count) ?? 0) - (num(record(a.like).count) ?? 0));
  const total = num(json.count) ?? list.length;
  const items = list.map(mapComment);
  const maxPage = num(json.maxPage) ?? Infinity;
  const hasMore = items.length > 0 && page < maxPage && page * limit < total;
  return { items, total, hasMore, cursor: hasMore ? String(page + 1) : undefined };
}

export async function songStats(key: string): Promise<SongStats> {
  const { albumAudioId } = splitSongKey(key);
  if (!albumAudioId) return {};
  const [fav, thread] = await Promise.allSettled([
    kugouRequest<Raw>({ path: '/count/v1/audio/mget_collect', params: { mixsongids: albumAudioId } }),
    comments(key, 'recommend', undefined, 1),
  ]);
  return {
    likeCount: fav.status === 'fulfilled' ? num(rows(record(fav.value.data).list)[0]?.count) : undefined,
    commentCount: thread.status === 'fulfilled' ? thread.value.total : undefined,
  };
}
