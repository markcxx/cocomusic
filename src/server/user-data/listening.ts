import type { DatabaseSync } from 'node:sqlite';
import { parseRow, readValue, transaction, writeValue } from '../db/sql';
import { isPlayable, type Track } from '../../types/music';
import { POSITION_KEY, QUEUE_KEY } from './legacy';
import { sanitizeTracks } from './tracks';
import { QUEUE_LIMIT, RECENT_PLAYS_LIMIT, type PlayerSnapshot, type RecentPlay } from './types';

/* ───────── 最近播放 ───────── */

export function listRecentPlays(db: DatabaseSync): RecentPlay[] {
  return (db.prepare('SELECT track, played_at, count FROM recent_plays ORDER BY played_at DESC, rowid DESC LIMIT ?').all(RECENT_PLAYS_LIMIT) as Array<{ track: string; played_at: number; count: number }>)
    .flatMap(row => {
      const track = parseRow<Track>(row.track);
      return track ? [{ track, playedAt: Number(row.played_at), count: Number(row.count) }] : [];
    });
}

/** A song started playing: move it to the top, count the play, keep the newest entries only. */
export function recordPlay(db: DatabaseSync, track: Track, playedAt = Date.now()) {
  transaction(db, () => {
    db.prepare(`INSERT INTO recent_plays (track_id, track, played_at, count) VALUES (?, ?, ?, 1)
      ON CONFLICT (track_id) DO UPDATE SET track = excluded.track, played_at = excluded.played_at, count = count + 1`)
      .run(track.id, JSON.stringify(track), playedAt);
    db.prepare('DELETE FROM recent_plays WHERE track_id NOT IN (SELECT track_id FROM recent_plays ORDER BY played_at DESC, rowid DESC LIMIT ?)').run(RECENT_PLAYS_LIMIT);
  });
}

/** One entry, or all of them without `trackId`. */
export function removeRecentPlays(db: DatabaseSync, trackId?: string) {
  if (trackId) db.prepare('DELETE FROM recent_plays WHERE track_id = ?').run(trackId);
  else db.exec('DELETE FROM recent_plays');
}

/* ───────── Play queue ───────── */

export function readPlayer(db: DatabaseSync): PlayerSnapshot {
  const saved = readValue<{ queue?: unknown; currentId?: unknown }>(db, QUEUE_KEY);
  const position = readValue<{ id?: unknown; t?: unknown }>(db, POSITION_KEY);
  return {
    queue: sanitizeTracks(saved?.queue, QUEUE_LIMIT).filter(isPlayable),
    currentId: typeof saved?.currentId === 'string' ? saved.currentId : undefined,
    position: typeof position?.id === 'string' && typeof position.t === 'number' ? { id: position.id, t: position.t } : undefined,
  };
}

export function saveQueue(db: DatabaseSync, queue: Track[], currentId?: string) {
  writeValue(db, QUEUE_KEY, { queue: queue.slice(0, QUEUE_LIMIT), currentId });
}

export function savePosition(db: DatabaseSync, position: { id: string; t: number }) {
  writeValue(db, POSITION_KEY, position);
}
