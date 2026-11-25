import { CatalogError } from './errors';
import { neteaseEapi } from './netease/client';
import { record, rows, text, type Raw } from './netease/mappers';
import { qqRequest } from './qq/client';
import { splitSongKey as qqKey } from './qq/mappers';
import { createKugouClient } from './kugou/client';
import type { KugouSource } from './kugou/config';
import { splitSongKey as kugouKey } from './kugou/mappers';
import type { CatalogSource } from './types';

export interface MvQuality { id: string; label: string; url: string }
export interface MusicVideo { id: string; source: CatalogSource; title: string; artist: string; artistId?: string; cover?: string; qualities: MvQuality[] }
export function mediaUrl(value: unknown) {
  const url = text(value).replace(/^http:/, 'https:');
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? url : ''; } catch { return ''; }
}
const unavailable = () => new CatalogError('这首歌暂无可播放的官方 MV', 404);
const videoGone = () => new CatalogError('这个 MV 暂时无法播放', 404);
const validId = (id: string) => Boolean(id) && id.length <= 200 && /^[\w.-]+$/.test(id);

export function qqQualities(value: unknown): MvQuality[] {
  const labels: Record<number, string> = { 0: '流畅', 10: '标清', 20: '高清', 30: '超清', 40: '蓝光', 50: '4K' };
  return rows(value).flatMap(item => {
    const urls = Array.isArray(item.freeflow_url) ? item.freeflow_url.map(mediaUrl).filter(Boolean) : [];
    return Number(item.code) === 0 && urls.length ? [{ id: text(item.filetype), label: labels[Number(item.filetype)] ?? `画质 ${item.filetype}`, url: urls.at(-1)! }] : [];
  }).reverse();
}

async function neteaseVideo(id: string): Promise<MusicVideo | null> {
  const detail = record((await neteaseEapi('/api/mv/detail', { id })).data);
  const resolutions = Object.keys(record(detail.brs)).map(Number).filter(n => n > 0).sort((a, b) => b - a);
  const results = await Promise.allSettled(resolutions.map(async r => {
    const data = record((await neteaseEapi('/api/song/enhance/play/mv/url', { id, r })).data);
    return { id: text(data.r || r), label: `${data.r || r}P`, url: mediaUrl(data.url) };
  }));
  const qualities = results.flatMap(result => result.status === 'fulfilled' && result.value.url ? [result.value] : []).filter((q, i, all) => all.findIndex(x => x.id === q.id) === i);
  if (!qualities.length) return null;
  return { id, source: 'netease', title: text(detail.name), artist: text(detail.artistName), artistId: text(detail.artistId) || undefined, cover: mediaUrl(detail.cover), qualities };
}

async function qqVideo(vid: string, track: Raw = {}): Promise<MusicVideo | null> {
  const [streams, metadata] = await Promise.all([
    qqRequest('gosrf.Stream.MvUrlProxy', 'GetMvUrls', { vids: [vid], request_typet: 10001 }),
    qqRequest('video.VideoDataServer', 'get_video_info_batch', { vidlist: [vid], required: ['name', 'cover_pic', 'singers'] }).catch(() => ({})),
  ]);
  const qualities = qqQualities(record(streams[vid]).mp4);
  if (!qualities.length) return null;
  const info = record(record(metadata)[vid]);
  const singers = rows(info.singers).length ? rows(info.singers) : rows(track.singer);
  return {
    id: vid, source: 'qq', title: text(info.name || track.name), artist: singers.map(x => text(x.name)).join(' / '),
    artistId: text(singers[0]?.mid) || undefined, cover: mediaUrl(info.cover_pic), qualities,
  };
}

/** Kugou streams are addressed by per-rendition hash and proxied by /api/music/mv/stream (HTTP-only CDN). */
function kugouQualities(source: KugouSource, field: (key: string) => unknown) {
  return ['fhd', 'hd', 'qhd', 'sd', 'ld'].flatMap(quality => {
    const hash = text(field(`${quality}_hash`)).toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(hash)) return [];
    const size = Math.min(Number(field(`${quality}_width`)), Number(field(`${quality}_height`)));
    return [{ id: quality, label: size ? `${size}P` : quality.toUpperCase(), url: `/api/music/mv/stream?hash=${hash}${source === 'kugou-lite' ? '&source=kugou-lite' : ''}` }];
  });
}
const kugouCover = (value: unknown) => mediaUrl(text(value).replace('{size}', '720'));

async function kugouVideo(source: KugouSource, videoId: string): Promise<MusicVideo | null> {
  if (!/^\d+$/.test(videoId)) throw new CatalogError('MV 标识无效', 400);
  const { kugouRequest, device, paramsKey, APPID, CLIENTVER } = createKugouClient(source);
  const { dfid, mid, token } = device();
  const clienttime = Math.floor(Date.now() / 1000);
  const result = await kugouRequest({
    method: 'POST', path: '/v1/video', router: 'kmr.service.kugou.com', clear: true,
    data: { appid: APPID, clientver: CLIENTVER, clienttime, mid, uuid: '-', dfid, token, key: paramsKey(clienttime), show_resolution: 1, data: [{ video_id: videoId }] },
  });
  const video = rows(result.data)[0];
  if (!video || Number(video.deleted) === 1) return null;
  const qualities = kugouQualities(source, key => video[key]);
  if (!qualities.length) return null;
  return { id: videoId, source, title: text(video.video_name), artist: text(video.author_name), cover: kugouCover(video.hdpic), qualities };
}

/** Only platform-associated official videos: never substitute a search hit or fan upload. */
export async function musicVideo(source: CatalogSource, songId: string): Promise<MusicVideo> {
  if (!validId(songId)) throw new CatalogError('歌曲标识无效', 400);
  if (source === 'netease') {
    const song = rows((await neteaseEapi('/api/v3/song/detail', { c: JSON.stringify([{ id: songId }]) })).songs)[0];
    const video = song?.mv ? await neteaseVideo(text(song.mv)) : null;
    if (!video) throw unavailable();
    return video;
  }
  if (source === 'qq') {
    const song = await qqRequest('music.pf_song_detail_svr', 'get_song_detail_yqq', { song_mid: qqKey(songId).mid });
    const track = record(song.track_info);
    const vid = text(record(track.mv).vid);
    const video = vid ? await qqVideo(vid, track) : null;
    if (!video) throw unavailable();
    return video;
  }
  if (source === 'kugou' || source === 'kugou-lite') {
    const { kugouRequest } = createKugouClient(source);
    const { albumAudioId } = kugouKey(songId);
    if (!albumAudioId) throw unavailable();
    const result = await kugouRequest({ method: 'POST', path: '/kmr/v1/audio/mv', router: 'openapi.kugou.com', headers: { 'KG-TID': '38' }, data: { data: [{ album_audio_id: albumAudioId }], fields: 'h264,authors' } });
    const lists = Array.isArray(result.data) ? result.data : [];
    const videos = lists.flatMap(rows).filter(x => Number(x.is_ugc) === 0 && Number(x.is_publish) === 1 && Number(x.have_mp4) === 1);
    videos.sort((a, b) => Number(b.is_recommend) - Number(a.is_recommend));
    const mv = videos[0];
    if (!mv) throw unavailable();
    const formats = record(mv.h264);
    const qualities = kugouQualities(source, key => formats[key]);
    if (!qualities.length) throw unavailable();
    return { id: text(mv.video_id), source, title: text(mv.mv_name), artist: text(mv.singer), cover: kugouCover(mv.hdpic), qualities };
  }
  throw new CatalogError('未知的曲库来源', 400);
}

/** A video picked from an MV list or search: NetEase MV id, QQ vid or Kugou video id. */
export async function musicVideoById(source: CatalogSource, id: string): Promise<MusicVideo> {
  if (!validId(id)) throw new CatalogError('MV 标识无效', 400);
  let video: MusicVideo | null;
  if (source === 'netease') video = await neteaseVideo(id);
  else if (source === 'qq') video = await qqVideo(id);
  else if (source === 'kugou' || source === 'kugou-lite') video = await kugouVideo(source, id);
  else throw new CatalogError('未知的曲库来源', 400);
  if (!video) throw videoGone();
  return video;
}

/** Kugou's video CDN is HTTP-only; resolve server-side without weakening TLS checks. */
export async function kugouVideoUrl(hash: string, source: KugouSource = 'kugou') {
  const { device, kugouRequest, songKey } = createKugouClient(source);
  if (!/^[a-f0-9]{32}$/i.test(hash)) throw new CatalogError('视频标识无效', 400);
  const { mid, userid } = device();
  const result = await kugouRequest({ path: '/v2/interface/index', router: 'trackermv.kugou.com', params: { backupdomain: 1, cmd: 123, ext: 'mp4', ismp3: 0, hash, pid: 1, type: 1, key: songKey(hash, mid, userid) } });
  const value = text(record(record(result.data)[hash.toLowerCase()]).downurl);
  let url: URL;
  try { url = new URL(value); } catch { throw unavailable(); }
  if (!['http:', 'https:'].includes(url.protocol) || !['fsmvpc.kugou.com', 'fsmvpc.tx.kugou.com'].includes(url.hostname) || url.port || url.username || url.password) throw unavailable();
  return url.href;
}
