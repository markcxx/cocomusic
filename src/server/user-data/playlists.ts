import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { CatalogError } from '../music/errors';
import { parseRow, transaction } from '../db/sql';
import type { Track } from '../../types/music';
import { PLAYLIST_NAME_MAX, PLAYLIST_TRACK_LIMIT, type LocalPlaylist, type LocalPlaylistSummary, type PlaylistOrigin } from './types';

/** 本地歌单 storage. Mutations throw CatalogError with a user-facing message. */

const SUMMARY = `
  SELECT p.id, p.name, p.description, p.origin, p.created_at, p.updated_at,
    COALESCE(p.cover, (
      SELECT json_extract(t.track, '$.cover') FROM playlist_tracks t
      WHERE t.playlist_id = p.id AND json_extract(t.track, '$.cover') IS NOT NULL
      ORDER BY t.position LIMIT 1
    )) AS cover,
    (SELECT count(*) FROM playlist_tracks t WHERE t.playlist_id = p.id) AS track_count
  FROM playlists p`;

type SummaryRow = { id: string; name: string; description: string | null; origin: string | null; cover: string | null; created_at: number; updated_at: number; track_count: number };

const toSummary = (row: SummaryRow): LocalPlaylistSummary => ({
  id: row.id,
  name: row.name,
  description: row.description ?? undefined,
  cover: row.cover ?? undefined,
  origin: parseRow<PlaylistOrigin>(row.origin) ?? undefined,
  trackCount: Number(row.track_count),
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
});

const cleanName = (name: string) => {
  const value = name.trim().slice(0, PLAYLIST_NAME_MAX);
  if (!value) throw new CatalogError('请输入歌单名称', 400);
  return value;
};

/** Newest first, like the platforms' own lists. */
export function listPlaylists(db: DatabaseSync): LocalPlaylistSummary[] {
  return (db.prepare(`${SUMMARY} ORDER BY p.created_at DESC, p.rowid DESC`).all() as SummaryRow[]).map(toSummary);
}

export function playlistSummary(db: DatabaseSync, id: string): LocalPlaylistSummary {
  const row = db.prepare(`${SUMMARY} WHERE p.id = ?`).get(id) as SummaryRow | undefined;
  if (!row) throw new CatalogError('歌单不存在或已被删除', 404);
  return toSummary(row);
}

export function getPlaylist(db: DatabaseSync, id: string): LocalPlaylist {
  const summary = playlistSummary(db, id);
  const tracks = (db.prepare('SELECT track FROM playlist_tracks WHERE playlist_id = ? ORDER BY position').all(id) as Array<{ track: string }>)
    .map(row => parseRow<Track>(row.track))
    .filter((track): track is Track => Boolean(track));
  return { ...summary, tracks };
}

const touch = (db: DatabaseSync, id: string) => db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), id);

/** Append songs not already listed, in order, up to the track limit. Returns how many were new. */
export function addTracks(db: DatabaseSync, id: string, tracks: Track[]): number {
  return transaction(db, () => {
    playlistSummary(db, id);
    const { count, last } = db.prepare('SELECT count(*) AS count, max(position) AS last FROM playlist_tracks WHERE playlist_id = ?').get(id) as { count: number; last: number | null };
    const insert = db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, track) VALUES (?, ?, ?, ?)');
    let position = (last ?? -1) + 1;
    let added = 0;
    for (const track of tracks) {
      if (Number(count) + added >= PLAYLIST_TRACK_LIMIT) break;
      if (Number(insert.run(id, track.id, position, JSON.stringify(track)).changes)) { added += 1; position += 1; }
    }
    if (added) touch(db, id);
    return added;
  });
}

export function createPlaylist(db: DatabaseSync, input: { name: string; description?: string; cover?: string; origin?: PlaylistOrigin; tracks?: Track[] }): LocalPlaylistSummary {
  return transaction(db, () => {
    const id = randomUUID();
    const now = Date.now();
    db.prepare('INSERT INTO playlists (id, name, description, cover, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, cleanName(input.name), input.description?.trim() || null, input.cover ?? null, input.origin ? JSON.stringify(input.origin) : null, now, now);
    addTracks(db, id, input.tracks ?? []);
    return playlistSummary(db, id);
  });
}

export function renamePlaylist(db: DatabaseSync, id: string, name: string): LocalPlaylistSummary {
  const value = cleanName(name);
  if (!Number(db.prepare('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?').run(value, Date.now(), id).changes)) throw new CatalogError('歌单不存在或已被删除', 404);
  return playlistSummary(db, id);
}

/** Songs go with it (cascade); the songs themselves and local files are untouched. */
export function deletePlaylist(db: DatabaseSync, id: string) {
  db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
}

export function removeTracks(db: DatabaseSync, id: string, trackIds: string[]): LocalPlaylistSummary {
  return transaction(db, () => {
    playlistSummary(db, id);
    const remove = db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?');
    let removed = 0;
    for (const trackId of trackIds) removed += Number(remove.run(id, trackId).changes);
    if (removed) touch(db, id);
    return playlistSummary(db, id);
  });
}
