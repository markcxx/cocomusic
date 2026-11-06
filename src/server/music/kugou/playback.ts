import { inflateSync } from 'node:zlib';
import { attachWords, buildLyrics, parseWordLyrics } from '../lrc';
import type { AudioQuality, CommentPage, CommentSort, Lyrics, SongComment, SongSource, SongStats } from '../types';
import { createKugouClient, KugouError, type KugouClient } from './client';
import { image, num, record, rows, splitSongKey, text, type Raw } from './mappers';

/** Report actual upstream format/bitrate, not the quality we asked for. */
export function mapKugouStream(id: string, json: Raw, url: string): SongSource {
  const bytes = num(json.fileSize ?? json.filesize) ?? 0;
  const seconds = num(json.timeLength) ?? 0;
  // Some full Ogg streams report bitRate=0; size/duration gives their average
  // bitrate instead of assigning the quality that happened to be requested.
  const bitrate = num(json.bitRate ?? json.bitrate) || (bytes > 0 && seconds > 0 ? Math.round(bytes * 8 / seconds) : undefined);
  const format = text(json.extName ?? json.extname).toLowerCase();
  const q = text(json.q ?? json.quality).toLowerCase();
  const level = q === 'high' || q === 'hires' ? 'hires' : ['flac', 'ape', 'wav'].includes(format) || q === 'flac' ? 'lossless'
    : bitrate ? bitrate >= 256000 ? 'exhigh' : bitrate >= 160000 ? 'higher' : 'standard'
    : q === '320' ? 'exhigh' : q === '128' ? 'standard' : undefined;
  const offset = record(json.hash_offset);
  const start = num(offset.start_ms) ?? 0;
  const end = num(offset.end_ms) ?? 0;
  return { id, url, level, bitrate, trial: Number(offset.file_type) === 0 && end > start ? { start: start / 1000, end: end / 1000 } : undefined };
}

export function createKugouPlayback(client: KugouClient = createKugouClient()) {
  const { APPID, CLIENTVER, device, kugouRequest } = client;
  const SOURCE = client.source;
  const streamKey = client.songKey;

  /** Requested quality → Kugou quality names, best first. 128 is the only one free accounts get. */
  const QUALITIES: Array<{ level: AudioQuality; quality: string }> = [
    ...(SOURCE === 'kugou-lite' ? [{ level: 'hires' as const, quality: 'high' }] : []),
    { level: 'lossless', quality: 'flac' },
    { level: 'exhigh', quality: '320' },
    { level: 'standard', quality: '128' },
  ];
  const ORDER: AudioQuality[] = ['hires', 'lossless', 'exhigh', 'higher', 'standard'];

  const COMMENT_CODE = 'fc4be23b4e972707f36b8a828a93ba8a';

  async function conceptResources(hash: string, albumId: string, behavior: 'play' | 'download') {
    const json = await kugouRequest<Raw>({
      method: 'POST', path: '/v2/get_res_privilege/lite', router: 'media.store.kugou.com',
      data: {
        appid: APPID, clientver: CLIENTVER, area_code: 1, behavior, need_hash_offset: 1, relate: 1, support_verify: 1,
        // Including album_audio_id here suppresses some standard Ogg resources.
        resource: [{ type: 'audio', page_id: 0, hash, album_id: albumId || 0 }],
        qualities: ['128', '320', 'flac', 'high', 'viper_atmos', 'viper_tape', 'viper_clear', 'super', 'multitrack'],
      },
    });
    const resource = rows(json.data)[0];
    if (!resource) throw new KugouError('酷狗未返回歌曲资源信息，请稍后重试');
    return resource;
  }

  async function streamUrl(hash: string, albumId: string, albumAudioId: string, quality: string, freePart: boolean, behavior: 'play' | 'download' = 'play') {
    const { mid, userid } = device();
    const config = client.config;
    let auth: Raw = {};
    if (SOURCE === 'kugou-lite' && device().token && behavior === 'play') {
      const user = await kugouRequest<Raw>({ path: '/v1/user_verify', router: 'trackercdngz.kugou.com', params: { module_id: 51 } });
      const authorization = text(record(user.data).auth);
      if (!authorization.trim()) throw new KugouError('酷狗未返回用户播放授权，请稍后重试');
      const authorized = await kugouRequest<Raw>({ path: '/v1/authorization', router: 'trackercdngz.kugou.com', params: { module_id: 51, authorization, album_audio_id: Number(albumAudioId) || 0, hash, clientver: 11561 } });
      auth = record(authorized.data);
      if (!auth.auth && !auth.open_time) throw new KugouError('酷狗未返回歌曲播放授权，请稍后重试');
    }
    const json = await kugouRequest<Raw>({
      // The authorized /tracker path is routed by the gateway itself. Sending
      // it to the legacy trackercdn router returns HTTP 404 for signed-in users.
      path: auth.auth || auth.open_time ? '/tracker/v5/url' : '/v5/url', router: auth.auth || auth.open_time ? undefined : 'trackercdn.kugou.com', raw: true,
      params: {
        album_id: Number(albumId) || 0, area_code: 1, hash, ssa_flag: 'is_fromtrack', version: 11430, page_id: config.pageId, quality,
        album_audio_id: Number(albumAudioId) || 0, behavior, pid: config.pid, cmd: 26, pidversion: 3001,
        ppage_id: config.parentPage, cdnBackup: 1, module: '', key: streamKey(hash, mid, userid),
        ...(SOURCE === 'kugou-lite' ? { need_ogg: 1 } : {}),
        ...(auth.auth || auth.open_time ? { auth: text(auth.auth), open_time: text(auth.open_time) || 0, module_id: 51, need_m: 0, mtype: 0, ptype: 0, clientver: 11561 } : { IsFreePart: freePart ? 1 : 0, clientver: 11430 }),
      },
    });
    const urls = Array.isArray(json.url) ? json.url.map(text).filter(url => /^https?:\/\//.test(url)) : [];
    // Concept's youth CDN can be HTTP-only (its HTTPS certificate is for another
    // hostname). Preserve the signed upstream URL; never disable TLS validation.
    return { json, url: urls[0] ?? '' };
  }

  async function resolveSource(key: string, quality: AudioQuality = 'exhigh', behavior: 'play' | 'download' = 'play'): Promise<SongSource> {
    await client.ensureDevice();
    const { hash, albumId, albumAudioId } = splitSongKey(key);
    const start = Math.max(0, ORDER.indexOf(quality === 'hires' && SOURCE === 'kugou' ? 'lossless' : quality === 'higher' ? 'standard' : quality));
    const candidates = QUALITIES.filter(item => ORDER.indexOf(item.level) >= start);
    const resource = SOURCE === 'kugou-lite' && device().token && behavior === 'play'
      ? await conceptResources(hash, albumId, behavior) : undefined;
    const goods = rows(resource?.relate_goods);
    const resolvedAlbum = text(resource?.album_id) || albumId;
    const resolvedAudio = text(resource?.album_audio_id) || albumAudioId;
    let paid = false;
    let preview: SongSource | undefined;
    for (const candidate of candidates) {
      const good = goods.find(item => text(item.quality) === candidate.quality && Number(item.status) === 1)
        ?? goods.find(item => text(item.quality) === candidate.quality);
      // Concept grants standard-quality free listening through the song auth
      // chain even when mediastore's generic VIP privilege marks it restricted.
      // Let the authenticated tracker decide, as the concept client does.
      if (resource && goods.length && candidate.quality !== '128' && (!good || Number(good.status) === 0)) { paid ||= Number(good?.privilege) > 0; continue; }
      const oggHash = candidate.quality === '128' || candidate.quality === '320'
        ? text(record(resource?.trans_param)[`ogg_${candidate.quality}_hash`]) : '';
      const resourceHash = oggHash || text(good?.hash) || hash;
      const { json, url } = await streamUrl(resourceHash, resolvedAlbum, resolvedAudio, candidate.quality, false, behavior);
      if (Array.isArray(json.fail_process) && json.fail_process.length) paid = true;
      if (url) {
        const result = mapKugouStream(key, json, url);
        if (!result.trial) return result;
        preview ??= result;
      }
    }
    // No full stream for this account: Kugou serves a 60 s clip ("IsFreePart") for most paid songs.
    if (preview) return preview;
    // The authorized concept endpoint does not implement IsFreePart. Retrying
    // it as a clip repeats the same request and cannot grant playback rights.
    if (resource) throw new KugouError(paid ? '当前账号没有可用的歌曲播放权益' : '酷狗未返回可用的播放地址', 403);
    const { json, url } = await streamUrl(hash, albumId, albumAudioId, '128', true, behavior);
    if (url) return mapKugouStream(key, json, url);
    throw new KugouError(paid ? '该歌曲需要酷狗音乐会员或购买后播放' : '该歌曲暂无版权，无法播放', 404);
  }

  const songSource = (key: string, quality?: AudioQuality) => resolveSource(key, quality, 'play');
  const downloadSource = (key: string, quality?: AudioQuality) => resolveSource(key, quality, 'download');

  /** KRC: base64 → skip 4-byte "krc1" header → XOR with Kugou's key → zlib. */
  const KRC_KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];
  function decodeKrc(content: string) {
    if (!content) return '';
    const bytes = Buffer.from(content, 'base64').subarray(4);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] ^= KRC_KEY[index % KRC_KEY.length];
    return inflateSync(bytes).toString('utf8');
  }

  async function lyrics(key: string): Promise<Lyrics> {
    const { hash, albumAudioId } = splitSongKey(key);
    const found = await kugouRequest<Raw>({
      base: 'https://lyrics.kugou.com', path: '/v1/search', clear: true, raw: true,
      params: { album_audio_id: albumAudioId, appid: APPID, clientver: CLIENTVER, duration: 0, hash, keyword: '', lrctxt: 1, man: 'no' },
    });
    const candidate = rows(found.candidates)[0];
    if (!candidate) return { lines: [], synced: false };
    const download = (fmt: 'krc' | 'lrc') => kugouRequest<Raw>({
      base: 'https://lyrics.kugou.com', path: '/download', raw: true,
      params: { ver: 1, client: 'android', id: text(candidate.id), accesskey: text(candidate.accesskey), fmt, charset: 'utf8' },
    });
    // KRC carries word timing (逐字); plain LRC is the fallback.
    const krc = await download('krc').then(json => decodeKrc(text(json.content))).catch(() => '');
    const words = krc ? parseWordLyrics(krc) : [];
    const json = await download('lrc');
    const lrc = text(json.content) ? Buffer.from(text(json.content), 'base64').toString('utf8') : '';
    if (!lrc.trim() && !words.length) return { lines: [], synced: false };
    const built = lrc.trim() ? buildLyrics(lrc) : { lines: words, synced: true };
    const result = words.length && built.synced ? { ...built, lines: attachWords(built.lines, words) } : built;
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
  async function comments(key: string, sort: CommentSort, cursor: string | undefined, limit: number): Promise<CommentPage> {
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

  async function songStats(key: string): Promise<SongStats> {
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

  return { songSource, downloadSource, lyrics, songStats, comments };
}
export const { songSource, lyrics, songStats, comments } = createKugouPlayback();
