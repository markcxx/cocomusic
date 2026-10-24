import type { CatalogAlbum, CatalogArtist, CatalogPlaylist, CatalogTrack } from '../types';

export type Raw = Record<string, unknown>;
export const record = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
export const rows = (value: unknown): Raw[] => (Array.isArray(value) ? value.map(record) : []);
export const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
export const num = (value: unknown) => (value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : undefined);

export const SOURCE = 'qq' as const;

/** QQ hosts artwork by mid with the size baked into the path. */
export const albumCover = (mid: unknown, size = 300) => (text(mid) ? `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${text(mid)}.jpg` : undefined);
export const singerAvatar = (mid: unknown, size = 300) => (text(mid) ? `https://y.gtimg.cn/music/photo_new/T001R${size}x${size}M000${text(mid)}.jpg` : undefined);

/** Some endpoints return http artwork; the renderer only loads https. */
export function https(url: unknown) {
  const value = text(url).replace(/^http:\/\//, 'https://');
  return value.startsWith('https://') ? value : undefined;
}

/**
 * Song id as used by the app: "<mid>.<numericId>". The mid drives playback
 * and lyrics; the numeric id is what comments, likes and playlists use.
 */
export const songKey = (mid: unknown, id: unknown) => (text(id) ? `${text(mid)}.${text(id)}` : text(mid));
export function splitSongKey(key: string) {
  const [mid, id] = key.split('.');
  return { mid, id: id || undefined };
}

/** Track objects from the unified gateway (`songInfo` / `track` shape). */
export function mapTrack(raw: Raw): CatalogTrack {
  const song = record(raw.songInfo ?? raw.track ?? raw);
  const album = record(song.album);
  const artists = rows(song.singer).map(singer => ({ id: text(singer.mid), name: text(singer.name) })).filter(artist => artist.name);
  const pay = record(song.pay);
  return {
    id: songKey(song.mid, song.id),
    source: SOURCE,
    title: text(song.name ?? song.title) || '未知歌曲',
    artist: artists.map(artist => artist.name).join(' / ') || '未知歌手',
    artists,
    album: text(album.name ?? album.title) || undefined,
    albumId: text(album.mid) || undefined,
    cover: albumCover(album.mid),
    duration: num(song.interval),
    // pay_play 1: playback needs a membership or purchase (a preview clip is still available).
    vip: Number(pay.pay_play) === 1,
  };
}

export function mapPlaylistBasic(raw: Raw, tag?: string): CatalogPlaylist {
  const basic = record(raw.basic ?? raw.Playlist ?? raw);
  const inner = record(basic.basic ?? basic);
  const cover = record(inner.cover);
  const creator = record(inner.creator);
  return {
    id: text(inner.tid ?? inner.dissid ?? inner.id),
    source: SOURCE,
    name: text(inner.title ?? inner.dissname ?? inner.name),
    cover: https(cover.default_url ?? cover.big_url ?? inner.imgurl ?? inner.picurl),
    trackCount: num(inner.song_cnt ?? inner.song_count ?? inner.songnum),
    playCount: num(inner.play_cnt ?? inner.listennum),
    creator: text(creator.nick ?? creator.name) || undefined,
    tag,
  };
}

export function mapAlbum(raw: Raw): CatalogAlbum {
  const singers = rows(raw.singers ?? raw.singer_list ?? raw.singer).map(item => text(item.name ?? item.singer_name)).filter(Boolean);
  const mid = text(raw.albumMid ?? raw.mid ?? raw.albumMID ?? raw.album_mid);
  const date = text(raw.publishDate ?? raw.release_time ?? raw.publicTime ?? raw.publish_date);
  return {
    id: mid,
    source: SOURCE,
    name: text(raw.albumName ?? raw.name ?? raw.album_name),
    artist: singers.join(' / ') || text(raw.singerName ?? raw.singer_name) || '未知歌手',
    cover: albumCover(mid),
    trackCount: num(raw.totalNum ?? raw.song_count ?? raw.songNum),
    publishTime: date ? Date.parse(date) || undefined : undefined,
  };
}

export function mapArtist(raw: Raw): CatalogArtist {
  const mid = text(raw.singer_mid ?? raw.singerMID ?? raw.mid);
  return {
    id: mid,
    source: SOURCE,
    name: text(raw.singer_name ?? raw.singerName ?? raw.name),
    avatar: https(raw.singer_pic ?? raw.singerPic ?? raw.pic)?.replace(/\.webp$/, '.jpg') ?? singerAvatar(mid),
    songCount: num(raw.songNum ?? raw.song_num),
    albumCount: num(raw.albumNum ?? raw.album_num),
  };
}
