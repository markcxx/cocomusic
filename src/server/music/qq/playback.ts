import { buildLyrics } from '../lrc';
import type { AudioQuality, CommentPage, CommentSort, Lyrics, SongComment, SongSource, SongStats } from '../types';
import { QQError, qqRequest } from './client';
import { https, num, record, rows, splitSongKey, text, type Raw } from './mappers';

/**
 * Stream files by quality: [file-name prefix, extension, size field in `file`].
 * Higher levels need a membership; we try from the requested level downward
 * and take the first one the vkey service signs for this account.
 */
const FILES: Array<{ level: AudioQuality; prefix: string; ext: string; size: string }> = [
  { level: 'lossless', prefix: 'F000', ext: 'flac', size: 'size_flac' },
  { level: 'exhigh', prefix: 'M800', ext: 'mp3', size: 'size_320mp3' },
  { level: 'higher', prefix: 'M500', ext: 'mp3', size: 'size_128mp3' },
  { level: 'standard', prefix: 'C400', ext: 'm4a', size: 'size_96aac' },
];
const ORDER: AudioQuality[] = ['hires', 'lossless', 'exhigh', 'higher', 'standard'];

async function trackInfo(mid: string) {
  const data = await qqRequest<Raw>('music.trackInfo.UniformRuleCtrl', 'CgiGetTrackInfo', { mids: [mid], types: [0] });
  const track = rows(data.tracks)[0];
  if (!track) throw new QQError('歌曲不存在或已下架', 404);
  return track;
}

/** Official vkey service (music.vkey.GetVkey / UrlGetVkey). Returns a full URL or ''. */
async function vkey(mid: string, filename: string) {
  const data = await qqRequest<Raw>('music.vkey.GetVkey', 'UrlGetVkey', {
    guid: '10000', songmid: [mid], songtype: [0], uin: '0', loginflag: 1, platform: '20', filename: [filename],
  });
  const info = rows(data.midurlinfo)[0];
  const purl = text(info?.purl);
  if (!purl) return '';
  const hosts = Array.isArray(data.sip) ? data.sip.map(text) : [];
  const host = hosts.find(item => item.startsWith('https://')) ?? (hosts[0] ? hosts[0].replace(/^http:\/\//, 'https://') : 'https://isure.stream.qqmusic.qq.com/');
  return host + purl;
}

export async function songSource(key: string, quality: AudioQuality = 'exhigh'): Promise<SongSource> {
  const { mid } = splitSongKey(key);
  const track = await trackInfo(mid);
  const file = record(track.file);
  const mediaMid = text(file.media_mid) || mid;
  const start = Math.max(0, ORDER.indexOf(quality === 'hires' ? 'lossless' : quality));
  const candidates = FILES.filter(item => ORDER.indexOf(item.level) >= start && Number(file[item.size]) > 0);
  for (const candidate of candidates) {
    const url = await vkey(mid, `${candidate.prefix}${mediaMid}.${candidate.ext}`).catch(() => '');
    if (url) return { id: key, url, level: candidate.level };
  }
  // No full stream for this account: the preview clip (RS02) when QQ offers one.
  const tryBegin = num(file.try_begin);
  const tryEnd = num(file.try_end);
  if (Number(file.size_try) > 0 || (tryEnd && tryBegin !== undefined && tryEnd > tryBegin)) {
    const url = await vkey(mid, `RS02${mediaMid}.mp3`).catch(() => '');
    if (url) {
      return {
        id: key, url, level: 'standard',
        trial: tryBegin !== undefined && tryEnd ? { start: Math.round(tryBegin / 1000), end: Math.round(tryEnd / 1000) } : { start: 0, end: 30 },
      };
    }
  }
  throw new QQError(Number(record(track.pay).pay_play) === 1 ? '该歌曲需要 QQ 音乐会员或购买后播放' : '该歌曲暂无版权，无法播放', 404);
}

const decode = (value: unknown) => {
  const raw = text(value);
  if (!raw) return '';
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    // Real LRC once decoded; otherwise the value was already plain text.
    return /\[\d{1,3}:\d{1,2}|\[(ti|ar|al|by|offset):/.test(decoded) ? decoded : raw;
  } catch { return raw; }
};

export async function lyrics(key: string): Promise<Lyrics> {
  const { mid, id } = splitSongKey(key);
  const songId = id ? Number(id) : Number((await trackInfo(mid)).id);
  const data = await qqRequest<Raw>('music.musichallSong.PlayLyricInfo', 'GetPlayLyricInfo', { crypt: 0, roma: 0, songID: songId, trans: 1, type: 0 });
  const original = decode(data.lyric);
  if (!original.trim()) return { lines: [], synced: false, instrumental: /纯音乐/.test(text(data.songName)) };
  // QQ prefixes the first line with "title - artist"; it is real lyric text, keep it.
  return buildLyrics(original, decode(data.trans).replace(/\/\//g, ''));
}

function mapComment(item: Raw): SongComment {
  const replied = rows(item.SubComments)[0] ?? record(item.RepliedComment);
  return {
    id: text(item.CmId ?? item.SeqNo),
    content: text(item.Content).replace(/\[em\]e\d+\[\/em\]/g, ''),
    time: (num(item.PubTime) ?? 0) * 1000,
    likedCount: num(item.PraiseNum) ?? 0,
    replyCount: num(item.ReplyCnt) || undefined,
    location: text(item.Location) || undefined,
    user: { id: text(item.EncryptUin), nickname: text(item.Nick) || 'QQ 音乐用户', avatar: https(item.Avatar), vip: Boolean(item.VipIcon) },
    replyTo: text(replied?.Content) ? { nickname: text(replied.Nick) || 'QQ 音乐用户', content: text(replied.Content) } : undefined,
  };
}

/**
 * Song comments (music.globalComment.CommentRead). 最热 uses GetHotCommentList;
 * 推荐 and 最新 use GetNewCommentList, paged by the last comment's SeqNo.
 * Opaque cursor: "<pageNo>:<lastSeqNo>".
 */
export async function comments(key: string, sort: CommentSort, cursor: string | undefined, limit: number): Promise<CommentPage> {
  const { mid, id } = splitSongKey(key);
  const bizId = id ?? text((await trackInfo(mid)).id);
  const [pageText, lastSeq = ''] = (cursor ?? '').split(/:(.*)/s);
  const pageNum = Math.max(0, Number(pageText) || 0);
  const hot = sort === 'hot';
  const data = await qqRequest<Raw>('music.globalComment.CommentRead', hot ? 'GetHotCommentList' : 'GetNewCommentList', hot
    ? { BizType: 1, BizId: bizId, LastCommentSeqNo: lastSeq, PageSize: limit, PageNum: pageNum, HotType: 1, WithAirborne: 0, PicEnable: 1 }
    : { BizType: 1, BizId: bizId, LastCommentSeqNo: lastSeq, PageSize: limit, PageNum: pageNum, FromCommentId: '', WithHot: 0, PicEnable: 1 });
  const list = record(data.CommentList);
  const raw = rows(list.Comments);
  const items = raw.map(mapComment);
  const hasMore = Boolean(Number(list.HasMore)) && items.length > 0;
  return {
    items,
    total: num(list.Total) ?? items.length,
    hasMore,
    cursor: hasMore ? `${pageNum + 1}:${text(raw[raw.length - 1]?.SeqNo)}` : undefined,
  };
}

export async function songStats(key: string): Promise<SongStats> {
  const { mid, id } = splitSongKey(key);
  const songId = id ? Number(id) : Number((await trackInfo(mid)).id);
  const [fans, thread] = await Promise.allSettled([
    qqRequest<Raw>('music.musicasset.SongFavRead', 'GetSongFansNumberById', { v_songId: [songId] }),
    comments(`${mid}.${songId}`, 'latest', undefined, 1),
  ]);
  return {
    likeCount: fans.status === 'fulfilled' ? num(record(fans.value.m_numbers)[String(songId)]) : undefined,
    commentCount: thread.status === 'fulfilled' ? thread.value.total : undefined,
  };
}
