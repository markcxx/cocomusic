import type { CollectionDetail } from '../types';
import { NeteaseError, neteaseRequest } from './client';
import { image, mapTrack, num, record, rows, SOURCE, text, type Raw } from './mappers';

/**
 * Playlist detail returns every track id but only a preview of track bodies,
 * so a page of songs is fetched by id from song/detail.
 */
export async function playlistDetail(id: string, offset: number, limit: number): Promise<CollectionDetail> {
  const data = await neteaseRequest<Raw>('/v6/playlist/detail', { id, n: 100000, s: 0 }, { crypto: 'api' });
  const playlist = record(data.playlist);
  if (!text(playlist.id)) throw new NeteaseError('歌单不存在或未公开', 404);
  const ids = rows(playlist.trackIds).map(item => text(item.id)).filter(Boolean);
  const pageIds = ids.slice(offset, offset + limit);
  const songs = pageIds.length
    ? rows((await neteaseRequest<Raw>('/v3/song/detail', { c: JSON.stringify(pageIds.map(songId => ({ id: Number(songId) }))) })).songs)
    : rows(playlist.tracks).slice(offset, offset + limit);
  // song/detail does not guarantee order; restore the playlist's order.
  const byId = new Map(songs.map(song => [text(song.id), song]));
  const ordered = pageIds.length ? pageIds.map(songId => byId.get(songId)).filter((song): song is Raw => Boolean(song)) : songs;
  const creator = record(playlist.creator);
  const total = num(playlist.trackCount) ?? ids.length;
  return {
    info: {
      kind: 'playlist',
      id: text(playlist.id),
      source: SOURCE,
      name: text(playlist.name),
      cover: image(playlist.coverImgUrl, 600),
      description: text(playlist.description) || undefined,
      owner: text(creator.nickname) ? { name: text(creator.nickname), avatar: image(creator.avatarUrl, 80) } : undefined,
      tags: Array.isArray(playlist.tags) ? playlist.tags.map(text).filter(Boolean) : [],
      trackCount: total,
      playCount: num(playlist.playCount),
      subscribedCount: num(playlist.subscribedCount),
      createdAt: num(playlist.createTime),
      updatedAt: num(playlist.updateTime),
    },
    tracks: ordered.map(song => mapTrack(song)),
    offset,
    hasMore: offset + ordered.length < Math.min(total, ids.length || total),
  };
}

export async function albumDetail(id: string): Promise<CollectionDetail> {
  const data = await neteaseRequest<Raw>(`/v1/album/${encodeURIComponent(id)}`);
  const album = record(data.album);
  if (!text(album.id)) throw new NeteaseError('专辑不存在或已下架', 404);
  const artist = record(album.artist);
  const songs = rows(data.songs);
  return {
    info: {
      kind: 'album',
      id: text(album.id),
      source: SOURCE,
      name: text(album.name),
      cover: image(album.picUrl, 600),
      description: text(album.description) || undefined,
      owner: text(artist.name) ? { name: rows(album.artists).map(item => text(item.name)).filter(Boolean).join(' / ') || text(artist.name), avatar: image(artist.img1v1Url ?? artist.picUrl, 80) } : undefined,
      tags: [text(album.subType), text(album.type)].filter(Boolean),
      trackCount: num(album.size) ?? songs.length,
      createdAt: num(album.publishTime),
      company: text(album.company) || undefined,
    },
    // Album song bodies omit `al.picUrl`; fill from the album.
    tracks: songs.map(song => ({ ...mapTrack(song), cover: image(album.picUrl, 200) })),
    offset: 0,
    hasMore: false,
  };
}
