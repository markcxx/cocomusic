import { CatalogError } from './errors';
import { neteaseEapi } from './netease/client';
import { record, rows, text } from './netease/mappers';
import { qqRequest } from './qq/client';
import { splitSongKey as qqKey } from './qq/mappers';
import { device, kugouRequest, songKey } from './kugou/client';
import { splitSongKey as kugouKey } from './kugou/mappers';
import type { CatalogSource } from './types';

export interface MvQuality { id: string; label: string; url: string }
export interface MusicVideo { id: string; source: CatalogSource; title: string; artist: string; cover?: string; qualities: MvQuality[] }
export function mediaUrl(value: unknown) {
  const url = text(value).replace(/^http:/, 'https:');
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? url : ''; } catch { return ''; }
}
const unavailable = () => new CatalogError('这首歌暂无可播放的官方 MV', 404);

export function qqQualities(value: unknown): MvQuality[] {
  const labels: Record<number, string> = { 0: '流畅', 10: '标清', 20: '高清', 30: '超清', 40: '蓝光', 50: '4K' };
  return rows(value).flatMap(item => {
    const urls = Array.isArray(item.freeflow_url) ? item.freeflow_url.map(mediaUrl).filter(Boolean) : [];
    return Number(item.code) === 0 && urls.length ? [{ id: text(item.filetype), label: labels[Number(item.filetype)] ?? `画质 ${item.filetype}`, url: urls.at(-1)! }] : [];
  }).reverse();
}

/** Only platform-associated official videos: never substitute a search hit or fan upload. */
export async function musicVideo(source: CatalogSource, songId: string): Promise<MusicVideo> {
  if (!songId || songId.length > 200 || !/^[\w.-]+$/.test(songId)) throw new CatalogError('歌曲标识无效', 400);
  if (source === 'netease') {
    const song = rows((await neteaseEapi('/api/v3/song/detail', { c: JSON.stringify([{ id: songId }]) })).songs)[0];
    if (!song?.mv) throw unavailable();
    const id = text(song.mv);
    const detail = record((await neteaseEapi('/api/mv/detail', { id })).data);
    const resolutions = Object.keys(record(detail.brs)).map(Number).filter(n => n > 0).sort((a, b) => b - a);
    const results = await Promise.allSettled(resolutions.map(async r => {
      const data = record((await neteaseEapi('/api/song/enhance/play/mv/url', { id, r })).data);
      return { id: text(data.r || r), label: `${data.r || r}P`, url: mediaUrl(data.url) };
    }));
    const qualities = results.flatMap(result => result.status === 'fulfilled' && result.value.url ? [result.value] : []).filter((q, i, all) => all.findIndex(x => x.id === q.id) === i);
    if (!qualities.length) throw unavailable();
    return { id, source, title: text(detail.name), artist: text(detail.artistName), cover: mediaUrl(detail.cover), qualities };
  }
  if (source === 'qq') {
    const song = await qqRequest('music.pf_song_detail_svr', 'get_song_detail_yqq', { song_mid: qqKey(songId).mid });
    const track = record(song.track_info);
    const id = text(record(track.mv).vid);
    if (!id) throw unavailable();
    const [streams, metadata] = await Promise.all([
      qqRequest('gosrf.Stream.MvUrlProxy', 'GetMvUrls', { vids: [id], request_typet: 10001 }),
      qqRequest('video.VideoDataServer', 'get_video_info_batch', { vidlist: [id], required: ['name', 'cover_pic'] }).catch(() => ({})),
    ]);
    const qualities = qqQualities(record(streams[id]).mp4);
    if (!qualities.length) throw unavailable();
    const info = record(record(metadata)[id]);
    return { id, source, title: text(info.name || track.name), artist: rows(track.singer).map(x => text(x.name)).join(' / '), cover: mediaUrl(info.cover_pic), qualities };
  }
  if (source === 'kugou') {
    const { albumAudioId } = kugouKey(songId);
    if (!albumAudioId) throw unavailable();
    const result = await kugouRequest({ method: 'POST', path: '/kmr/v1/audio/mv', router: 'openapi.kugou.com', headers: { 'KG-TID': '38' }, data: { data: [{ album_audio_id: albumAudioId }], fields: 'h264,authors' } });
    const lists = Array.isArray(result.data) ? result.data : [];
    const videos = lists.flatMap(rows).filter(x => Number(x.is_ugc) === 0 && Number(x.is_publish) === 1 && Number(x.have_mp4) === 1);
    videos.sort((a, b) => Number(b.is_recommend) - Number(a.is_recommend));
    const mv = videos[0];
    if (!mv) throw unavailable();
    const formats = record(mv.h264);
    const results = await Promise.allSettled(['fhd', 'hd', 'qhd', 'sd', 'ld'].map(async quality => {
      const hash = text(formats[`${quality}_hash`]).toLowerCase();
      if (!/^[a-f0-9]{32}$/.test(hash)) return null;
      const size = Math.min(Number(formats[`${quality}_width`]), Number(formats[`${quality}_height`]));
      return { id: quality, label: size ? `${size}P` : quality.toUpperCase(), url: `/api/music/mv/stream?hash=${hash}` };
    }));
    const qualities = results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
    if (!qualities.length) throw unavailable();
    return { id: text(mv.video_id), source, title: text(mv.mv_name), artist: text(mv.singer), cover: mediaUrl(text(mv.hdpic).replace('{size}', '720')), qualities };
  }
  throw new CatalogError('未知的曲库来源', 400);
}

/** Kugou's video CDN is HTTP-only; resolve server-side without weakening TLS checks. */
export async function kugouVideoUrl(hash: string) {
  if (!/^[a-f0-9]{32}$/i.test(hash)) throw new CatalogError('视频标识无效', 400);
  const { mid, userid } = device();
  const result = await kugouRequest({ path: '/v2/interface/index', router: 'trackermv.kugou.com', params: { backupdomain: 1, cmd: 123, ext: 'mp4', ismp3: 0, hash, pid: 1, type: 1, key: songKey(hash, mid, userid) } });
  const value = text(record(record(result.data)[hash.toLowerCase()]).downurl);
  let url: URL;
  try { url = new URL(value); } catch { throw unavailable(); }
  if (!['http:', 'https:'].includes(url.protocol) || !['fsmvpc.kugou.com', 'fsmvpc.tx.kugou.com'].includes(url.hostname) || url.port || url.username || url.password) throw unavailable();
  return url.href;
}
