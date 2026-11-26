import { PlaybackUnavailableError } from '../errors';
import { buildLyrics } from '../lrc';
import type { AudioQuality, Lyrics, SongSource, SongStats } from '../types';
import { createHash } from 'node:crypto';
import { session } from '../session';
import { qqEnsureLogin } from './auth';
import { auth, QQError, qqRequest } from './client';
import { comments } from './comments';
import { num, record, rows, splitSongKey, text, type Raw } from './mappers';

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

/** Stable per-install device guid (32 hex), like the official client sends. */
const GUID = createHash('md5').update(session.deviceId()).digest('hex');

export async function trackInfo(mid: string) {
  const data = await qqRequest<Raw>('music.trackInfo.UniformRuleCtrl', 'CgiGetTrackInfo', { mids: [mid], types: [0] });
  if (!Array.isArray(data.tracks)) throw new QQError('QQ 音乐未返回歌曲信息');
  const track = rows(data.tracks)[0];
  if (!track) throw new PlaybackUnavailableError('歌曲不存在或已下架', 404);
  return track;
}

/** Official vkey service (music.vkey.GetVkey / UrlGetVkey). Returns a full URL or ''. */
async function vkey(mid: string, filename: string) {
  // The vkey is signed for the uin in the params: it must be the logged-in user,
  // otherwise QQ hands out anonymous (trial-only) keys even for VIP accounts.
  const login = auth();
  const data = await qqRequest<Raw>('music.vkey.GetVkey', 'UrlGetVkey', {
    guid: GUID, songmid: [mid], songtype: [0], uin: login?.uin ?? '0', loginflag: 1, platform: '20', filename: [filename],
  });
  const info = rows(data.midurlinfo)[0];
  if (!info || typeof info.purl !== 'string') throw new QQError('QQ 音乐未返回播放授权结果');
  const purl = text(info.purl);
  if (!purl) return '';
  const hosts = Array.isArray(data.sip) ? data.sip.map(text) : [];
  const host = hosts.find(item => item.startsWith('https://')) ?? (hosts[0] ? hosts[0].replace(/^http:\/\//, 'https://') : 'https://isure.stream.qqmusic.qq.com/');
  return host + purl;
}

export async function songSource(key: string, quality: AudioQuality = 'exhigh'): Promise<SongSource> {
  const source = await resolveSource(key, quality);
  // A logged-in account getting only a preview often means the musickey lapsed:
  // renew it and ask once more (a real non-VIP account just gets the preview again).
  if (source.trial && auth() && (await qqEnsureLogin()) === 'renewed') return resolveSource(key, quality);
  return source;
}

async function resolveSource(key: string, quality: AudioQuality): Promise<SongSource> {
  const { mid } = splitSongKey(key);
  const track = await trackInfo(mid);
  const file = record(track.file);
  const mediaMid = text(file.media_mid) || mid;
  const durationSec = num(track.interval) ?? 0;
  const tryBegin = num(file.try_begin);
  const tryEnd = num(file.try_end);
  // QQ marks the official chorus/highlight clip on `file.try_begin`/`try_end` (ms) for full tracks too.
  const chorus = tryBegin !== undefined && tryEnd && tryEnd > tryBegin
    ? { start: Math.round(tryBegin / 1000), end: Math.round(tryEnd / 1000) }
    : undefined;
  const start = Math.max(0, ORDER.indexOf(quality === 'hires' ? 'lossless' : quality));
  const candidates = FILES.filter(item => ORDER.indexOf(item.level) >= start && Number(file[item.size]) > 0);
  let requestError: unknown;
  const getKey = async (filename: string) => {
    try { return await vkey(mid, filename); }
    catch (error) {
      if (error instanceof QQError && error.status === 401) throw error;
      requestError = error;
      return '';
    }
  };
  for (const candidate of candidates) {
    const url = await getKey(`${candidate.prefix}${mediaMid}.${candidate.ext}`);
    if (url) {
      const bytes = Number(file[candidate.size]) || 0;
      const bitrate = bytes > 0 && durationSec > 0 ? Math.round((bytes * 8) / durationSec) : undefined;
      return { id: key, url, level: candidate.level, ...(bitrate ? { bitrate } : {}), ...(chorus ? { chorus } : {}) };
    }
  }
  // No full stream for this account: the preview clip (RS02) when QQ offers one.
  if (Number(file.size_try) > 0 || (tryEnd && tryBegin !== undefined && tryEnd > tryBegin)) {
    const url = await getKey(`RS02${mediaMid}.mp3`);
    if (url) {
      return {
        id: key, url, level: 'standard',
        trial: chorus ?? { start: 0, end: 30 },
      };
    }
  }
  if (requestError) throw requestError;
  throw new PlaybackUnavailableError(Number(record(track.pay).pay_play) === 1 ? '该歌曲需要 QQ 音乐会员或购买后播放' : '该歌曲暂无版权，无法播放', 404);
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
