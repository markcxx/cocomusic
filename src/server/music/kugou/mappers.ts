import type { CatalogAlbum, CatalogArtist, CatalogPlaylist, CatalogTrack } from '../types';

export type Raw = Record<string, unknown>;
export const record = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
export const rows = (value: unknown): Raw[] => (Array.isArray(value) ? value.map(record) : []);
export const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
export const num = (value: unknown) => (value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : undefined);

export const SOURCE = 'kugou' as const;

/** Kugou artwork URLs carry a {size} placeholder; 150/240/400/480/800 are served. */
export function image(url: unknown, size = 400) {
  const value = text(url).replace('{size}', String(size)).replace(/^http:\/\//, 'https://');
  return value.startsWith('https://') ? value : undefined;
}

/**
 * Song id as used by the app: "<hash>.<albumId>.<albumAudioId>". The hash and
 * album id drive the stream URL; album_audio_id (= mixsongid) identifies the
 * song for comments, favourite counts and playlist edits.
 */
export const songKey = (hash: unknown, albumId: unknown, albumAudioId: unknown) => `${text(hash).toLowerCase()}.${text(albumId)}.${text(albumAudioId)}`;
export function splitSongKey(key: string) {
  const [hash, albumId = '', albumAudioId = ''] = key.split('.');
  return { hash: hash.toLowerCase(), albumId, albumAudioId };
}

/** "歌手 - 歌名" (Kugou's file name) → title when no separate field exists. */
const titleFrom = (fileName: string) => {
  const index = fileName.indexOf(' - ');
  return index > 0 ? fileName.slice(index + 3) : fileName;
};

type TrackInput = {
  hash: unknown; albumId: unknown; albumAudioId: unknown; title: unknown; artists: Array<{ id: unknown; name: unknown }>;
  album?: unknown; cover?: unknown; durationMs?: unknown; durationSec?: unknown; vip?: boolean;
};

export function track(input: TrackInput): CatalogTrack {
  const artists = input.artists.map(item => ({ id: text(item.id), name: text(item.name) })).filter(item => item.name);
  const seconds = num(input.durationSec) ?? (num(input.durationMs) ? Math.round(Number(input.durationMs) / 1000) : undefined);
  return {
    id: songKey(input.hash, input.albumId, input.albumAudioId),
    source: SOURCE,
    title: titleFrom(text(input.title)) || '未知歌曲',
    artist: artists.map(item => item.name).join(' / ') || '未知歌手',
    artists,
    album: text(input.album) || undefined,
    albumId: num(input.albumId) ? text(input.albumId) : undefined,
    cover: image(input.cover, 240),
    duration: seconds,
    vip: input.vip,
  };
}

/** Song shapes from rank/audio, artist audios and album songs. */
export function mapRichSong(raw: Raw): CatalogTrack {
  const base = record(raw.base);
  const audio = record(raw.audio_info);
  const album = record(raw.album_info);
  const authors = rows(raw.authors);
  return track({
    hash: audio.hash_128 ?? audio.hash ?? raw.hash,
    albumId: raw.album_id ?? base.album_id ?? album.album_id,
    albumAudioId: raw.album_audio_id ?? base.album_audio_id ?? raw.audio_id,
    title: raw.songname ?? raw.audio_name ?? base.audio_name ?? raw.filename,
    artists: authors.length ? authors.map(item => ({ id: item.author_id, name: item.author_name })) : [{ id: '', name: raw.author_name ?? base.author_name }],
    album: album.album_name ?? raw.album_name,
    cover: album.sizable_cover ?? album.cover ?? record(raw.trans_param).union_cover,
    durationMs: audio.duration_128 ?? audio.duration ?? raw.timelength,
    vip: Number(record(raw.privilege_download).fail_process) > 0 || Number(raw.pay_type ?? 0) > 0,
  });
}

/** Search hits. */
export function mapSearchSong(raw: Raw): CatalogTrack {
  return track({
    hash: raw.FileHash, albumId: raw.AlbumID, albumAudioId: raw.MixSongID,
    title: raw.OriSongName ?? raw.SongName ?? raw.FileName,
    artists: rows(raw.Singers).map(item => ({ id: item.id, name: item.name })),
    album: raw.AlbumName, cover: raw.Image, durationSec: raw.Duration,
    vip: Number(raw.PayType) > 0,
  });
}

/** Playlist track (pubsongs get_other_list_file_nofilt). */
export function mapListSong(raw: Raw): CatalogTrack {
  const album = record(raw.albuminfo);
  return track({
    hash: raw.hash, albumId: raw.album_id ?? album.id, albumAudioId: raw.mixsongid ?? raw.audio_id,
    title: raw.name, artists: rows(raw.singerinfo).map(item => ({ id: item.id, name: item.name })),
    album: album.name, cover: raw.cover, durationMs: raw.timelen,
  });
}

export function mapPlaylist(raw: Raw, tag?: string): CatalogPlaylist {
  return {
    id: text(raw.global_collection_id ?? raw.gid ?? raw.specialid),
    source: SOURCE,
    name: text(raw.specialname ?? raw.name),
    cover: image(raw.flexible_cover ?? raw.imgurl ?? raw.img ?? raw.pic, 400),
    trackCount: num(raw.song_count ?? raw.songcount ?? raw.count),
    playCount: num(raw.play_count ?? raw.playcount),
    creator: text(raw.nickname ?? raw.list_create_username) || undefined,
    tag: tag || text(rows(raw.tags)[0]?.tag_name) || undefined,
  };
}

export function mapAlbum(raw: Raw): CatalogAlbum {
  const date = text(raw.publish_date ?? raw.publishtime ?? raw.publish_time);
  return {
    id: text(raw.album_id ?? raw.albumid),
    source: SOURCE,
    name: text(raw.album_name ?? raw.albumname),
    artist: text(raw.author_name ?? raw.singername ?? raw.singer) || '未知歌手',
    cover: image(raw.sizable_cover ?? raw.imgurl ?? raw.img, 400),
    trackCount: num(raw.songcount ?? raw.song_count),
    publishTime: date ? Date.parse(date.slice(0, 10)) || undefined : undefined,
  };
}

export function mapArtist(raw: Raw): CatalogArtist {
  return {
    id: text(raw.singerid ?? raw.AuthorId ?? raw.author_id),
    source: SOURCE,
    name: text(raw.singername ?? raw.AuthorName ?? raw.author_name),
    avatar: image(raw.imgurl ?? raw.Avatar ?? raw.sizable_avatar, 400),
    songCount: num(raw.AudioCount ?? raw.song_count),
    albumCount: num(raw.AlbumCount ?? raw.album_count),
  };
}
